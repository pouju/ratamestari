import type { LocalPoint } from '@ratamestari/core'
import { REFERENCE_PACE_SECONDS_PER_KM } from '@ratamestari/rules'
import {
  BLOCKED,
  FLAT_METERS_PER_METER_OF_HEIGHT_CHANGE,
  heightChangeMeters,
  routableCellOf,
  type CostGrid,
} from './cost-grid'
import { MinHeap } from './min-heap'
import { polylineLength } from './polyline'
import { cellCenterOf, cellIndexOf } from './raster'

export interface Route {
  readonly points: readonly LocalPoint[]
  readonly lengthMeters: number
  readonly timeSeconds: number
}

export interface RouteOptions {
  readonly paceSecondsPerKm?: number
}

const NO_CELL = -1
const NEIGHBOUR_OFFSETS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const

export function findRoute(
  grid: CostGrid,
  from: LocalPoint,
  to: LocalPoint,
  { paceSecondsPerKm = REFERENCE_PACE_SECONDS_PER_KM.value }: RouteOptions = {},
): Route | null {
  const start = routableCellOf(grid, from)
  const goal = routableCellOf(grid, to)
  if (start === null || goal === null) return null

  const secondsPerMeterAtFullSpeed = paceSecondsPerKm / 1000
  const cellCount = grid.columns * grid.rows
  const bestSeconds = new Float64Array(cellCount).fill(Number.POSITIVE_INFINITY)
  const cameFrom = new Int32Array(cellCount).fill(NO_CELL)
  const closed = new Uint8Array(cellCount)
  const goalCenter = cellCenterOf(grid, goal)
  const heuristicSeconds = (index: number) => {
    const [x, y] = cellCenterOf(grid, index)
    const distance = Math.hypot(goalCenter[0] - x, goalCenter[1] - y)
    return (distance * secondsPerMeterAtFullSpeed) / grid.maxSpeed
  }

  const open = new MinHeap()
  bestSeconds[start] = 0
  open.push(start, heuristicSeconds(start))

  while (open.size > 0) {
    const current = open.pop()!
    if (current === goal) break
    if (closed[current]) continue
    closed[current] = 1

    const column = current % grid.columns
    const row = Math.floor(current / grid.columns)
    for (const [dc, dr] of NEIGHBOUR_OFFSETS) {
      const c = column + dc
      const r = row + dr
      if (c < 0 || r < 0 || c >= grid.columns || r >= grid.rows) continue
      const next = r * grid.columns + c
      const nextSpeed = grid.speed[next]!
      if (nextSpeed === BLOCKED || closed[next]) continue
      const isDiagonal = dc !== 0 && dr !== 0
      if (
        isDiagonal &&
        (grid.speed[row * grid.columns + c] === BLOCKED ||
          grid.speed[r * grid.columns + column] === BLOCKED)
      ) {
        continue
      }

      const stepMeters = grid.cellSizeMeters * (isDiagonal ? Math.SQRT2 : 1)
      const averagePace = 0.5 * (1 / grid.speed[current]! + 1 / nextSpeed)
      const flatMeters =
        stepMeters * averagePace +
        FLAT_METERS_PER_METER_OF_HEIGHT_CHANGE * heightChangeMeters(grid, current, next)
      const seconds = bestSeconds[current]! + flatMeters * secondsPerMeterAtFullSpeed
      if (seconds < bestSeconds[next]!) {
        bestSeconds[next] = seconds
        cameFrom[next] = current
        open.push(next, seconds + heuristicSeconds(next))
      }
    }
  }

  if (bestSeconds[goal] === Number.POSITIVE_INFINITY) return null

  const cells: number[] = []
  for (let cell = goal; cell !== NO_CELL; cell = cameFrom[cell]!) cells.push(cell)
  cells.reverse()
  const points = [from, ...cells.slice(1, -1).map(cell => cellCenterOf(grid, cell)), to]
  return { points, lengthMeters: polylineLength(points), timeSeconds: bestSeconds[goal]! }
}

export function routeTimeSeconds(
  grid: CostGrid,
  points: readonly LocalPoint[],
  { paceSecondsPerKm = REFERENCE_PACE_SECONDS_PER_KM.value }: RouteOptions = {},
): number {
  const secondsPerMeterAtFullSpeed = paceSecondsPerKm / 1000
  let seconds = 0
  for (let i = 1; i < points.length; i++) {
    const a = cellIndexOf(grid, points[i - 1]!)
    const b = cellIndexOf(grid, points[i]!)
    if (a === null || b === null) return Number.POSITIVE_INFINITY
    const stepMeters = Math.hypot(
      points[i]![0] - points[i - 1]![0],
      points[i]![1] - points[i - 1]![1],
    )
    const averagePace = 0.5 * (1 / grid.speed[a]! + 1 / grid.speed[b]!)
    const flatMeters =
      stepMeters * averagePace +
      FLAT_METERS_PER_METER_OF_HEIGHT_CHANGE * heightChangeMeters(grid, a, b)
    seconds += flatMeters * secondsPerMeterAtFullSpeed
  }
  return seconds
}
