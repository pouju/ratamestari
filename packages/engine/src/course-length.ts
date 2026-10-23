import type { LocalPoint } from '@ratamestari/core'
import { BLOCKED, type CostGrid } from './cost-grid'
import { findRoute } from './router'

const EVERY_PASSABLE_CELL_SPEED = 1
const passableGrids = new WeakMap<CostGrid, CostGrid>()

function passableOnly(grid: CostGrid): CostGrid {
  const cached = passableGrids.get(grid)
  if (cached) return cached
  const speed = grid.speed.map(s => (s === BLOCKED ? BLOCKED : EVERY_PASSABLE_CELL_SPEED))
  const passable = { ...grid, speed, maxSpeed: EVERY_PASSABLE_CELL_SPEED }
  passableGrids.set(grid, passable)
  return passable
}

export function shortestPassableMeters(grid: CostGrid, from: LocalPoint, to: LocalPoint): number {
  return findRoute(passableOnly(grid), from, to)?.lengthMeters ?? Number.POSITIVE_INFINITY
}

export function courseLengthMeters(grid: CostGrid, stops: readonly LocalPoint[]): number {
  let length = 0
  for (let i = 1; i < stops.length; i++) {
    length += shortestPassableMeters(grid, stops[i - 1]!, stops[i]!)
  }
  return length
}
