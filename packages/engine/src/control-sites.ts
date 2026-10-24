import type { LocalPoint, MapFeature } from '@ratamestari/core'
import {
  CONTOUR_FEATURE_SITES,
  CONTROL_CIRCLE,
  CONTROL_SITE_DIFFICULTY,
  isomDescription,
  isomSymbolRule,
  LEADING_FEATURES,
  LINE_FEATURE_SITES,
  RUNNABILITY,
} from '@ratamestari/rules'
import { BLOCKED, type CostGrid } from './cost-grid'
import { polylineLength } from './polyline'
import { cellIndexOf, chamferDistance, fillPolygon, traceLine, type GridFrame } from './raster'
import { LEFT_IS_UPHILL, RIGHT_IS_UPHILL, type ContourLine } from './relief'
import type { Terrain } from './terrain'

export type SitePlacement =
  'point' | 'contourKnoll' | 'contourBend' | 'lineCentre' | 'lineEnd' | 'smallArea' | 'areaCorner'
export type ContourForm = 'knoll' | 'depression' | 'spur' | 'reEntrant'
export type LeadingFeatureDistance = 'on' | 'near' | 'far'
export type TechnicalDifficulty = 1 | 2 | 3 | 4 | 5

export type SiteOrientation =
  | { readonly kind: 'end'; readonly pointingRadians: number }
  | {
      readonly kind: 'corner'
      readonly pointingRadians: number
      readonly turnDegrees: number
      readonly isConvex: boolean
    }

export type Offset = readonly [dx: number, dy: number]

export interface ControlSiteCandidate {
  readonly id: number
  readonly position: LocalPoint
  readonly isomCode: string
  readonly symbolNumber: number
  readonly placement: SitePlacement
  readonly contourForm: ContourForm | null
  readonly distanceToLeadingFeatureMeters: number
  readonly leadingFeatureDistance: LeadingFeatureDistance
  readonly inSlowTerrain: boolean
  readonly technicalDifficulty: TechnicalDifficulty
  readonly orientation: SiteOrientation | null
  readonly similarFeatureOffsets: readonly Offset[]
}

const MERGE_DISTANCE_METERS = 10
const CORNER_MIN_TURN_DEGREES = 45
const CORNER_MEASURING_DISTANCE_METERS = 10
const CORNER_SIDE_SAMPLE_METERS = 6
const SMALL_AREA_MAX_SQUARE_METERS = 2500
const SLOPE_TICK_MAX_DISTANCE_FROM_LINE_METERS = 3
const CONTOUR_SYMBOL_ISOM_CODES = new Set(['101', '102', '103'])
const AREA_DRAWING_ORDER_TOP_FIRST = [
  '521',
  '520',
  '301',
  '307',
  '302',
  '410',
  '408',
  '409',
  '406',
  '407',
  '214',
  '501',
  '522',
  '412',
  '401',
  '402',
  '403',
  '404',
]

const BASE_DIFFICULTY: Readonly<Record<SitePlacement, number>> = {
  areaCorner: 1,
  lineEnd: 2,
  lineCentre: 2,
  smallArea: 2,
  point: 3,
  contourKnoll: 3,
  contourBend: 3,
}
const DISTANCE_DIFFICULTY: Readonly<Record<LeadingFeatureDistance, number>> = {
  on: 0,
  near: 1,
  far: 2,
}

interface RawSite {
  readonly position: LocalPoint
  readonly feature: MapFeature
  readonly placement: SitePlacement
  readonly contourForm: ContourForm | null
  readonly orientation: SiteOrientation | null
}

export function findControlSites(
  features: readonly MapFeature[],
  terrain: Terrain,
): ControlSiteCandidate[] {
  const { grid } = terrain
  const leadingDistance = distanceToLeadingFeatures(features, grid)
  const avoided = avoidedAreaMask(features, grid)
  const nearForbidden = nearForbiddenMask(features, grid)
  const visibleArea = visibleAreaCodes(features, grid)
  const accepted: ControlSiteCandidate[] = []
  const acceptedRaw: RawSite[] = []
  const occupied = new Map<string, LocalPoint[]>()
  const similarityPool = new SimilarityPool()

  for (const raw of rawSites(features, terrain, visibleArea)) {
    similarityPool.add(raw)
    const index = cellIndexOf(grid, raw.position)
    if (index === null || !terrain.mappedArea[index] || avoided[index]) continue
    if (nearForbidden[index]) continue
    if (!isReachable(grid, index)) continue
    if (isNearAccepted(occupied, raw.position)) continue
    occupy(occupied, raw.position)

    const distance = leadingDistance[index]!
    const band: LeadingFeatureDistance =
      distance <= CONTROL_SITE_DIFFICULTY.onLeadingFeatureMaxMeters
        ? 'on'
        : distance <= CONTROL_SITE_DIFFICULTY.nearLeadingFeatureMaxMeters
          ? 'near'
          : 'far'
    accepted.push({
      id: accepted.length,
      position: raw.position,
      isomCode: raw.feature.isomCode!,
      symbolNumber: raw.feature.symbolNumber,
      placement: raw.placement,
      contourForm: raw.contourForm,
      distanceToLeadingFeatureMeters: distance,
      leadingFeatureDistance: band,
      inSlowTerrain: fastestNearby(grid, index) < RUNNABILITY[2].minSpeedFraction,
      technicalDifficulty: Math.min(
        5,
        isLeadingLineEnd(raw) ? 1 : BASE_DIFFICULTY[raw.placement] + DISTANCE_DIFFICULTY[band],
      ) as TechnicalDifficulty,
      orientation: raw.orientation,
      similarFeatureOffsets: [],
    })
    acceptedRaw.push(raw)
  }
  return accepted.map((site, i) => ({
    ...site,
    similarFeatureOffsets: similarityPool.offsetsAround(acceptedRaw[i]!),
  }))
}

const SIMILARITY_RADIUS_METERS = CONTROL_CIRCLE.footprintMeters / 2
const SAME_FEATURE_METERS = 0.5

function similarityKey(raw: RawSite): string | null {
  if (raw.placement === 'contourKnoll') return raw.contourForm && `contour:${raw.contourForm}`
  if (raw.placement !== 'point' && raw.placement !== 'smallArea') return null
  const code = raw.feature.isomCode!
  return `feature:${isomDescription(code)?.feature ?? code}`
}

class SimilarityPool {
  private readonly byKey = new Map<string, Map<string, LocalPoint[]>>()

  add(raw: RawSite) {
    const key = similarityKey(raw)
    if (key === null) return
    let buckets = this.byKey.get(key)
    if (!buckets) this.byKey.set(key, (buckets = new Map()))
    const bucketKey = this.bucketKeyOf(raw.position).join(',')
    const bucket = buckets.get(bucketKey)
    if (bucket) bucket.push(raw.position)
    else buckets.set(bucketKey, [raw.position])
  }

  offsetsAround(raw: RawSite): Offset[] {
    const key = similarityKey(raw)
    const buckets = key === null ? undefined : this.byKey.get(key)
    if (!buckets) return []
    const [bx, by] = this.bucketKeyOf(raw.position)
    const offsets: Offset[] = []
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const other of buckets.get(`${bx + dx},${by + dy}`) ?? []) {
          const offset = [other[0] - raw.position[0], other[1] - raw.position[1]] as const
          const distance = Math.hypot(...offset)
          if (distance > SAME_FEATURE_METERS && distance <= SIMILARITY_RADIUS_METERS) {
            offsets.push(offset)
          }
        }
      }
    }
    return offsets
  }

  private bucketKeyOf([x, y]: LocalPoint) {
    return [
      Math.floor(x / SIMILARITY_RADIUS_METERS),
      Math.floor(y / SIMILARITY_RADIUS_METERS),
    ] as const
  }
}

function* rawSites(
  features: readonly MapFeature[],
  terrain: Terrain,
  visibleArea: VisibleAreaCodes,
): Generator<RawSite> {
  const withRule = features.flatMap(feature => {
    const rule = feature.isomCode === null ? undefined : isomSymbolRule(feature.isomCode)
    return rule ? [{ feature, controlSite: rule.controlSite }] : []
  })
  const site = (
    position: LocalPoint,
    feature: MapFeature,
    placement: SitePlacement,
    contourForm: ContourForm | null = null,
    orientation: SiteOrientation | null = null,
  ): RawSite => ({ position, feature, placement, contourForm, orientation })

  for (const { feature, controlSite } of withRule) {
    if (controlSite === 'yes' && feature.geometry.type === 'Point') {
      yield site(feature.geometry.coordinates, feature, 'point')
    }
  }
  yield* contourSymbolPoints(features)
  yield* contourKnolls(features, terrain)
  for (const { feature, controlSite } of withRule) {
    const { geometry } = feature
    if (controlSite !== 'yes' || geometry.type !== 'LineString') continue
    const isControlledAlong = LINE_FEATURE_SITES.controlledAlongLengthIsomCodes.includes(
      feature.isomCode!,
    )
    const length = polylineLength(geometry.coordinates)
    if (isControlledAlong && length <= LINE_FEATURE_SITES.maxLengthForCentreSiteMeters) {
      yield site(pointAlong(geometry.coordinates, length / 2), feature, 'lineCentre')
    }
  }
  for (const { feature, controlSite } of withRule) {
    const { geometry } = feature
    if (controlSite !== 'yes' || geometry.type !== 'LineString') continue
    const points = geometry.coordinates
    const last = points.length - 1
    yield site(points[0]!, feature, 'lineEnd', null, endOrientation(points, 0, 1))
    yield site(points[last]!, feature, 'lineEnd', null, endOrientation(points, last, -1))
  }
  yield* contourBends(features, terrain)
  for (const { feature, controlSite } of withRule) {
    const { geometry } = feature
    if (controlSite !== 'yes' || geometry.type !== 'Polygon') continue
    const outer = geometry.coordinates[0]!
    if (Math.abs(signedArea(outer)) <= SMALL_AREA_MAX_SQUARE_METERS) {
      yield site(centroid(outer), feature, 'smallArea')
    }
  }
  for (const { feature, controlSite } of withRule) {
    const { geometry } = feature
    if (controlSite !== 'edge' || geometry.type !== 'Polygon') continue
    for (const ring of geometry.coordinates) {
      for (const corner of corners(ring)) {
        if (isVisibleCorner(corner, geometry.coordinates, feature.isomCode!, visibleArea)) {
          const orientation = cornerOrientation(corner, geometry.coordinates)
          yield site(corner.position, feature, 'areaCorner', null, orientation)
        }
      }
    }
  }
}

function* contourSymbolPoints(features: readonly MapFeature[]): Generator<RawSite> {
  const isNearContourLine = contourLineProximity(features, SLOPE_TICK_MAX_DISTANCE_FROM_LINE_METERS)
  for (const feature of features) {
    const { isomCode, geometry } = feature
    if (isomCode === null || !CONTOUR_SYMBOL_ISOM_CODES.has(isomCode)) continue
    if (geometry.type !== 'Point' || isNearContourLine(geometry.coordinates)) continue
    yield {
      position: geometry.coordinates,
      feature,
      placement: 'point',
      contourForm: null,
      orientation: null,
    }
  }
}

function contourLineProximity(features: readonly MapFeature[], maxDistanceMeters: number) {
  const bucketSize = Math.max(maxDistanceMeters, 1) * 4
  const buckets = new Map<string, [LocalPoint, LocalPoint][]>()
  const keyOf = (x: number, y: number) =>
    `${Math.floor(x / bucketSize)},${Math.floor(y / bucketSize)}`
  for (const { isomCode, geometry } of features) {
    if (isomCode === null || !CONTOUR_SYMBOL_ISOM_CODES.has(isomCode)) continue
    if (geometry.type !== 'LineString') continue
    const points = geometry.coordinates
    for (let i = 1; i < points.length; i++) {
      const segment: [LocalPoint, LocalPoint] = [points[i - 1]!, points[i]!]
      const keys: string[] = []
      const [[ax, ay], [bx, by]] = segment
      for (
        let y = Math.floor(Math.min(ay, by) / bucketSize);
        y <= Math.floor(Math.max(ay, by) / bucketSize);
        y++
      ) {
        for (
          let x = Math.floor(Math.min(ax, bx) / bucketSize);
          x <= Math.floor(Math.max(ax, bx) / bucketSize);
          x++
        ) {
          keys.push(`${x},${y}`)
        }
      }
      for (const key of keys) {
        const bucket = buckets.get(key)
        if (bucket) bucket.push(segment)
        else buckets.set(key, [segment])
      }
    }
  }
  return ([x, y]: LocalPoint) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nearby = buckets.get(keyOf(x + dx * bucketSize, y + dy * bucketSize)) ?? []
        if (
          nearby.some(
            segment =>
              distanceToPolyline([x, y] as const as LocalPoint, segment) <= maxDistanceMeters,
          )
        ) {
          return true
        }
      }
    }
    return false
  }
}

function* contourKnolls(features: readonly MapFeature[], terrain: Terrain): Generator<RawSite> {
  const { lines, uphillSides } = terrain.contours
  const lineIdByPoints = new Map(lines.map((line, id) => [line.points, id]))
  const closedRings = closedContourRings(features)
  for (const ring of closedRings) {
    const area = Math.abs(signedArea(ring.points))
    if (area > CONTOUR_FEATURE_SITES.maxClosedContourAreaSquareMeters) continue
    const hasInnerRing = closedRings.some(
      other =>
        other !== ring &&
        boundsContain(ring.bounds, other.bounds) &&
        isInsideRing(other.points[0]!, ring.points),
    )
    if (hasInnerRing) continue
    const lineId = lineIdByPoints.get(ring.points)
    yield {
      position: centroid(ring.points),
      feature: ring.feature,
      placement: 'contourKnoll',
      orientation: null,
      contourForm:
        lineId === undefined ? null : closedContourForm(lines[lineId], uphillSides[lineId]),
    }
  }
}

function* contourBends(features: readonly MapFeature[], terrain: Terrain): Generator<RawSite> {
  const { lines, uphillSides } = terrain.contours
  const lineIdByPoints = new Map(lines.map((line, id) => [line.points, id]))
  for (const feature of features) {
    if (feature.isomCode === null || !CONTOUR_SYMBOL_ISOM_CODES.has(feature.isomCode)) continue
    if (feature.geometry.type !== 'LineString') continue
    const points = feature.geometry.coordinates
    if (isSmallClosedRing(points)) continue
    const lineId = lineIdByPoints.get(points)
    const uphillSide = lineId === undefined ? undefined : uphillSides[lineId]
    for (const bend of sharpestBends(points)) {
      const insideIsUphill =
        uphillSide === LEFT_IS_UPHILL
          ? bend.turnsLeft
          : uphillSide === RIGHT_IS_UPHILL
            ? !bend.turnsLeft
            : null
      yield {
        position: bend.position,
        feature,
        placement: 'contourBend',
        orientation: null,
        contourForm: insideIsUphill === null ? null : insideIsUphill ? 'spur' : 'reEntrant',
      }
    }
  }
}

interface ClosedRing {
  readonly points: readonly LocalPoint[]
  readonly feature: MapFeature
  readonly bounds: readonly [number, number, number, number]
}

function closedContourRings(features: readonly MapFeature[]): ClosedRing[] {
  const rings: ClosedRing[] = []
  for (const feature of features) {
    const { isomCode, geometry } = feature
    if (isomCode === null || !CONTOUR_SYMBOL_ISOM_CODES.has(isomCode)) continue
    const lineRings =
      geometry.type === 'LineString'
        ? [geometry.coordinates]
        : geometry.type === 'Polygon'
          ? geometry.coordinates
          : []
    for (const points of lineRings) {
      if (isClosed(points)) rings.push({ points, feature, bounds: boundsOf(points) })
    }
  }
  return rings
}

function closedContourForm(line: ContourLine | undefined, uphillSide: number | undefined) {
  if (!line || uphillSide === undefined) return null
  const insideIsLeft = signedArea(line.points) > 0
  if (uphillSide === LEFT_IS_UPHILL) return insideIsLeft ? 'knoll' : 'depression'
  if (uphillSide === RIGHT_IS_UPHILL) return insideIsLeft ? 'depression' : 'knoll'
  return null
}

const isSmallClosedRing = (points: readonly LocalPoint[]) =>
  isClosed(points) &&
  Math.abs(signedArea(points)) <= CONTOUR_FEATURE_SITES.maxClosedContourAreaSquareMeters

function sharpestBends(points: readonly LocalPoint[]) {
  const window = CONTOUR_FEATURE_SITES.bendMeasuringDistanceMeters
  const turns = points.map((vertex, i) => {
    const before = pointAtDistanceAlong(points, i, -1, window)
    const after = pointAtDistanceAlong(points, i, 1, window)
    return before && after ? signedTurnDegrees(before, vertex, after) : 0
  })
  const cumulative = cumulativeLengths(points)
  return points.flatMap((position, i) => {
    const turn = Math.abs(turns[i]!)
    if (turn < CONTOUR_FEATURE_SITES.bendMinTurnDegrees) return []
    let isLocalMaximum = true
    for (const step of [-1, 1]) {
      for (
        let j = i + step;
        j >= 0 && j < points.length && Math.abs(cumulative[j]! - cumulative[i]!) <= window;
        j += step
      ) {
        const other = Math.abs(turns[j]!)
        if (other > turn || (other === turn && j < i)) isLocalMaximum = false
      }
    }
    return isLocalMaximum ? [{ position, turnsLeft: turns[i]! > 0 }] : []
  })
}

function pointAtDistanceAlong(
  points: readonly LocalPoint[],
  from: number,
  step: 1 | -1,
  distance: number,
): LocalPoint | null {
  let travelled = 0
  for (let i = from; i + step >= 0 && i + step < points.length; i += step) {
    travelled += distanceBetween(points[i]!, points[i + step]!)
    if (travelled >= distance) return points[i + step]!
  }
  return null
}

function cumulativeLengths(points: readonly LocalPoint[]): number[] {
  const lengths = [0]
  for (let i = 1; i < points.length; i++) {
    lengths.push(lengths[i - 1]! + distanceBetween(points[i - 1]!, points[i]!))
  }
  return lengths
}

function signedTurnDegrees(before: LocalPoint, vertex: LocalPoint, after: LocalPoint): number {
  const inX = vertex[0] - before[0]
  const inY = vertex[1] - before[1]
  const outX = after[0] - vertex[0]
  const outY = after[1] - vertex[1]
  return (Math.atan2(inX * outY - inY * outX, inX * outX + inY * outY) * 180) / Math.PI
}

const END_DIRECTION_MEASURING_METERS = 10

function endOrientation(
  points: readonly LocalPoint[],
  end: number,
  inward: 1 | -1,
): SiteOrientation | null {
  const inside =
    pointAtDistanceAlong(points, end, inward, END_DIRECTION_MEASURING_METERS) ??
    points[end + inward]
  if (!inside) return null
  const tip = points[end]!
  return { kind: 'end', pointingRadians: Math.atan2(tip[1] - inside[1], tip[0] - inside[0]) }
}

function cornerOrientation(
  corner: Corner,
  rings: readonly (readonly LocalPoint[])[],
): SiteOrientation | null {
  const unit = (to: LocalPoint) => {
    const dx = to[0] - corner.position[0]
    const dy = to[1] - corner.position[1]
    const length = Math.hypot(dx, dy) || 1
    return [dx / length, dy / length] as const
  }
  const [bx, by] = unit(corner.before)
  const [ax, ay] = unit(corner.after)
  const length = Math.hypot(bx + ax, by + ay)
  if (length === 0) return null
  const intoAngle = [(bx + ax) / length, (by + ay) / length] as const
  const sample = [
    corner.position[0] + intoAngle[0] * CORNER_SIDE_SAMPLE_METERS,
    corner.position[1] + intoAngle[1] * CORNER_SIDE_SAMPLE_METERS,
  ] as const as LocalPoint
  return {
    kind: 'corner',
    pointingRadians: Math.atan2(-intoAngle[1], -intoAngle[0]),
    turnDegrees: Math.abs(signedTurnDegrees(corner.before, corner.position, corner.after)),
    isConvex: isInsideRings(sample, rings),
  }
}

interface Corner {
  readonly position: LocalPoint
  readonly before: LocalPoint
  readonly after: LocalPoint
}

function corners(ring: readonly LocalPoint[]): Corner[] {
  const closed = isClosed(ring) ? ring.slice(0, -1) : ring
  const n = closed.length
  if (n < 3) return []
  const pointAtDistance = (from: number, step: 1 | -1): LocalPoint => {
    let travelled = 0
    let i = from
    for (let k = 0; k < n - 1; k++) {
      const next = (i + step + n) % n
      travelled += distanceBetween(closed[i]!, closed[next]!)
      i = next
      if (travelled >= CORNER_MEASURING_DISTANCE_METERS) break
    }
    return closed[i]!
  }
  return closed.flatMap((position, i) => {
    const before = pointAtDistance(i, -1)
    const after = pointAtDistance(i, 1)
    const turn = Math.abs(signedTurnDegrees(before, position, after))
    return turn >= CORNER_MIN_TURN_DEGREES ? [{ position, before, after }] : []
  })
}

type VisibleAreaCodes = { readonly frame: GridFrame; readonly codeAt: Int16Array }
const NO_AREA = -1

function visibleAreaCodes(features: readonly MapFeature[], frame: GridFrame): VisibleAreaCodes {
  const codeAt = new Int16Array(frame.columns * frame.rows).fill(NO_AREA)
  for (const { isomCode, geometry } of features) {
    if (isomCode === null || geometry.type !== 'Polygon') continue
    const priority = AREA_DRAWING_ORDER_TOP_FIRST.indexOf(isomCode)
    if (priority === NO_AREA) continue
    fillPolygon(frame, geometry.coordinates, i => {
      if (codeAt[i] === NO_AREA || priority < codeAt[i]!) codeAt[i] = priority
    })
  }
  return { frame, codeAt }
}

function isVisibleCorner(
  corner: Corner,
  rings: readonly (readonly LocalPoint[])[],
  isomCode: string,
  visibleArea: VisibleAreaCodes,
): boolean {
  const ownPriority = AREA_DRAWING_ORDER_TOP_FIRST.indexOf(isomCode)
  if (ownPriority === NO_AREA) return true
  const unit = (to: LocalPoint) => {
    const dx = to[0] - corner.position[0]
    const dy = to[1] - corner.position[1]
    const length = Math.hypot(dx, dy) || 1
    return [dx / length, dy / length] as const
  }
  const [bx, by] = unit(corner.before)
  const [ax, ay] = unit(corner.after)
  const length = Math.hypot(bx + ax, by + ay)
  if (length === 0) return false
  const offsetX = ((bx + ax) / length) * CORNER_SIDE_SAMPLE_METERS
  const offsetY = ((by + ay) / length) * CORNER_SIDE_SAMPLE_METERS
  const sampleA = [
    corner.position[0] + offsetX,
    corner.position[1] + offsetY,
  ] as const as LocalPoint
  const sampleB = [
    corner.position[0] - offsetX,
    corner.position[1] - offsetY,
  ] as const as LocalPoint
  const [inside, outside] = isInsideRings(sampleA, rings) ? [sampleA, sampleB] : [sampleB, sampleA]
  const visibleAt = (p: LocalPoint) => {
    const index = cellIndexOf(visibleArea.frame, p)
    return index === null ? NO_AREA : visibleArea.codeAt[index]!
  }
  const sideA = [corner.position[0] - offsetY, corner.position[1] + offsetX] as const as LocalPoint
  const sideB = [corner.position[0] + offsetY, corner.position[1] - offsetX] as const as LocalPoint
  const sidesAgree = (visibleAt(sideA) === ownPriority) === (visibleAt(sideB) === ownPriority)
  return visibleAt(inside) === ownPriority && visibleAt(outside) !== ownPriority && sidesAgree
}

function distanceToLeadingFeatures(features: readonly MapFeature[], frame: GridFrame) {
  const lineCodes = new Set(LEADING_FEATURES.lineIsomCodes)
  const outlineCodes = new Set(LEADING_FEATURES.areaOutlineIsomCodes)
  const distance = new Float32Array(frame.columns * frame.rows).fill(Number.POSITIVE_INFINITY)
  const mark = (i: number) => (distance[i] = 0)
  for (const { isomCode, geometry } of features) {
    if (isomCode === null) continue
    if (lineCodes.has(isomCode) && geometry.type === 'LineString') {
      traceLine(frame, geometry.coordinates, mark)
    } else if (
      (lineCodes.has(isomCode) || outlineCodes.has(isomCode)) &&
      geometry.type === 'Polygon'
    ) {
      geometry.coordinates.forEach(ring => traceLine(frame, ring, mark))
    }
  }
  chamferDistance(distance, frame)
  return distance
}

function avoidedAreaMask(features: readonly MapFeature[], frame: GridFrame): Uint8Array {
  const mask = new Uint8Array(frame.columns * frame.rows)
  for (const { isomCode, geometry } of features) {
    const rule = isomCode === null ? undefined : isomSymbolRule(isomCode)
    if (rule?.controlSite !== 'avoid' || geometry.type !== 'Polygon') continue
    fillPolygon(frame, geometry.coordinates, i => (mask[i] = 1))
  }
  return mask
}

function neighbourhood(grid: CostGrid, index: number): number[] {
  const column = index % grid.columns
  const row = Math.floor(index / grid.columns)
  const cells: number[] = []
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = row + dr
      const c = column + dc
      if (r >= 0 && c >= 0 && r < grid.rows && c < grid.columns) cells.push(r * grid.columns + c)
    }
  }
  return cells
}

const isReachable = (grid: CostGrid, index: number) =>
  neighbourhood(grid, index).some(i => grid.speed[i] !== BLOCKED)

const fastestNearby = (grid: CostGrid, index: number) =>
  Math.max(...neighbourhood(grid, index).map(i => grid.speed[i]!))

const bucketOf = ([x, y]: LocalPoint) =>
  [Math.floor(x / MERGE_DISTANCE_METERS), Math.floor(y / MERGE_DISTANCE_METERS)] as const

function isNearAccepted(occupied: ReadonlyMap<string, LocalPoint[]>, position: LocalPoint) {
  const [bx, by] = bucketOf(position)
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nearby = occupied.get(`${bx + dx},${by + dy}`) ?? []
      if (nearby.some(p => distanceBetween(p, position) < MERGE_DISTANCE_METERS)) return true
    }
  }
  return false
}

function occupy(occupied: Map<string, LocalPoint[]>, position: LocalPoint) {
  const key = bucketOf(position).join(',')
  const bucket = occupied.get(key)
  if (bucket) bucket.push(position)
  else occupied.set(key, [position])
}

const distanceBetween = (a: LocalPoint, b: LocalPoint) => Math.hypot(b[0] - a[0], b[1] - a[1])

const isClosed = (points: readonly LocalPoint[]) =>
  points.length > 2 && distanceBetween(points[0]!, points[points.length - 1]!) <= 1

function pointAlong(points: readonly LocalPoint[], distance: number): LocalPoint {
  let travelled = 0
  for (let i = 1; i < points.length; i++) {
    const step = distanceBetween(points[i - 1]!, points[i]!)
    if (travelled + step >= distance && step > 0) {
      const t = (distance - travelled) / step
      const [ax, ay] = points[i - 1]!
      const [bx, by] = points[i]!
      return [ax + (bx - ax) * t, ay + (by - ay) * t] as const as LocalPoint
    }
    travelled += step
  }
  return points[points.length - 1]!
}

function distanceToPolyline(point: LocalPoint, line: readonly LocalPoint[]): number {
  let nearest = Number.POSITIVE_INFINITY
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1]!
    const [bx, by] = line[i]!
    const dx = bx - ax
    const dy = by - ay
    const lengthSquared = dx * dx + dy * dy
    const t =
      lengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, ((point[0] - ax) * dx + (point[1] - ay) * dy) / lengthSquared))
    nearest = Math.min(nearest, Math.hypot(point[0] - (ax + t * dx), point[1] - (ay + t * dy)))
  }
  return nearest
}

function isInsideRing([x, y]: LocalPoint, ring: readonly LocalPoint[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!
    const [xj, yj] = ring[j]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

const isInsideRings = (point: LocalPoint, rings: readonly (readonly LocalPoint[])[]) =>
  rings.filter(ring => isInsideRing(point, ring)).length % 2 === 1

function boundsOf(points: readonly LocalPoint[]): [number, number, number, number] {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const [x, y] of points) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  return [minX, minY, maxX, maxY]
}

const boundsContain = (
  outer: readonly [number, number, number, number],
  inner: readonly [number, number, number, number],
) => inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3]

function signedArea(points: readonly LocalPoint[]): number {
  let twiceArea = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]!
    const [x2, y2] = points[(i + 1) % points.length]!
    twiceArea += x1 * y2 - x2 * y1
  }
  return twiceArea / 2
}

function centroid(points: readonly LocalPoint[]): LocalPoint {
  const area = signedArea(points)
  if (area === 0) return points[0]!
  let x = 0
  let y = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]!
    const [x2, y2] = points[(i + 1) % points.length]!
    const cross = x1 * y2 - x2 * y1
    x += (x1 + x2) * cross
    y += (y1 + y2) * cross
  }
  return [x / (6 * area), y / (6 * area)] as const as LocalPoint
}

const LEADING_LINE_CODES = new Set(LEADING_FEATURES.lineIsomCodes)
const FORBIDDEN_MOVEMENTS = new Set([
  'forbidden',
  'forbiddenExceptLevelCrossings',
  'forbiddenAlong',
])
const SAFETY_DISTANCE_FROM_FORBIDDEN_METERS = 40

const isLeadingLineEnd = (raw: RawSite) =>
  raw.placement === 'lineEnd' && LEADING_LINE_CODES.has(raw.feature.isomCode!)

function nearForbiddenMask(features: readonly MapFeature[], frame: GridFrame): Uint8Array {
  const distance = new Float32Array(frame.columns * frame.rows).fill(Number.POSITIVE_INFINITY)
  const mark = (i: number) => (distance[i] = 0)
  for (const { isomCode, geometry } of features) {
    const movement = isomCode === null ? undefined : isomSymbolRule(isomCode)?.movement
    if (!movement || !FORBIDDEN_MOVEMENTS.has(movement.kind)) continue
    if (geometry.type === 'Polygon') {
      fillPolygon(frame, geometry.coordinates, mark)
      geometry.coordinates.forEach(ring => traceLine(frame, ring, mark))
    } else if (geometry.type === 'LineString') {
      traceLine(frame, geometry.coordinates, mark)
    }
  }
  chamferDistance(distance, frame)
  return Uint8Array.from(distance, d => (d < SAFETY_DISTANCE_FROM_FORBIDDEN_METERS ? 1 : 0))
}
