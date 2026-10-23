import { describe, expect, it } from 'vitest'
import { localPoint } from '@ratamestari/core'
import { courseLengthMeters, shortestPassableMeters } from '../src/course-length'
import { buildCostGrid } from '../src/cost-grid'
import { feature, line, rectangle, SQUARE_KILOMETRE } from './fixtures'

describe('course length (Lajisäännöt 11.22)', () => {
  it('measures the shortest route, ignoring how fast the terrain is', () => {
    const grid = buildCostGrid(
      [feature('410', rectangle(300, 0, 700, 1000)), feature('505', line([0, 900], [1000, 900]))],
      SQUARE_KILOMETRE,
    )
    const meters = shortestPassableMeters(grid, localPoint(100, 500), localPoint(900, 500))
    expect(meters).toBeCloseTo(800, -1)
  })

  it('goes around impassable and forbidden areas', () => {
    const grid = buildCostGrid([feature('520', rectangle(400, 0, 600, 800))], SQUARE_KILOMETRE)
    const meters = shortestPassableMeters(grid, localPoint(100, 500), localPoint(900, 500))
    const overTheTop = 2 * Math.hypot(300, 300) + 200
    expect(meters).toBeGreaterThanOrEqual(overTheTop)
    expect(meters).toBeLessThan(overTheTop * 1.05)
  })

  it('adds up the legs of a course', () => {
    const grid = buildCostGrid([], SQUARE_KILOMETRE)
    const stops = [localPoint(100, 100), localPoint(100, 500), localPoint(500, 500)]
    expect(courseLengthMeters(grid, stops)).toBeCloseTo(800, -1)
  })
})
