import type { PaperPoint } from '@ratamestari/core'

export interface Box {
  readonly minX: number
  readonly minY: number
  readonly width: number
  readonly height: number
}

export function boxOf(points: readonly PaperPoint[]): Box {
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return { minX, minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY }
}

export const pathLength = (points: readonly PaperPoint[]) =>
  points.reduce(
    (sum, point, i) =>
      i === 0 ? sum : sum + Math.hypot(point[0] - points[i - 1]![0], point[1] - points[i - 1]![1]),
    0,
  )

export const signedArea = (ring: readonly PaperPoint[]) =>
  ring.reduce((sum, [x, y], i) => {
    const [nx, ny] = ring[(i + 1) % ring.length]!
    return sum + (x * ny - nx * y) / 2
  }, 0)

const CORNER_TURN_RADIANS = Math.PI / 4

export function cornersOf(ring: readonly PaperPoint[], tolerance: number): PaperPoint[] {
  const corners: PaperPoint[] = []
  ring.forEach((point, i) => {
    const previous = ring[(i - 1 + ring.length) % ring.length]!
    const next = ring[(i + 1) % ring.length]!
    const [ax, ay] = [point[0] - previous[0], point[1] - previous[1]]
    const [bx, by] = [next[0] - point[0], next[1] - point[1]]
    const turn = Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by))
    if (turn <= CORNER_TURN_RADIANS) return
    const isNew = corners.every(
      corner => Math.hypot(point[0] - corner[0], point[1] - corner[1]) > tolerance,
    )
    if (isNew) corners.push(point)
  })
  return corners
}

export function distanceToPolyline(point: PaperPoint, line: readonly PaperPoint[]): number {
  let best = Infinity
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1]!, line[i]!]
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]]
    const lengthSquared = dx * dx + dy * dy
    const share =
      lengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared),
          )
    best = Math.min(best, Math.hypot(point[0] - a[0] - share * dx, point[1] - a[1] - share * dy))
  }
  return best
}

export function unionLength(intervals: readonly (readonly [number, number])[]): number {
  let total = 0
  let reach = -Infinity
  for (const [low, high] of [...intervals].sort((a, b) => a[0] - b[0])) {
    if (high <= reach) continue
    total += high - Math.max(low, reach)
    reach = high
  }
  return total
}

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

export const logRatio = (value: number, nominal: number) => Math.abs(Math.log(value / nominal))
