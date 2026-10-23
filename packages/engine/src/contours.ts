import type { LocalExtent, LocalPoint, MapFeature } from '@ratamestari/core'
import { polylineLength, segmentsCross, simplify } from './polyline'
import { computeUphillSides, LEFT_IS_UPHILL, RIGHT_IS_UPHILL, type ContourLine } from './relief'

const CONTOUR_ISOM_CODES = new Set(['101', '102'])
const SLOPE_TICK_MAX_LENGTH_METERS = 15
const CLOSED_LINE_MAX_GAP_METERS = 1
const BUCKET_SIZE_METERS = 50

interface Segment {
  readonly a: LocalPoint
  readonly b: LocalPoint
  readonly line: number
}

export interface ContourIndex {
  readonly lines: readonly ContourLine[]
  readonly uphillSides: Int8Array
  readonly segments: readonly Segment[]
  readonly buckets: ReadonlyMap<string, readonly number[]>
}

export interface ContourCrossings {
  readonly up: number
  readonly down: number
  readonly unknown: number
}

const bucketKey = (column: number, row: number) => `${column},${row}`
const bucketCoordinate = (value: number) => Math.floor(value / BUCKET_SIZE_METERS)

export function buildContourIndex(
  features: readonly MapFeature[],
  extent: LocalExtent,
): ContourIndex {
  const lines = contourLines(features)
  const segments: Segment[] = []
  const buckets = new Map<string, number[]>()
  lines.forEach(({ points }, line) => {
    for (let i = 1; i < points.length; i++) {
      const id = segments.push({ a: points[i - 1]!, b: points[i]!, line }) - 1
      forEachBucket(segments[id]!, key => {
        const bucket = buckets.get(key)
        if (bucket) bucket.push(id)
        else buckets.set(key, [id])
      })
    }
  })
  return { lines, uphillSides: computeUphillSides(lines, features, extent), segments, buckets }
}

function contourLines(features: readonly MapFeature[]): ContourLine[] {
  const lines: ContourLine[] = []
  const add = (points: readonly LocalPoint[], isClosedRing: boolean) => {
    if (polylineLength(points) <= SLOPE_TICK_MAX_LENGTH_METERS) return
    const first = points[0]!
    const last = points[points.length - 1]!
    const isClosed =
      isClosedRing ||
      Math.hypot(first[0] - last[0], first[1] - last[1]) <= CLOSED_LINE_MAX_GAP_METERS
    lines.push({ points, isClosed })
  }
  for (const { isomCode, geometry } of features) {
    if (isomCode === null || !CONTOUR_ISOM_CODES.has(isomCode)) continue
    if (geometry.type === 'LineString') add(geometry.coordinates, false)
    else if (geometry.type === 'Polygon') geometry.coordinates.forEach(ring => add(ring, true))
  }
  return lines
}

export function countContourCrossings(
  index: ContourIndex,
  route: readonly LocalPoint[],
  simplifyToleranceMeters: number,
): ContourCrossings {
  const simplified = simplify(route, simplifyToleranceMeters)
  let up = 0
  let down = 0
  let unknown = 0
  for (let i = 1; i < simplified.length; i++) {
    const a = simplified[i - 1]!
    const b = simplified[i]!
    const candidates = new Set<number>()
    forEachBucket({ a, b, line: -1 }, key =>
      index.buckets.get(key)?.forEach(id => candidates.add(id)),
    )
    for (const id of candidates) {
      const contour = index.segments[id]!
      if (!segmentsCross(a, b, contour.a, contour.b)) continue
      const movesToLeftSide =
        (contour.b[0] - contour.a[0]) * (b[1] - a[1]) -
          (contour.b[1] - contour.a[1]) * (b[0] - a[0]) >
        0
      const uphillSide = index.uphillSides[contour.line]
      if (uphillSide === LEFT_IS_UPHILL) movesToLeftSide ? up++ : down++
      else if (uphillSide === RIGHT_IS_UPHILL) movesToLeftSide ? down++ : up++
      else unknown++
    }
  }
  return { up, down, unknown }
}

function forEachBucket({ a, b }: Segment, visit: (key: string) => void) {
  const minColumn = bucketCoordinate(Math.min(a[0], b[0]))
  const maxColumn = bucketCoordinate(Math.max(a[0], b[0]))
  const minRow = bucketCoordinate(Math.min(a[1], b[1]))
  const maxRow = bucketCoordinate(Math.max(a[1], b[1]))
  for (let row = minRow; row <= maxRow; row++) {
    for (let column = minColumn; column <= maxColumn; column++) visit(bucketKey(column, row))
  }
}
