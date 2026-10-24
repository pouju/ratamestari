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

export function secondsFrom(
  grid: CostGrid,
  source: LocalPoint,
  paceSecondsPerKm: number,
  maxSeconds: number,
): Float32Array {
  const seconds = new Float32Array(grid.columns * grid.rows).fill(Number.POSITIVE_INFINITY)
  const start = routableCellOf(grid, source)
  if (start === null) return seconds

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
    if (currentSeconds > maxSeconds) break
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
  return seconds
}
