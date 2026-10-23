import type { LocalExtent, LocalPoint, MapFeature } from '@ratamestari/core'
import { distanceToSegment } from './polyline'
import { cellIndexOf, fillPolygon, traceLine, type GridFrame } from './raster'

export interface ContourLine {
  readonly points: readonly LocalPoint[]
  readonly isClosed: boolean
}

export const LEFT_IS_UPHILL = 1
export const RIGHT_IS_UPHILL = -1
export const UPHILL_UNKNOWN = 0
type UphillSide = typeof LEFT_IS_UPHILL | typeof RIGHT_IS_UPHILL | typeof UPHILL_UNKNOWN

const REGION_CELL_SIZE_METERS = 2.5
const SIDE_SAMPLE_OFFSET_CELLS = 1.5
const SIDE_SAMPLE_SPACING_METERS = 10
const SLOPE_TICK_MAX_DISTANCE_FROM_CONTOUR_METERS = 3
const SLOPE_TICK_ISOM_CODE = '101'
const WATER_ISOM_CODES = new Set(['301', '302'])
const NONE = -1

interface Edge {
  readonly line: number
  readonly to: number
  readonly levelChange: number | null
}

export function computeUphillSides(
  lines: readonly ContourLine[],
  features: readonly MapFeature[],
  extent: LocalExtent,
): Int8Array {
  const frame = regionFrame(extent)
  const contourAt = new Int32Array(frame.columns * frame.rows).fill(NONE)
  lines.forEach((line, id) =>
    traceLine(frame, line.points, i => {
      if (contourAt[i] === NONE) contourAt[i] = id
    }),
  )
  const { regionAt, regionCount } = labelRegions(frame, contourAt)
  const sides = lines.map(line => sideRegions(frame, regionAt, line.points))
  const evidence = uphillEvidence(lines, features)
  const levels = solveRegionLevels(
    regionCount,
    sides,
    evidence,
    waterRegions(frame, regionAt, features),
  )

  return Int8Array.from(lines, (_, id): UphillSide => {
    if (evidence[id] !== UPHILL_UNKNOWN) return evidence[id] as UphillSide
    const { left, right } = sides[id]!
    if (left === NONE || right === NONE) return UPHILL_UNKNOWN
    const leftLevel = levels.level[left]!
    const rightLevel = levels.level[right]!
    const isComparable =
      !Number.isNaN(leftLevel) &&
      !Number.isNaN(rightLevel) &&
      levels.component[left] === levels.component[right] &&
      leftLevel !== rightLevel
    if (!isComparable) return UPHILL_UNKNOWN
    return leftLevel > rightLevel ? LEFT_IS_UPHILL : RIGHT_IS_UPHILL
  })
}

function regionFrame([minX, minY, maxX, maxY]: LocalExtent): GridFrame {
  return {
    minX,
    minY,
    cellSizeMeters: REGION_CELL_SIZE_METERS,
    columns: Math.max(1, Math.ceil((maxX - minX) / REGION_CELL_SIZE_METERS)),
    rows: Math.max(1, Math.ceil((maxY - minY) / REGION_CELL_SIZE_METERS)),
  }
}

function labelRegions(frame: GridFrame, contourAt: Int32Array) {
  const regionAt = new Int32Array(contourAt.length).fill(NONE)
  let nextRegion = 0
  const stack: number[] = []
  for (let seed = 0; seed < regionAt.length; seed++) {
    if (contourAt[seed] !== NONE || regionAt[seed] !== NONE) continue
    const region = nextRegion++
    regionAt[seed] = region
    stack.push(seed)
    while (stack.length > 0) {
      const cell = stack.pop()!
      const column = cell % frame.columns
      const neighbours = [
        column > 0 ? cell - 1 : NONE,
        column < frame.columns - 1 ? cell + 1 : NONE,
        cell >= frame.columns ? cell - frame.columns : NONE,
        cell + frame.columns < regionAt.length ? cell + frame.columns : NONE,
      ]
      for (const next of neighbours) {
        if (next === NONE || contourAt[next] !== NONE || regionAt[next] !== NONE) continue
        regionAt[next] = region
        stack.push(next)
      }
    }
  }
  return { regionAt, regionCount: nextRegion }
}

function sideRegions(
  frame: GridFrame,
  regionAt: Int32Array,
  points: readonly LocalPoint[],
): { left: number; right: number } {
  const leftVotes = new Map<number, number>()
  const rightVotes = new Map<number, number>()
  const offset = SIDE_SAMPLE_OFFSET_CELLS * frame.cellSizeMeters
  const vote = (votes: Map<number, number>, x: number, y: number) => {
    const index = cellIndexOf(frame, [x, y] as const as LocalPoint)
    const region = index === null ? NONE : regionAt[index]!
    if (region !== NONE) votes.set(region, (votes.get(region) ?? 0) + 1)
  }
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1]!
    const [bx, by] = points[i]!
    const length = Math.hypot(bx - ax, by - ay)
    if (length === 0) continue
    const normalX = -(by - ay) / length
    const normalY = (bx - ax) / length
    const samples = Math.max(1, Math.round(length / SIDE_SAMPLE_SPACING_METERS))
    for (let s = 0; s < samples; s++) {
      const t = (s + 0.5) / samples
      const x = ax + (bx - ax) * t
      const y = ay + (by - ay) * t
      vote(leftVotes, x + normalX * offset, y + normalY * offset)
      vote(rightVotes, x - normalX * offset, y - normalY * offset)
    }
  }
  const left = mostVoted(leftVotes)
  const right = mostVoted(rightVotes)
  return left === right ? { left: NONE, right: NONE } : { left, right }
}

function mostVoted(votes: ReadonlyMap<number, number>): number {
  let best = NONE
  let bestCount = 0
  for (const [region, count] of votes) {
    if (count > bestCount) {
      best = region
      bestCount = count
    }
  }
  return best
}

function uphillEvidence(lines: readonly ContourLine[], features: readonly MapFeature[]): Int8Array {
  const tickVotes = new Int32Array(lines.length)
  for (const feature of features) {
    if (feature.isomCode !== SLOPE_TICK_ISOM_CODE || feature.geometry.type !== 'Point') continue
    const tick = feature.geometry.coordinates
    const nearest = nearestSegment(lines, tick)
    if (!nearest || nearest.distance > SLOPE_TICK_MAX_DISTANCE_FROM_CONTOUR_METERS) continue
    const radians = (feature.symbolRotationDegreesCounterClockwise * Math.PI) / 180
    const downhillX = -Math.sin(radians)
    const downhillY = Math.cos(radians)
    const [a, b] = nearest.segment
    const pointsLeft = (b[0] - a[0]) * downhillY - (b[1] - a[1]) * downhillX > 0
    tickVotes[nearest.line]! += pointsLeft ? RIGHT_IS_UPHILL : LEFT_IS_UPHILL
  }

  return Int8Array.from(lines, (line, id): UphillSide => {
    if (tickVotes[id]! !== 0) return Math.sign(tickVotes[id]!) as UphillSide
    if (!line.isClosed) return UPHILL_UNKNOWN
    return signedArea(line.points) > 0 ? LEFT_IS_UPHILL : RIGHT_IS_UPHILL
  })
}

function nearestSegment(lines: readonly ContourLine[], point: LocalPoint) {
  let best: { line: number; segment: [LocalPoint, LocalPoint]; distance: number } | null = null
  lines.forEach(({ points }, line) => {
    for (let i = 1; i < points.length; i++) {
      const distance = distanceToSegment(point, points[i - 1]!, points[i]!)
      if (!best || distance < best.distance) {
        best = { line, segment: [points[i - 1]!, points[i]!], distance }
      }
    }
  })
  return best as { line: number; segment: [LocalPoint, LocalPoint]; distance: number } | null
}

function signedArea(points: readonly LocalPoint[]): number {
  let twiceArea = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]!
    const [x2, y2] = points[(i + 1) % points.length]!
    twiceArea += x1 * y2 - x2 * y1
  }
  return twiceArea / 2
}

function waterRegions(
  frame: GridFrame,
  regionAt: Int32Array,
  features: readonly MapFeature[],
): Set<number> {
  const regions = new Set<number>()
  for (const { isomCode, geometry } of features) {
    if (isomCode === null || !WATER_ISOM_CODES.has(isomCode) || geometry.type !== 'Polygon') {
      continue
    }
    fillPolygon(frame, geometry.coordinates, i => {
      if (regionAt[i] !== NONE) regions.add(regionAt[i]!)
    })
  }
  return regions
}

function solveRegionLevels(
  regionCount: number,
  sides: readonly { left: number; right: number }[],
  evidence: Int8Array,
  lowestRegions: ReadonlySet<number>,
) {
  const edges: Edge[][] = Array.from({ length: regionCount }, () => [])
  sides.forEach(({ left, right }, line) => {
    if (left === NONE || right === NONE) return
    const leftMinusRight = evidence[line] === UPHILL_UNKNOWN ? null : evidence[line]!
    edges[left]!.push({
      line,
      to: right,
      levelChange: leftMinusRight === null ? null : -leftMinusRight,
    })
    edges[right]!.push({ line, to: left, levelChange: leftMinusRight })
  })

  const level = new Float64Array(regionCount).fill(Number.NaN)
  const guesses = new Float64Array(regionCount).fill(Number.POSITIVE_INFINITY)
  const entrySlope = new Int8Array(regionCount)
  const component = new Int32Array(regionCount).fill(NONE)
  const queue: number[] = []

  const relaxFrom = (seedComponent: number) => {
    while (queue.length > 0) {
      const region = queue.shift()!
      for (const edge of edges[region]!) {
        const isGuess = edge.levelChange === null
        const change = edge.levelChange ?? entrySlope[region]!
        if (change === 0) continue
        const cost = guesses[region]! + (isGuess ? 1 : 0)
        if (cost >= guesses[edge.to]!) continue
        guesses[edge.to] = cost
        level[edge.to] = level[region]! + change
        entrySlope[edge.to] = change
        component[edge.to] = seedComponent
        if (isGuess) queue.push(edge.to)
        else queue.unshift(edge.to)
      }
    }
  }

  const seed = (region: number, slope: number, seedComponent: number) => {
    level[region] = 0
    guesses[region] = 0
    entrySlope[region] = slope
    component[region] = seedComponent
    queue.push(region)
  }

  let nextComponent = 0
  if (lowestRegions.size > 0) {
    lowestRegions.forEach(region => seed(region, 1, nextComponent))
    relaxFrom(nextComponent++)
  }
  for (let region = 0; region < regionCount; region++) {
    if (component[region] !== NONE || edges[region]!.length === 0) continue
    seed(region, 0, nextComponent)
    relaxFrom(nextComponent++)
  }
  return { level, component }
}
