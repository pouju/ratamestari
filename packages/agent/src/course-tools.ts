import { z } from 'zod'
import type { Course } from '@ratamestari/engine'
import {
  courseRequestSchema,
  courseTargetFor,
  type CourseRequest,
  type CourseTarget,
  type Source,
} from '@ratamestari/rules'
import { summarizeCourse } from './course-summary'
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

export interface CourseWorkspace {
  status(): WorkspaceStatus
  generateCourse(request: CourseRequest, options: GenerateOptions): Promise<Course | null>
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
        if (!status.hasCompetitionCentre)
          return 'The competition centre is not set. Ask the user to click it on the map with "Set competition centre"; the finish goes there.'
        const request = courseRequestSchema.parse(requestInput)
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
