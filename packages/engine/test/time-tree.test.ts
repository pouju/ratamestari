import { describe, expect, it } from 'vitest'
import { localPoint } from '@ratamestari/core'
import { REFERENCE_PACE_SECONDS_PER_KM } from '@ratamestari/rules'
import { buildCostGrid } from '../src/cost-grid'
import { cellIndexOf } from '../src/raster'
import { findRoute } from '../src/router'
import { secondsFrom } from '../src/time-tree'
import { feature, line, rectangle, SQUARE_KILOMETRE } from './fixtures'

const pace = REFERENCE_PACE_SECONDS_PER_KM.value

describe('secondsFrom', () => {
  const grid = buildCostGrid(
    [feature('410', rectangle(300, 300, 700, 700)), feature('518', line([0, 850], [600, 850]))],
    SQUARE_KILOMETRE,
  )
  const source = localPoint(100, 100)

  it('gives the same times as A* routes', () => {
    const seconds = secondsFrom(grid, source, pace, Number.POSITIVE_INFINITY)
    for (const target of [localPoint(900, 900), localPoint(500, 500), localPoint(100, 950)]) {
      const route = findRoute(grid, source, target)!
      expect(seconds[cellIndexOf(grid, target)!]).toBeCloseTo(route.timeSeconds, 0)
    }
  })

  it('is symmetric, so a tree from the finish gives times to the finish', () => {
    const a = localPoint(150, 120)
    const b = localPoint(880, 760)
    const fromA = secondsFrom(grid, a, pace, Number.POSITIVE_INFINITY)
    const fromB = secondsFrom(grid, b, pace, Number.POSITIVE_INFINITY)
    expect(fromA[cellIndexOf(grid, b)!]).toBeCloseTo(fromB[cellIndexOf(grid, a)!]!, 3)
  })

  it('stops expanding past the time limit', () => {
    const seconds = secondsFrom(grid, source, pace, 60)
    expect(seconds[cellIndexOf(grid, localPoint(900, 900))!]).toBe(Number.POSITIVE_INFINITY)
    expect(seconds[cellIndexOf(grid, localPoint(120, 120))!]).toBeLessThan(60)
  })

  it('leaves blocked or unreachable cells at infinity', () => {
    const blocked = buildCostGrid([feature('521', rectangle(0, 0, 200, 200))], SQUARE_KILOMETRE)
    const seconds = secondsFrom(blocked, source, pace, Number.POSITIVE_INFINITY)
    expect(seconds.every(s => s === Number.POSITIVE_INFINITY)).toBe(true)
  })
})
