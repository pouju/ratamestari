import type { LocalPoint, MapFeature } from '@ratamestari/core'
import { polylineLength, segmentsCross, simplify } from './polyline'

const CONTOUR_ISOM_CODES = new Set(['101', '102'])
const SLOPE_TICK_MAX_LENGTH_METERS = 15
const BUCKET_SIZE_METERS = 50

interface Segment {
  readonly a: LocalPoint
  readonly b: LocalPoint
}

export interface ContourIndex {
  readonly segments: readonly Segment[]
  readonly buckets: ReadonlyMap<string, readonly number[]>
}

const bucketKey = (column: number, row: number) => `${column},${row}`
const bucketCoordinate = (value: number) => Math.floor(value / BUCKET_SIZE_METERS)

export function buildContourIndex(features: readonly MapFeature[]): ContourIndex {
  const segments: Segment[] = []
  const buckets = new Map<string, number[]>()

  const addLine = (points: readonly LocalPoint[]) => {
    if (polylineLength(points) <= SLOPE_TICK_MAX_LENGTH_METERS) return
    for (let i = 1; i < points.length; i++) {
      const segment = { a: points[i - 1]!, b: points[i]! }
      const id = segments.push(segment) - 1
      forEachBucket(segment, key => {
        const bucket = buckets.get(key)
        if (bucket) bucket.push(id)
        else buckets.set(key, [id])
      })
    }
  }

  for (const { isomCode, geometry } of features) {
    if (isomCode === null || !CONTOUR_ISOM_CODES.has(isomCode)) continue
    if (geometry.type === 'LineString') addLine(geometry.coordinates)
    else if (geometry.type === 'Polygon') geometry.coordinates.forEach(addLine)
  }
  return { segments, buckets }
}

export function countContourCrossings(
  index: ContourIndex,
  route: readonly LocalPoint[],
  simplifyToleranceMeters: number,
): number {
  const simplified = simplify(route, simplifyToleranceMeters)
  let crossings = 0
  for (let i = 1; i < simplified.length; i++) {
    const routeSegment = { a: simplified[i - 1]!, b: simplified[i]! }
    const candidates = new Set<number>()
    forEachBucket(routeSegment, key => index.buckets.get(key)?.forEach(id => candidates.add(id)))
    for (const id of candidates) {
      const contour = index.segments[id]!
      if (segmentsCross(routeSegment.a, routeSegment.b, contour.a, contour.b)) crossings++
    }
  }
  return crossings
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
