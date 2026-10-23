import { describe, expect, it } from 'vitest'
import type { CourseRequest } from '@ratamestari/rules'
import {
  createCourseTools,
  type CourseWorkspace,
  type GenerateOptions,
  type WorkspaceStatus,
} from '../src/course-tools'
import { COURSE, H21_LONG_SM } from './fixtures'

const READY: WorkspaceStatus = {
  mapLoaded: true,
  mapScale: 15000,
  hasCompetitionCentre: true,
  request: H21_LONG_SM,
  winnerPaceSecondsPerKm: 300,
  course: null,
}

function workspaceWith(status: Partial<WorkspaceStatus> = {}) {
  const calls: { request: CourseRequest; options: GenerateOptions }[] = []
  const workspace: CourseWorkspace = {
    status: () => ({ ...READY, ...status }),
    generateCourse: async (request, options) => {
      calls.push({ request, options })
      return COURSE
    },
  }
  const tools = Object.fromEntries(createCourseTools(workspace).map(tool => [tool.name, tool]))
  return { tools, calls }
}

describe('generate_course', () => {
  it('generates with the requested class and options and returns a summary', async () => {
    const { tools, calls } = workspaceWith()
    const result = JSON.parse(
      await tools.generate_course!.run({
        eventLevel: 'national',
        format: 'middle',
        sex: 'D',
        ageClass: 45,
        option: 2,
      }),
    )
    expect(calls).toEqual([
      {
        request: {
          eventLevel: 'national',
          format: 'middle',
          sex: 'D',
          ageClass: 45,
          skillLetter: 'A',
        },
        options: { option: 2 },
      },
    ])
    expect(result.rules.winningTimeMinutes).toEqual({ min: 30, max: 35, aimedAt: 32.5 })
    expect(result.rules.sources).toContain('Lajisäännöt 2026 11.25')
    expect(result.course.controlCount).toBe(2)
  })

  it('asks for the competition centre before generating', async () => {
    const { tools, calls } = workspaceWith({ hasCompetitionCentre: false })
    expect(await tools.generate_course!.run(H21_LONG_SM)).toMatch(/competition centre/)
    expect(calls).toHaveLength(0)
  })

  it('refuses classes that have no winning time in the rules config', async () => {
    const { tools, calls } = workspaceWith()
    const result = await tools.generate_course!.run({ ...H21_LONG_SM, ageClass: 10 })
    expect(result).toMatch(/no winning time/)
    expect(calls).toHaveLength(0)
  })

  it('rejects input that does not match the schema', async () => {
    const { tools } = workspaceWith()
    await expect(tools.generate_course!.run({ ...H21_LONG_SM, ageClass: 22 })).rejects.toThrow()
  })
})

describe('class_rules', () => {
  it('returns rule values with their sources', async () => {
    const { tools } = workspaceWith()
    const rules = JSON.parse(await tools.class_rules!.run(H21_LONG_SM))
    expect(rules.winningTimeMinutes).toEqual({ min: 85, max: 95, aimedAt: 90 })
    expect(rules.skillColour).toBe('black')
    expect(rules.sources).toContain('Lajisäännöt 2026 19.41')
  })
})

describe('get_workspace', () => {
  it('reports the state with the course as a summary', async () => {
    const { tools } = workspaceWith({ course: COURSE })
    const status = JSON.parse(await tools.get_workspace!.run({}))
    expect(status.hasCompetitionCentre).toBe(true)
    expect(status.course.controlCount).toBe(2)
  })
})
