import { describe, expect, it } from 'vitest'
import { describeSite, summarizeCourse } from '../src/course-summary'
import { COURSE, site } from './fixtures'

describe('summarizeCourse', () => {
  it('describes controls in words with leg distances and times', () => {
    const summary = summarizeCourse(COURSE)
    expect(summary.controlCount).toBe(2)
    expect(summary.estimatedWinningMinutes).toBe(7)
    expect(summary.targetWinningMinutes).toBe(7.5)
    expect(summary.lengthKilometers).toBe(1.2)
    expect(summary.climbMeters).toBe(40)
    expect(summary.ruleProblems).toEqual(['Control 1 and control 2 are too close together'])
    expect(summary.controls[0]).toEqual({
      number: 1,
      feature: 'Boulder',
      technicalDifficulty: 4,
      legStraightMeters: 500,
      legDirection: 'NE',
      legMinutes: 2.5,
    })
    expect(summary.controls[1]!.feature).toBe('Re-entrant')
    expect(summary.finishLeg).toEqual({ straightMeters: 600, direction: 'W', minutes: 3 })
  })

  it('tells how far and which way the start is from the finish', () => {
    expect(summarizeCourse(COURSE).start).toEqual({
      feature: 'Path',
      straightMetersFromFinish: 400,
      directionFromFinish: 'S',
    })
  })

  it('never contains map coordinates (D3)', () => {
    const text = JSON.stringify(summarizeCourse(COURSE))
    for (const value of ['1234.5', '2345.5', '1534.5', '2745.5', '1834.5']) {
      expect(text).not.toContain(value)
    }
  })
})

describe('describeSite', () => {
  it('uses the IOF description wording', () => {
    expect(
      describeSite(
        site(0, 0, {
          isomCode: '505',
          placement: 'lineEnd',
          orientation: { kind: 'end', pointingRadians: Math.PI },
        }),
      ),
    ).toBe('Path, west end')
  })
})
