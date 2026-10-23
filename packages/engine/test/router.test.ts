import { describe, expect, it } from 'vitest'
import { localPoint } from '@ratamestari/core'
import { REFERENCE_PACE_SECONDS_PER_KM, RUNNABILITY } from '@ratamestari/rules'
import { buildCostGrid } from '../src/cost-grid'
import { findRoute } from '../src/router'
import { feature, line, rectangle, SQUARE_KILOMETRE } from './fixtures'

const forest = RUNNABILITY[2].speedFactor
const secondsAtForestSpeed = (meters: number) =>
  ((meters / 1000) * REFERENCE_PACE_SECONDS_PER_KM.value) / forest

describe('findRoute', () => {
  it('runs straight across uniform forest', () => {
    const grid = buildCostGrid([], SQUARE_KILOMETRE)
    const route = findRoute(grid, localPoint(100, 500), localPoint(900, 500))!
    expect(route.lengthMeters).toBeCloseTo(800, -1)
    expect(route.timeSeconds).toBeCloseTo(secondsAtForestSpeed(800), -1)
  })

  it('stays within grid accuracy on diagonals', () => {
    const grid = buildCostGrid([], SQUARE_KILOMETRE)
    const route = findRoute(grid, localPoint(100, 100), localPoint(800, 400))!
    const straight = Math.hypot(700, 300)
    expect(route.lengthMeters).toBeGreaterThanOrEqual(straight)
    expect(route.lengthMeters).toBeLessThan(straight * 1.1)
  })

  it('goes around an impassable fence through its gap', () => {
    const grid = buildCostGrid([feature('518', line([0, 502], [700, 502]))], SQUARE_KILOMETRE)
    const route = findRoute(grid, localPoint(300, 300), localPoint(300, 700))!
    expect(route.lengthMeters).toBeGreaterThan(400 + 300)
    expect(route.points.some(([x, y]) => x > 700 && Math.abs(y - 502) < 10)).toBe(true)
  })

  it('does not slip diagonally through a diagonal fence', () => {
    const grid = buildCostGrid([feature('518', line([0, 0], [1000, 1000]))], SQUARE_KILOMETRE)
    expect(findRoute(grid, localPoint(800, 200), localPoint(200, 800))).toBeNull()
  })

  it('takes a path around a thicket when it is faster than going through', () => {
    const grid = buildCostGrid(
      [
        feature('410', rectangle(0, 300, 1000, 700)),
        feature('505', line([100, 100], [500, 100], [950, 100], [950, 900], [500, 900])),
      ],
      SQUARE_KILOMETRE,
    )
    const route = findRoute(grid, localPoint(500, 120), localPoint(500, 880))!
    const throughThicket =
      secondsAtForestSpeed(360) +
      ((400 / 1000) * REFERENCE_PACE_SECONDS_PER_KM.value) / RUNNABILITY[5].speedFactor
    expect(route.timeSeconds).toBeLessThan(throughThicket)
    expect(route.points.some(([x]) => x > 900)).toBe(true)
  })

  it('returns null when the destination is enclosed', () => {
    const grid = buildCostGrid(
      [feature('518', line([400, 400], [600, 400], [600, 600], [400, 600], [400, 400]))],
      SQUARE_KILOMETRE,
    )
    expect(findRoute(grid, localPoint(100, 100), localPoint(500, 500))).toBeNull()
  })

  it('returns null from inside a blocked cell or outside the grid', () => {
    const grid = buildCostGrid([feature('521', rectangle(0, 0, 200, 200))], SQUARE_KILOMETRE)
    expect(findRoute(grid, localPoint(100, 100), localPoint(500, 500))).toBeNull()
    expect(findRoute(grid, localPoint(-10, 500), localPoint(500, 500))).toBeNull()
  })

  it('scales time with the given pace', () => {
    const grid = buildCostGrid([], SQUARE_KILOMETRE)
    const reference = findRoute(grid, localPoint(100, 500), localPoint(900, 500))!
    const slower = findRoute(grid, localPoint(100, 500), localPoint(900, 500), {
      paceSecondsPerKm: REFERENCE_PACE_SECONDS_PER_KM.value * 2,
    })!
    expect(slower.timeSeconds).toBeCloseTo(reference.timeSeconds * 2)
  })
})
