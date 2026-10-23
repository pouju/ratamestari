import { describe, expect, it } from 'vitest'
import { localPoint } from '@ratamestari/core'
import { CROSSING_SLOWS_SPEED_FACTOR, RUNNABILITY } from '@ratamestari/rules'
import { BLOCKED, buildCostGrid, type CostGrid } from '../src/cost-grid'
import { cellIndexOf } from '../src/raster'
import { feature, line, point, rectangle, SQUARE_KILOMETRE } from './fixtures'

const speedAt = (grid: CostGrid, x: number, y: number) =>
  grid.speed[cellIndexOf(grid, localPoint(x, y))!]

const forest = RUNNABILITY[2].speedFactor

describe('buildCostGrid', () => {
  it('covers the extent with cells of the given size', () => {
    const grid = buildCostGrid([], SQUARE_KILOMETRE, { cellSizeMeters: 10 })
    expect(grid.columns).toBe(100)
    expect(grid.rows).toBe(100)
  })

  it('treats unmapped terrain as typical forest', () => {
    const grid = buildCostGrid([], SQUARE_KILOMETRE)
    expect(speedAt(grid, 500, 500)).toBeCloseTo(forest)
  })

  it('uses the runnability class of vegetation', () => {
    const grid = buildCostGrid([feature('406', rectangle(100, 100, 300, 300))], SQUARE_KILOMETRE)
    expect(speedAt(grid, 200, 200)).toBeCloseTo(RUNNABILITY[3].speedFactor)
    expect(speedAt(grid, 500, 500)).toBeCloseTo(forest)
  })

  it('lets the slowest of overlapping vegetation win', () => {
    const grid = buildCostGrid(
      [
        feature('403', rectangle(100, 100, 300, 300)),
        feature('408', rectangle(150, 150, 250, 250)),
      ],
      SQUARE_KILOMETRE,
    )
    expect(speedAt(grid, 200, 200)).toBeCloseTo(RUNNABILITY[4].speedFactor)
    expect(speedAt(grid, 120, 120)).toBeCloseTo(RUNNABILITY[2].speedFactor)
  })

  it('makes stony ground under undergrowth slower than either alone', () => {
    const grid = buildCostGrid(
      [
        feature('406', rectangle(100, 100, 300, 300)),
        feature('210', rectangle(100, 100, 300, 300)),
      ],
      SQUARE_KILOMETRE,
    )
    const slow = RUNNABILITY[3].speedFactor
    expect(speedAt(grid, 200, 200)).toBeCloseTo((slow * slow) / forest)
    expect(speedAt(grid, 200, 200)).toBeLessThan(slow)
  })

  it('makes paths fast through slow vegetation', () => {
    const grid = buildCostGrid(
      [feature('410', rectangle(0, 0, 1000, 1000)), feature('505', line([0, 502], [1000, 502]))],
      SQUARE_KILOMETRE,
    )
    expect(speedAt(grid, 500, 502)).toBeCloseTo(RUNNABILITY[1].speedFactor)
    expect(speedAt(grid, 500, 600)).toBeCloseTo(RUNNABILITY[5].speedFactor)
  })

  it('slows cells on lines that slow crossing', () => {
    const grid = buildCostGrid([feature('516', line([0, 502], [1000, 502]))], SQUARE_KILOMETRE)
    expect(speedAt(grid, 500, 502)).toBeCloseTo(forest * CROSSING_SLOWS_SPEED_FACTOR.value)
  })

  it('blocks impassable and forbidden areas', () => {
    const grid = buildCostGrid(
      [
        feature('521', rectangle(100, 100, 200, 200)),
        feature('520', rectangle(600, 600, 700, 700)),
      ],
      SQUARE_KILOMETRE,
    )
    expect(speedAt(grid, 150, 150)).toBe(BLOCKED)
    expect(speedAt(grid, 650, 650)).toBe(BLOCKED)
  })

  it('blocks buildings narrower than a cell', () => {
    const grid = buildCostGrid([feature('521', rectangle(101, 101, 103, 103))], SQUARE_KILOMETRE)
    expect(speedAt(grid, 102, 102)).toBe(BLOCKED)
  })

  it('blocks impassable lines', () => {
    const grid = buildCostGrid([feature('518', line([0, 502], [1000, 502]))], SQUARE_KILOMETRE)
    expect(speedAt(grid, 500, 502)).toBe(BLOCKED)
  })

  it('reopens barriers at bridges and crossing points', () => {
    const grid = buildCostGrid(
      [
        feature('301', rectangle(0, 400, 1000, 600)),
        feature('512', line([500, 390], [500, 610])),
        feature('518', line([0, 802], [1000, 802])),
        feature('519', point(300, 802)),
      ],
      SQUARE_KILOMETRE,
    )
    expect(speedAt(grid, 200, 500)).toBe(BLOCKED)
    expect(speedAt(grid, 500, 500)).toBeGreaterThan(0)
    expect(speedAt(grid, 300, 802)).toBeGreaterThan(0)
  })

  it('ignores features without an ISOM code', () => {
    const grid = buildCostGrid([feature(null, rectangle(0, 0, 1000, 1000))], SQUARE_KILOMETRE)
    expect(speedAt(grid, 500, 500)).toBeCloseTo(forest)
  })

  it('records the fastest speed in the grid', () => {
    const grid = buildCostGrid([feature('505', line([0, 502], [1000, 502]))], SQUARE_KILOMETRE)
    expect(grid.maxSpeed).toBeCloseTo(RUNNABILITY[1].speedFactor)
  })
})
