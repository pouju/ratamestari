import { paperPoint, type PaperPoint } from '@ratamestari/core'
import { COURSE_OVERPRINT } from '@ratamestari/rules'
import { findCircleGroups, isStraight, type CircleGroup } from './circles'

export interface OverprintSubpath {
  readonly points: readonly PaperPoint[]
  readonly closed: boolean
}

// One purple path from the page, in paper units (hundredths of a millimetre, y up).
export interface OverprintPath {
  readonly subpaths: readonly OverprintSubpath[]
  readonly stroked: boolean
  readonly filled: boolean
}

export interface DetectedCourse {
  readonly controlRadius: number
  readonly start: PaperPoint | null
  readonly finish: PaperPoint | null
  // In course order when `ordered`, otherwise in the order found (e.g. a map of all controls).
  readonly controls: readonly PaperPoint[]
  readonly ordered: boolean
  readonly coursePathIndices: ReadonlySet<number>
}

const FINISH_INNER_SHARE =
  COURSE_OVERPRINT.finishInnerDiameterMillimetres /
  COURSE_OVERPRINT.controlCircleDiameterMillimetres
const FINISH_OUTER_SHARE =
  COURSE_OVERPRINT.finishOuterDiameterMillimetres /
  COURSE_OVERPRINT.controlCircleDiameterMillimetres
const START_SIDE_SHARE =
  COURSE_OVERPRINT.startTriangleSideMillimetres / COURSE_OVERPRINT.controlCircleDiameterMillimetres

const SIZE_TOLERANCE = 0.2
const CONCENTRIC_TOLERANCE_SHARE = 0.1
const MIN_CONTROL_COVERAGE_RADIANS = Math.PI / 2
const TRIANGLE_SIDE_SPREAD = 0.25
const DUPLICATE_POINT_SHARE = 0.05
const LEG_OFFSET_SHARE = 0.15
const MIN_LEG_COVERAGE = 0.5
const MIN_LEG_PIECE_SHARE = 0.3
const COLLINEAR_STOP_SHARE = 0.3
const MIN_DRAWN_GAP_SHARE = 0.5
const NUMBER_SEARCH_RADII = 4
const NUMBER_HEIGHT_SHARE = { min: 0.6, max: 2.5 }

interface Stop {
  readonly position: PaperPoint
  readonly clearance: number
}

interface StrokePiece {
  readonly pathIndex: number
  readonly points: readonly PaperPoint[]
}

export function detectCourse(paths: readonly OverprintPath[]): DetectedCourse | null {
  const strokes: StrokePiece[] = paths.flatMap((path, pathIndex) =>
    path.stroked ? path.subpaths.map(({ points }) => ({ pathIndex, points })) : [],
  )
  const circles = findCircleGroups(strokes)
  const finishPair = findFinish(circles)
  const remaining = circles.filter(circle => !finishPair?.includes(circle))
  const controlRadius = typicalRadius(remaining)
  if (controlRadius === null) return null

  const controlCircles = remaining.filter(
    circle =>
      isNear(circle.radius, controlRadius) &&
      circle.coverageRadians >= MIN_CONTROL_COVERAGE_RADIANS,
  )
  const finishCircle = finishPair && isFinishFor(finishPair, controlRadius) ? finishPair : null
  const start = findStart(strokes, controlRadius)
  const usedPaths = new Set<number>([
    ...controlCircles.flatMap(circle => circle.arcs.map(arc => arc.pathIndex)),
    ...(finishCircle ?? []).flatMap(circle => circle.arcs.map(arc => arc.pathIndex)),
    ...(start ? [start.pathIndex] : []),
  ])

  const stops: Stop[] = [
    ...(start ? [{ position: start.centre, clearance: start.circumradius }] : []),
    ...controlCircles.map(circle => ({ position: circle.centre, clearance: circle.radius })),
    ...(finishCircle
      ? [{ position: finishCircle[0].centre, clearance: finishCircle[1].radius }]
      : []),
  ]
  const lines = strokes.filter(
    stroke =>
      !usedPaths.has(stroke.pathIndex) &&
      stroke.points.length >= 2 &&
      isStraight(stroke.points) &&
      length(stroke.points[0]!, stroke.points[stroke.points.length - 1]!) >=
        controlRadius * MIN_LEG_PIECE_SHARE,
  )
  const { neighbours, touching, legPaths } = findLegs(stops, lines, controlRadius)
  const order =
    start && finishCircle ? walk(neighbours, touching, 0, stops.length - 1, stops.length) : null
  for (const pathIndex of legPaths) usedPaths.add(pathIndex)

  const controlPositions = controlCircles.map(circle => circle.centre)
  const orderedControls = order?.slice(1, -1).map(index => stops[index]!.position)
  for (const pathIndex of numberGlyphs(paths, controlPositions, controlRadius)) {
    usedPaths.add(pathIndex)
  }

  return {
    controlRadius,
    start: start?.centre ?? null,
    finish: finishCircle?.[0].centre ?? null,
    controls: orderedControls ?? controlPositions,
    ordered: orderedControls !== undefined,
    coursePathIndices: usedPaths,
  }
}

function findFinish(circles: readonly CircleGroup[]): readonly [CircleGroup, CircleGroup] | null {
  for (const inner of circles) {
    for (const outer of circles) {
      if (outer.radius <= inner.radius) continue
      const ratio = outer.radius / inner.radius
      const expected = FINISH_OUTER_SHARE / FINISH_INNER_SHARE
      if (
        length(inner.centre, outer.centre) < inner.radius * CONCENTRIC_TOLERANCE_SHARE &&
        isNear(ratio, expected)
      ) {
        return [inner, outer]
      }
    }
  }
  return null
}

const isFinishFor = ([inner]: readonly [CircleGroup, CircleGroup], controlRadius: number) =>
  isNear(inner.radius, controlRadius * FINISH_INNER_SHARE)

function typicalRadius(circles: readonly CircleGroup[]): number | null {
  const candidates = circles.filter(
    circle => circle.coverageRadians >= MIN_CONTROL_COVERAGE_RADIANS,
  )
  let best: { radius: number; count: number } | null = null
  for (const candidate of candidates) {
    const count = candidates.filter(other => isNear(other.radius, candidate.radius)).length
    if (!best || count > best.count) best = { radius: candidate.radius, count }
  }
  return best?.radius ?? null
}

function findStart(strokes: readonly StrokePiece[], controlRadius: number) {
  const expectedSide = 2 * controlRadius * START_SIDE_SHARE
  for (const stroke of strokes) {
    const corners = cornersOf(stroke.points, controlRadius * DUPLICATE_POINT_SHARE)
    if (corners.length !== 3) continue
    const sides = corners.map((corner, i) => length(corner, corners[(i + 1) % 3]!))
    const meanSide = sides.reduce((sum, side) => sum + side, 0) / 3
    if (sides.some(side => Math.abs(side - meanSide) > meanSide * TRIANGLE_SIDE_SPREAD)) continue
    if (!isNear(meanSide, expectedSide)) continue
    const centre = paperPoint(
      corners.reduce((sum, [x]) => sum + x, 0) / 3,
      corners.reduce((sum, [, y]) => sum + y, 0) / 3,
    )
    return { centre, circumradius: meanSide / Math.sqrt(3), pathIndex: stroke.pathIndex }
  }
  return null
}

function cornersOf(points: readonly PaperPoint[], tolerance: number): PaperPoint[] {
  const distinct: PaperPoint[] = []
  for (const point of points) {
    const previous = distinct[distinct.length - 1]
    if (!previous || length(previous, point) > tolerance) distinct.push(point)
  }
  // OCAD draws past the first corner again (A B C A B) so the outline joins cleanly.
  const backToFirst = distinct.findIndex(
    (point, i) => i > 0 && length(distinct[0]!, point) <= tolerance,
  )
  return backToFirst === -1 ? distinct : distinct.slice(0, backToFirst)
}

// A leg joins two stops when straight purple pieces lie along most of the gap between them.
// Stops whose symbols (nearly) touch have no room for a line, so they count as joined when the
// course can't continue otherwise.
function findLegs(stops: readonly Stop[], lines: readonly StrokePiece[], controlRadius: number) {
  const tolerance = controlRadius * LEG_OFFSET_SHARE
  const neighbours = stops.map(() => new Set<number>())
  const touching = stops.map(() => new Set<number>())
  const legPaths = new Set<number>()
  const coveringPieces = new Map<string, number[]>()

  for (let a = 0; a < stops.length; a++) {
    for (let b = a + 1; b < stops.length; b++) {
      const from = stops[a]!
      const to = stops[b]!
      const distance = length(from.position, to.position)
      const gapStart = from.clearance
      const gapEnd = distance - to.clearance
      if (gapEnd - gapStart <= controlRadius * MIN_DRAWN_GAP_SHARE) {
        touching[a]!.add(b)
        touching[b]!.add(a)
        continue
      }
      const direction = [
        (to.position[0] - from.position[0]) / distance,
        (to.position[1] - from.position[1]) / distance,
      ] as const
      const intervals: [number, number][] = []
      const pieces: number[] = []
      for (const line of lines) {
        const along = line.points.map(
          ([x, y]) =>
            [
              (x - from.position[0]) * direction[0] + (y - from.position[1]) * direction[1],
              Math.abs(
                (x - from.position[0]) * direction[1] - (y - from.position[1]) * direction[0],
              ),
            ] as const,
        )
        if (along.some(([, offset]) => offset > tolerance)) continue
        const low = Math.max(gapStart, Math.min(...along.map(([t]) => t)))
        const high = Math.min(gapEnd, Math.max(...along.map(([t]) => t)))
        if (high <= low) continue
        intervals.push([low, high])
        pieces.push(line.pathIndex)
      }
      if (coveredLength(intervals) >= (gapEnd - gapStart) * MIN_LEG_COVERAGE) {
        neighbours[a]!.add(b)
        neighbours[b]!.add(a)
        coveringPieces.set(`${a}:${b}`, pieces)
      }
    }
  }

  removeLegsThroughStops(stops, neighbours, controlRadius)
  for (const [key, pieces] of coveringPieces) {
    const [a, b] = key.split(':').map(Number) as [number, number]
    if (neighbours[a]!.has(b)) for (const piece of pieces) legPaths.add(piece)
  }
  return { neighbours, touching, legPaths }
}

// With stops A, B, C in a line, the legs A–B and B–C also cover most of A–C.
function removeLegsThroughStops(
  stops: readonly Stop[],
  neighbours: readonly Set<number>[],
  controlRadius: number,
) {
  for (let a = 0; a < stops.length; a++) {
    for (const c of [...neighbours[a]!]) {
      const between = [...neighbours[a]!].find(
        b =>
          b !== c &&
          neighbours[b]!.has(c) &&
          distanceToSegment(stops[b]!.position, stops[a]!.position, stops[c]!.position) <
            controlRadius * COLLINEAR_STOP_SHARE,
      )
      if (between === undefined) continue
      neighbours[a]!.delete(c)
      neighbours[c]!.delete(a)
    }
  }
}

function walk(
  neighbours: readonly Set<number>[],
  touching: readonly Set<number>[],
  start: number,
  finish: number,
  stopCount: number,
): number[] | null {
  const order = [start]
  const visited = new Set(order)
  let current = start
  while (current !== finish) {
    const unvisited = (candidates: Set<number>) =>
      [...candidates].filter(candidate => !visited.has(candidate))
    const drawn = unvisited(neighbours[current]!)
    const next = drawn.length > 0 ? drawn : unvisited(touching[current]!)
    if (next.length !== 1) return null
    current = next[0]!
    order.push(current)
    visited.add(current)
  }
  return order.length === stopCount ? order : null
}

function numberGlyphs(
  paths: readonly OverprintPath[],
  controls: readonly PaperPoint[],
  controlRadius: number,
): number[] {
  return paths.flatMap((path, pathIndex) => {
    if (!path.filled) return []
    const points = path.subpaths.flatMap(subpath => subpath.points)
    if (points.length === 0) return []
    const ys = points.map(([, y]) => y)
    const height = Math.max(...ys) - Math.min(...ys)
    if (
      height < controlRadius * NUMBER_HEIGHT_SHARE.min ||
      height > controlRadius * NUMBER_HEIGHT_SHARE.max
    ) {
      return []
    }
    const centre = paperPoint(
      points.reduce((sum, [x]) => sum + x, 0) / points.length,
      points.reduce((sum, [, y]) => sum + y, 0) / points.length,
    )
    const nearControl = controls.some(
      control => length(control, centre) < controlRadius * NUMBER_SEARCH_RADII,
    )
    return nearControl ? [pathIndex] : []
  })
}

function coveredLength(intervals: [number, number][]): number {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0])
  let total = 0
  let reach = -Infinity
  for (const [low, high] of sorted) {
    if (high <= reach) continue
    total += high - Math.max(low, reach)
    reach = high
  }
  return total
}

function distanceToSegment(point: PaperPoint, from: PaperPoint, to: PaperPoint): number {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const share = Math.max(
    0,
    Math.min(1, ((point[0] - from[0]) * dx + (point[1] - from[1]) * dy) / (dx * dx + dy * dy)),
  )
  return length(point, paperPoint(from[0] + share * dx, from[1] + share * dy))
}

const isNear = (value: number, expected: number) =>
  Math.abs(value - expected) <= expected * SIZE_TOLERANCE

const length = (a: PaperPoint, b: PaperPoint) => Math.hypot(b[0] - a[0], b[1] - a[1])
