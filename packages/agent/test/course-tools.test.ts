import { describe, expect, it } from 'vitest'
import type { CourseRequest } from '@ratamestari/rules'
import {
  createCourseTools,
  type CourseWorkspace,
  type GenerateOptions,
  type MapSymbolInfo,
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
  const shownRequests: CourseRequest[] = []
  const replacements: { controlNumber: number; preference: string }[] = []
  const symbols: MapSymbolInfo[] = [
    { symbol: '502.0', name: 'Moottoritie', objects: 12, isomCode: '502', corrected: false },
  ]
  const workspace: CourseWorkspace = {
    status: () => ({ ...READY, ...status }),
    generateCourse: async (request, options) => {
      calls.push({ request, options })
      return COURSE
    },
    showRequest: request => {
      shownRequests.push(request)
    },
    replaceControl: async (_course, controlNumber, preference) => {
      replacements.push({ controlNumber, preference })
      return {
        ...COURSE,
        controls: COURSE.controls.map((site, i) =>
          i === controlNumber - 1
            ? { ...site, id: 99, isomCode: '112', placement: 'point', contourForm: null }
            : site,
        ),
        findings: [],
      }
    },
    mapSymbols: () => symbols,
    correctSymbol: async (symbol, isomCode) => {
      const index = symbols.findIndex(s => s.symbol === symbol)
      symbols[index] = {
        ...symbols[index]!,
        isomCode: isomCode === undefined ? '502' : isomCode,
        corrected: isomCode !== undefined,
      }
    },
  }
  const tools = Object.fromEntries(createCourseTools(workspace).map(tool => [tool.name, tool]))
  return { tools, calls, shownRequests, symbols, replacements }
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

  it('asks for the competition centre and leaves the request for the Set course button', async () => {
    const { tools, calls, shownRequests } = workspaceWith({ hasCompetitionCentre: false })
    const reply = await tools.generate_course!.run(H21_LONG_SM)
    expect(reply).toMatch(/competition centre/)
    expect(reply).toMatch(/"Set course"/)
    expect(calls).toHaveLength(0)
    expect(shownRequests).toEqual([H21_LONG_SM])
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

describe('map symbol tools', () => {
  it('lists symbols with what they mean for the course', async () => {
    const { tools } = workspaceWith()
    const [symbol] = JSON.parse(await tools.list_map_symbols!.run({}))
    expect(symbol).toMatchObject({ symbol: '502.0', name: 'Moottoritie', isomName: 'Wide road' })
    expect(symbol.effect).toMatch(/easy running/)
  })

  it('corrects a symbol and reports its new effect', async () => {
    const { tools, symbols } = workspaceWith()
    const result = JSON.parse(
      await tools.correct_map_symbol!.run({ symbol: '502.0', isomCode: '520' }),
    )
    expect(symbols[0]!.isomCode).toBe('520')
    expect(result.effect).toMatch(/^forbidden to enter/)
    expect(result.courseCleared).toBe(true)
  })

  it('refuses unknown symbols and ISOM codes', async () => {
    const { tools, symbols } = workspaceWith()
    expect(await tools.correct_map_symbol!.run({ symbol: '999.0', isomCode: '520' })).toMatch(
      /no symbol/,
    )
    expect(await tools.correct_map_symbol!.run({ symbol: '502.0', isomCode: '777' })).toMatch(
      /not an ISOM/,
    )
    expect(symbols[0]!.isomCode).toBe('502')
  })
})

describe('course editing tools', () => {
  it('replaces a control as asked and tells what changed', async () => {
    const { tools, replacements } = workspaceWith({ course: COURSE })
    const result = JSON.parse(
      await tools.replace_control!.run({ control: 2, preference: 'harder' }),
    )
    expect(replacements).toEqual([{ controlNumber: 2, preference: 'harder' }])
    expect(result.changed).toBe(true)
    expect(result.after.feature).toBe('Pit')
  })

  it('fixes rule problems until none are left', async () => {
    const { tools, replacements } = workspaceWith({ course: COURSE })
    const result = JSON.parse(await tools.fix_rule_problems!.run({}))
    expect(replacements).toEqual([{ controlNumber: 2, preference: 'best' }])
    expect(result.problemsBefore).toHaveLength(1)
    expect(result.course.ruleProblems).toEqual([])
  })

  it('asks for a course first', async () => {
    const { tools } = workspaceWith()
    expect(await tools.replace_control!.run({ control: 1 })).toMatch(/no course/)
  })
})
