import type { LocalPoint } from '@ratamestari/core'

export function polylineLength(points: readonly LocalPoint[]): number {
  let length = 0
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1])
  }
  return length
}

export function distanceToSegment(p: LocalPoint, a: LocalPoint, b: LocalPoint): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const lengthSquared = dx * dx + dy * dy
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSquared))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

export function simplify(points: readonly LocalPoint[], toleranceMeters: number): LocalPoint[] {
  if (points.length <= 2) return [...points]
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const pending: [number, number][] = [[0, points.length - 1]]
  while (pending.length > 0) {
    const [first, last] = pending.pop()!
    let farthest = -1
    let farthestDistance = toleranceMeters
    for (let i = first + 1; i < last; i++) {
      const distance = distanceToSegment(points[i]!, points[first]!, points[last]!)
      if (distance > farthestDistance) {
        farthest = i
        farthestDistance = distance
      }
    }
    if (farthest === -1) continue
    keep[farthest] = 1
    pending.push([first, farthest], [farthest, last])
  }
  return points.filter((_, i) => keep[i])
}

export function segmentsCross(a: LocalPoint, b: LocalPoint, c: LocalPoint, d: LocalPoint): boolean {
  const orientation = (p: LocalPoint, q: LocalPoint, r: LocalPoint) =>
    Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]))
  return (
    orientation(a, b, c) * orientation(a, b, d) < 0 &&
    orientation(c, d, a) * orientation(c, d, b) < 0
  )
}
