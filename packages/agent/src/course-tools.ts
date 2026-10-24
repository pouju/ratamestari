import { z } from 'zod'
import {
  COMPASS_DIRECTIONS,
  type CompassDirection,
  type Course,
  type CourseSuggestion,
  type ReplacementPreference,
  type StartWish,
} from '@ratamestari/engine'
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
  readonly startDistanceFromFinishMeters: readonly [number, number] | null
  readonly course: Course | null
  // The leg the user selected on the map: from stop selectedLeg (0 = start) to the next stop.
  readonly selectedLeg: number | null
  readonly undoSteps: number
}

export interface GenerateOptions {
  readonly option?: number
  readonly winnerPaceSecondsPerKm?: number
  // null drops an earlier wish; undefined keeps it.
  readonly startDistanceFromFinishMeters?: readonly [number, number] | null
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
    direction?: CompassDirection | null,
  ): Promise<Course | null>
  removeControl(course: Course, controlNumber: number): Promise<Course | null>
  insertControl(course: Course, afterStop: number): Promise<Course | null>
  moveStart(course: Course, wish: StartWish): Promise<Course | null>
  suggestChanges(course: Course): Promise<readonly CourseSuggestion[]>
  applyCourse(course: Course): void
  // null when there is nothing to undo or the app is busy with another edit.
  undo(): { readonly course: Course | null } | null
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
const MAX_START_DISTANCE_METERS = 3000
const NO_COURSE = 'There is no course yet. Generate one first.'

const directionField = z.enum(COMPASS_DIRECTIONS).describe('Compass direction on the map, north up')

const stopName = (stop: number, controlCount: number) =>
  stop === 0 ? 'start' : stop === controlCount + 1 ? 'finish' : `control ${stop}`

const legName = (leg: number, controlCount: number) =>
  `${stopName(leg, controlCount)} to ${stopName(leg + 1, controlCount)}`

// What changed in the course, in the words and numbers the assistant may see (D3).
const courseChange = (before: Course, after: Course) => {
  const [was, now] = [summarizeCourse(before), summarizeCourse(after)]
  return {
    controlCount: { before: was.controlCount, after: now.controlCount },
    estimatedWinningMinutes: {
      before: was.estimatedWinningMinutes,
      after: now.estimatedWinningMinutes,
      target: now.targetWinningMinutes,
    },
    ruleProblems: { before: was.ruleProblems.length, after: now.ruleProblems },
  }
}
const AUTOMATIC = 'automatic'
const IGNORE = 'none'

const describeSuggestion = (course: Course, { kind, stop, course: changed }: CourseSuggestion) => {
  const controls = summarizeCourse(changed).controls
  if (kind === 'remove') return { action: `remove control ${stop}` }
  if (kind === 'replace') {
    return {
      action: `move control ${stop}`,
      from: summarizeCourse(course).controls[stop - 1]!.feature,
      to: controls[stop - 1]!.feature,
    }
  }
  return {
    action: `add a control on the leg ${legName(stop, course.controls.length)}`,
    newControl: controls[stop]!.feature,
  }
}

export function createCourseTools(workspace: CourseWorkspace): AgentTool[] {
  let lastSuggestions: {
    course: Course
    suggestions: readonly CourseSuggestion[]
  } | null = null
  return [
    defineTool({
      name: 'get_workspace',
      description:
        'Tells whether a map is open, its scale, whether the competition centre is set, the current course request, the winner pace, the start wish, the leg the user has selected on the map, and a summary of the current course. Call it before answering questions about the current state, and when the user says "here", "this leg" or "this control".',
      inputSchema: z.object({}),
      run: async () => {
        const { course, selectedLeg, ...status } = workspace.status()
        return json({
          ...status,
          selectedLeg:
            course && selectedLeg !== null ? legName(selectedLeg, course.controls.length) : null,
          course: course && summarizeCourse(course),
        })
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
        'Moves one control of the current course to another control site within about 400 m, chosen by the engine: the best by the rules, a harder or easier site, or one in a compass direction ("move 5 north"). Returns the old and new control and the course summary.',
      inputSchema: z.object({
        control: z.int().min(1).describe('Control number on the course'),
        preference: z
          .enum(['best', 'harder', 'easier'])
          .default('best')
          .describe('best = best by the rules; harder or easier than the current control'),
        direction: directionField.optional().describe('Move the control this way, north up'),
      }),
      run: async ({ control, preference, direction }) => {
        const before = workspace.status().course
        if (!before) return NO_COURSE
        if (control > before.controls.length) {
          return `The course has only ${before.controls.length} controls.`
        }
        const after = await workspace.replaceControl(before, control, preference, direction)
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
        if (!course) return NO_COURSE
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
        startDistanceFromFinishMeters: z
          .object({
            min: z.int().min(0).max(MAX_START_DISTANCE_METERS),
            max: z.int().min(0).max(MAX_START_DISTANCE_METERS),
          })
          .nullable()
          .optional()
          .describe(
            'Where the user wants the start, as straight-line metres from the finish (the competition centre), e.g. {min: 0, max: 200} for "start near the centre" or {min: 800, max: 1500} for "start far away". The wish stays for later courses. Omit to keep the current wish; null to let the engine choose (5-20% of the winning time from the finish).',
          ),
      }),
      run: async ({
        winnerPaceSecondsPerKm,
        option,
        startDistanceFromFinishMeters,
        ...requestInput
      }) => {
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
          ...(startDistanceFromFinishMeters !== undefined && {
            startDistanceFromFinishMeters:
              startDistanceFromFinishMeters &&
              ([
                Math.min(startDistanceFromFinishMeters.min, startDistanceFromFinishMeters.max),
                Math.max(startDistanceFromFinishMeters.min, startDistanceFromFinishMeters.max),
              ] as const),
          }),
        })
        if (!course) return 'The engine could not find a course for this request on this map.'
        return json({ rules: targetFacts(target), course: summarizeCourse(course) })
      },
    }),
    defineTool({
      name: 'remove_control',
      description:
        'Removes one control from the current course; the controls after it are renumbered. The engine re-measures the course and re-checks the rules. Returns what changed and the course summary.',
      inputSchema: z.object({
        control: z.int().min(1).describe('Control number on the course'),
      }),
      run: async ({ control }) => {
        const before = workspace.status().course
        if (!before) return NO_COURSE
        if (control > before.controls.length) {
          return `The course has only ${before.controls.length} controls.`
        }
        const after = await workspace.removeControl(before, control)
        if (!after) return 'The control could not be removed.'
        return json({ change: courseChange(before, after), course: summarizeCourse(after) })
      },
    }),
    defineTool({
      name: 'insert_control',
      description:
        'Adds a control on one leg of the current course, at the site the engine finds best by the rules. The leg is given by the stop it leaves: 0 = the leg from the start, 3 = the leg from control 3 to control 4 (or to the finish if 3 is the last control). Controls after it are renumbered. If the user says "here" or "this leg", call get_workspace for the selected leg first.',
      inputSchema: z.object({
        afterStop: z.int().min(0).describe('The stop the leg leaves: 0 = start, n = control n'),
      }),
      run: async ({ afterStop }) => {
        const before = workspace.status().course
        if (!before) return NO_COURSE
        if (afterStop > before.controls.length) {
          return `The course has only ${before.controls.length} controls; use 0 to ${before.controls.length}.`
        }
        const after = await workspace.insertControl(before, afterStop)
        if (!after) return 'No control site was found on that leg.'
        return json({
          inserted: summarizeCourse(after).controls[afterStop],
          change: courseChange(before, after),
          course: summarizeCourse(after),
        })
      },
    }),
    defineTool({
      name: 'move_start',
      description:
        'Moves the start of the current course to another clear site chosen by the engine: within a straight-line distance range from the finish (the competition centre), and/or in a compass direction from the current start. The controls stay. Returns the new start and the course summary.',
      inputSchema: z.object({
        minMetersFromFinish: z.int().min(0).max(MAX_START_DISTANCE_METERS).optional(),
        maxMetersFromFinish: z.int().min(0).max(MAX_START_DISTANCE_METERS).optional(),
        direction: directionField.optional().describe('Move the start this way, north up'),
      }),
      run: async ({ minMetersFromFinish, maxMetersFromFinish, direction }) => {
        const before = workspace.status().course
        if (!before) return NO_COURSE
        const hasDistance = minMetersFromFinish !== undefined || maxMetersFromFinish !== undefined
        if (!hasDistance && !direction) return 'Give a distance from the finish or a direction.'
        const low = minMetersFromFinish ?? 0
        const high = maxMetersFromFinish ?? MAX_START_DISTANCE_METERS
        const wish: StartWish = {
          ...(hasDistance && {
            distanceFromFinishMeters: [Math.min(low, high), Math.max(low, high)] as const,
          }),
          ...(direction && { direction }),
        }
        const after = await workspace.moveStart(before, wish)
        if (!after) return 'No clear site for the start was found there.'
        return json({
          start: { before: summarizeCourse(before).start, after: summarizeCourse(after).start },
          change: courseChange(before, after),
          course: summarizeCourse(after),
        })
      },
    }),
    defineTool({
      name: 'undo',
      description:
        'Undoes the last change to the course, one step at a time: a control or the start dragged on the map, an edit made by hand, or a change made from the chat (replace, remove, insert, move start, apply suggestion). A newly set course is not a step. Returns the course as it is after the undo and how many steps are left.',
      inputSchema: z.object({}),
      run: async () => {
        const { course: before, undoSteps } = workspace.status()
        if (undoSteps === 0) return 'There is nothing to undo.'
        const undone = workspace.undo()
        if (!undone) return 'The app is busy with another change. Try again in a moment.'
        const { course } = undone
        return json({
          stepsLeft: undoSteps - 1,
          ...(before && course && { change: courseChange(before, course) }),
          course: course && summarizeCourse(course),
        })
      },
    }),
    defineTool({
      name: 'suggest_changes',
      description:
        'Asks the engine for up to five changes that make the current course better by the rules: replacing, removing or adding a control. Nothing changes yet. Returns numbered suggestions with their effect on rule problems and winning time; present them to the user and apply the ones they choose with apply_suggestion.',
      inputSchema: z.object({}),
      run: async () => {
        const course = workspace.status().course
        if (!course) return NO_COURSE
        const suggestions = await workspace.suggestChanges(course)
        lastSuggestions = { course, suggestions }
        if (suggestions.length === 0) {
          return 'The engine found no change that makes this course better by the rules.'
        }
        return json(
          suggestions.map((suggestion, i) => ({
            number: i + 1,
            ...describeSuggestion(course, suggestion),
            change: courseChange(course, suggestion.course),
          })),
        )
      },
    }),
    defineTool({
      name: 'apply_suggestion',
      description:
        'Applies one suggestion from the latest suggest_changes to the current course and draws it. Suggestions are for the course they were made for; after any other change, ask for new ones.',
      inputSchema: z.object({
        number: z.int().min(1).describe('Suggestion number from suggest_changes'),
      }),
      run: async ({ number }) => {
        const course = workspace.status().course
        if (!lastSuggestions || lastSuggestions.course !== course) {
          return 'The course has changed since the suggestions were made. Call suggest_changes again.'
        }
        const suggestion = lastSuggestions.suggestions[number - 1]
        if (!suggestion) return `There are only ${lastSuggestions.suggestions.length} suggestions.`
        workspace.applyCourse(suggestion.course)
        lastSuggestions = null
        return json({
          applied: describeSuggestion(course, suggestion),
          course: summarizeCourse(suggestion.course),
        })
      },
    }),
  ]
}
