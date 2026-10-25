import type { LocalPoint } from '@ratamestari/core'
import {
  BLOCKED,
  FLAT_METERS_PER_METER_OF_HEIGHT_CHANGE,
  heightChangeMeters,
  routableCellOf,
  type CostGrid,
} from './cost-grid'
import { MinHeap } from './min-heap'
import { cellIndexOf } from './raster'

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

export const secondsFrom = (
  grid: CostGrid,
  source: LocalPoint,
  paceSecondsPerKm: number,
  maxSeconds: number,
): Float32Array => secondsUntil(grid, source, paceSecondsPerKm, maxSeconds).seconds

export interface TimeTree {
  readonly seconds: Float32Array
  // Every cell up to this time from the source is exact; cells beyond it may be over-estimated.
  readonly exactUpTo: number
}

// Like secondsFrom, but also stops once every cell in `targets` is settled: their times are then
// exact, as cells are settled in order of time.
export function secondsUntil(
  grid: CostGrid,
  source: LocalPoint,
  paceSecondsPerKm: number,
  maxSeconds: number,
  targets: readonly number[] = [],
): TimeTree {
  const seconds = new Float32Array(grid.columns * grid.rows).fill(Number.POSITIVE_INFINITY)
  const start = routableCellOf(grid, source)
  if (start === null) return { seconds, exactUpTo: Number.POSITIVE_INFINITY }
  const isTarget = new Uint8Array(targets.length > 0 ? seconds.length : 0)
  let targetsLeft = 0
  for (const target of targets) {
    if (!isTarget[target]) targetsLeft++
    isTarget[target] = 1
  }
  let exactUpTo = Number.POSITIVE_INFINITY

  const secondsPerMeterAtFullSpeed = paceSecondsPerKm / 1000
  const done = new Uint8Array(seconds.length)
  const open = new MinHeap()
  seconds[start] = 0
  open.push(start, 0)
  while (open.size > 0) {
    const current = open.pop()!
    if (done[current]) continue
    done[current] = 1
    const currentSeconds = seconds[current]!
    if (currentSeconds > maxSeconds) {
      exactUpTo = maxSeconds
      break
    }
    if (isTarget.length > 0 && isTarget[current] && --targetsLeft === 0) {
      exactUpTo = currentSeconds
      break
    }
    const column = current % grid.columns
    const row = Math.floor(current / grid.columns)
    for (const [dc, dr] of NEIGHBOUR_OFFSETS) {
      const c = column + dc
      const r = row + dr
      if (c < 0 || r < 0 || c >= grid.columns || r >= grid.rows) continue
      const next = r * grid.columns + c
      const nextSpeed = grid.speed[next]!
      if (nextSpeed === BLOCKED || done[next]) continue
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
      const candidate = Math.fround(currentSeconds + flatMeters * secondsPerMeterAtFullSpeed)
      if (candidate < seconds[next]!) {
        seconds[next] = candidate
        open.push(next, candidate)
      }
    }
  }
  return { seconds, exactUpTo }
}
