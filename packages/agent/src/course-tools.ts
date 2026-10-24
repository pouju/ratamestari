import { z } from 'zod'
import type { Course, ReplacementPreference } from '@ratamestari/engine'
import {
  courseRequestSchema,
  courseTargetFor,
  isomSymbolRule,
  type CourseRequest,
  type CourseTarget,
  type Source,
} from '@ratamestari/rules'
import { summarizeCourse } from './course-summary'
import { isomEffect } from './map-symbols'
import { describeFinding } from './rule-findings'
import { defineTool, type AgentTool } from './llm-provider'

export interface WorkspaceStatus {
  readonly mapLoaded: boolean
  readonly mapScale: number | null
  readonly hasCompetitionCentre: boolean
  readonly request: CourseRequest
  readonly winnerPaceSecondsPerKm: number | null
  readonly course: Course | null
}

export interface GenerateOptions {
  readonly option?: number
  readonly winnerPaceSecondsPerKm?: number
}

export interface MapSymbolInfo {
  readonly symbol: string
  readonly name: string
  readonly objects: number
  readonly isomCode: string | null
  readonly corrected: boolean
}

export interface CourseWorkspace {
  status(): WorkspaceStatus
  generateCourse(request: CourseRequest, options: GenerateOptions): Promise<Course | null>
  showRequest(request: CourseRequest): void
  replaceControl(
    course: Course,
    controlNumber: number,
    preference: ReplacementPreference,
  ): Promise<Course | null>
  mapSymbols(): readonly MapSymbolInfo[]
  correctSymbol(symbol: string, isomCode: string | null | undefined): Promise<void>
}

const MIN_PACE_SECONDS_PER_KM = 120
const MAX_PACE_SECONDS_PER_KM = 900

const citation = ({ document, section }: Source) => `${document} ${section}`

const targetFacts = (target: CourseTarget) => ({
  winningTimeMinutes: {
    min: target.winningTime.minMinutes,
    max: target.winningTime.maxMinutes,
    aimedAt: target.winningTime.targetMinutes,
  },
  skillColour: target.skillColour,
  controlSiteDifficulty: { min: target.siteDifficulty[0], max: target.siteDifficulty[1] },
  sources: target.sources.map(citation),
  includesOurInterpretation: target.interpretation,
})

const NO_RULES_FOR_CLASS =
  'The rules config has no winning time for this class at this event level, so no course can be set for it.'

const requestFields = {
  eventLevel: courseRequestSchema.shape.eventLevel.describe(
    'national = national event (kansallinen), finnishChampionship = Finnish championship (SM) final',
  ),
  format: courseRequestSchema.shape.format.describe('Race format: middle or long distance'),
  sex: courseRequestSchema.shape.sex.describe('H = men, D = women'),
  ageClass: courseRequestSchema.shape.ageClass.describe('Age class number, e.g. 21 for H21'),
  skillLetter: courseRequestSchema.shape.skillLetter.describe(
    'Class letter after the age: A (default) or E is the main class, B and C are easier',
  ),
}

const json = (value: unknown) => JSON.stringify(value)

const MAX_FIX_PASSES = 6
const AUTOMATIC = 'automatic'
const IGNORE = 'none'

export function createCourseTools(workspace: CourseWorkspace): AgentTool[] {
  return [
    defineTool({
      name: 'get_workspace',
      description:
        'Tells whether a map is open, its scale, whether the competition centre is set, the current course request, the winner pace and a summary of the current course. Call it before answering questions about the current state.',
      inputSchema: z.object({}),
      run: async () => {
        const { course, ...status } = workspace.status()
        return json({ ...status, course: course && summarizeCourse(course) })
      },
    }),
    defineTool({
      name: 'class_rules',
      description:
        'Looks up the rule values for a class from the rules config: winning time range, skill colour (technical level) and control site difficulty, with the rule sections they come from. Use these sections when you cite rules; never cite a section that no tool gave you.',
      inputSchema: z.object(requestFields),
      run: async input => {
        const target = courseTargetFor(courseRequestSchema.parse(input))
        return target ? json(targetFacts(target)) : NO_RULES_FOR_CLASS
      },
    }),
    defineTool({
      name: 'replace_control',
      description:
        'Moves one control of the current course to another control site within about 400 m, chosen by the engine: the best by the rules, or a harder or easier site. Returns the old and new control and the course summary.',
      inputSchema: z.object({
        control: z.int().min(1).describe('Control number on the course'),
        preference: z
          .enum(['best', 'harder', 'easier'])
          .default('best')
          .describe('best = best by the rules; harder or easier than the current control'),
      }),
      run: async ({ control, preference }) => {
        const before = workspace.status().course
        if (!before) return 'There is no course yet. Generate one first.'
        if (control > before.controls.length) {
          return `The course has only ${before.controls.length} controls.`
        }
        const after = await workspace.replaceControl(before, control, preference)
        if (!after) return 'The control could not be replaced.'
        const describeControlAt = (course: Course) => summarizeCourse(course).controls[control - 1]
        const unchanged = after.controls[control - 1]!.id === before.controls[control - 1]!.id
        return json({
          changed: !unchanged,
          before: describeControlAt(before),
          after: describeControlAt(after),
          course: summarizeCourse(after),
        })
      },
    }),
    defineTool({
      name: 'fix_rule_problems',
      description:
        'Fixes rule problems of the current course by moving the controls involved to better nearby sites, one at a time, until no problem can be improved. Returns the problems before and after.',
      inputSchema: z.object({}),
      run: async () => {
        let course = workspace.status().course
        if (!course) return 'There is no course yet. Generate one first.'
        const before = summarizeCourse(course).ruleProblems
        for (let pass = 0; pass < MAX_FIX_PASSES; pass++) {
          const fixable = course.findings
            .map(finding => describeFinding(finding, course!.controls.length).fixableControl)
            .find(control => control !== null)
          if (fixable === undefined || fixable === null) break
          const fixed = await workspace.replaceControl(course, fixable, 'best')
          if (!fixed || fixed.findings.length >= course.findings.length) break
          course = fixed
        }
        return json({ problemsBefore: before, course: summarizeCourse(course) })
      },
    }),
    defineTool({
      name: 'list_map_symbols',
      description:
        "Lists the OCAD symbols used in the user's map: symbol number, the club's own symbol name (often Finnish), object count, the ISOM 2017-2 symbol it is read as and what that means for running and control sites. Use it to find symbols read wrongly, e.g. a motorway drawn with a road symbol.",
      inputSchema: z.object({}),
      run: async () =>
        json(
          workspace.mapSymbols().map(symbol => ({
            ...symbol,
            isomName: symbol.isomCode && (isomSymbolRule(symbol.isomCode)?.name ?? null),
            effect: isomEffect(symbol.isomCode),
          })),
        ),
    }),
    defineTool({
      name: 'correct_map_symbol',
      description:
        'Changes which ISOM 2017-2 symbol an OCAD symbol of this map is read as. The cost map and control sites are rebuilt and the current course is cleared, so generate the course again afterwards. Only correct symbols the user asked about or agreed to. For example, a motorway that may only be crossed at bridges and tunnels fits 529 (prominent uncrossable line feature), and a forbidden yard fits 520 (out-of-bounds area).',
      inputSchema: z.object({
        symbol: z
          .string()
          .describe('The OCAD symbol number as list_map_symbols gives it, e.g. "502.0"'),
        isomCode: z
          .string()
          .describe(
            `ISOM 2017-2 symbol code such as "520"; "${IGNORE}" to ignore the symbol; "${AUTOMATIC}" to undo a correction`,
          ),
      }),
      run: async ({ symbol, isomCode }) => {
        if (!workspace.mapSymbols().some(s => s.symbol === symbol)) {
          return `The map has no symbol ${symbol}. Use the numbers from list_map_symbols.`
        }
        const code = isomCode === AUTOMATIC ? undefined : isomCode === IGNORE ? null : isomCode
        if (typeof code === 'string' && !isomSymbolRule(code)) {
          return `${isomCode} is not an ISOM 2017-2 symbol the rules config knows.`
        }
        await workspace.correctSymbol(symbol, code)
        const now = workspace.mapSymbols().find(s => s.symbol === symbol)!
        return json({
          symbol,
          readAs: now.isomCode,
          effect: isomEffect(now.isomCode),
          courseCleared: true,
        })
      },
    }),
    defineTool({
      name: 'generate_course',
      description:
        'Sets a course on the open map with the deterministic course engine and draws it for the user. Returns the rule values used and a summary: estimated winning time, length, controls with their features and difficulty, legs and rule-check problems. Takes from a few seconds to a minute.',
      inputSchema: z.object({
        ...requestFields,
        winnerPaceSecondsPerKm: z
          .int()
          .min(MIN_PACE_SECONDS_PER_KM)
          .max(MAX_PACE_SECONDS_PER_KM)
          .optional()
          .describe(
            "The winner's running pace in good forest, seconds per km. Omit to keep the user's current setting.",
          ),
        option: z
          .int()
          .min(1)
          .optional()
          .describe(
            'Course option number. The same number gives the same course; use a different one for another alternative. Omit to keep the current option.',
          ),
      }),
      run: async ({ winnerPaceSecondsPerKm, option, ...requestInput }) => {
        const status = workspace.status()
        if (!status.mapLoaded) return 'No map is open. Ask the user to open an OCAD map first.'
        const request = courseRequestSchema.parse(requestInput)
        if (!status.hasCompetitionCentre) {
          workspace.showRequest(request)
          return 'The competition centre is not set, so no course yet. The request is now filled in the Course panel. Tell the user to click the competition centre on the map (the course starts and finishes near it), then press "Set course", or ask you again.'
        }
        const target = courseTargetFor(request)
        if (!target) return NO_RULES_FOR_CLASS
        const course = await workspace.generateCourse(request, {
          ...(option !== undefined && { option }),
          ...(winnerPaceSecondsPerKm !== undefined && { winnerPaceSecondsPerKm }),
        })
        if (!course) return 'The engine could not find a course for this request on this map.'
        return json({ rules: targetFacts(target), course: summarizeCourse(course) })
      },
    }),
  ]
}
