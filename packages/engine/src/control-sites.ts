import type { LocalPoint, MapFeature } from '@ratamestari/core'
import {
  CONTROL_SITE_DIFFICULTY,
  isomSymbolRule,
  LEADING_FEATURES,
  RUNNABILITY,
  type ControlSite,
} from '@ratamestari/rules'
import { BLOCKED, type CostGrid } from './cost-grid'
import { cellIndexOf, fillPolygon, traceLine, type GridFrame } from './raster'

export type SitePlacement = 'point' | 'lineEnd' | 'smallArea' | 'areaCorner'
export type LeadingFeatureDistance = 'on' | 'near' | 'far'
export type TechnicalDifficulty = 1 | 2 | 3 | 4 | 5

export interface ControlSiteCandidate {
  readonly id: number
  readonly position: LocalPoint
  readonly isomCode: string
  readonly symbolNumber: number
  readonly placement: SitePlacement
  readonly distanceToLeadingFeatureMeters: number
  readonly leadingFeatureDistance: LeadingFeatureDistance
  readonly inSlowTerrain: boolean
  readonly technicalDifficulty: TechnicalDifficulty
}

const MERGE_DISTANCE_METERS = 10
const CORNER_MIN_TURN_DEGREES = 45
const CORNER_MEASURING_DISTANCE_METERS = 10
const SMALL_AREA_MAX_SQUARE_METERS = 2500
const AVOIDED_SITE_RULES: ReadonlySet<ControlSite> = new Set(['avoid'])

const BASE_DIFFICULTY: Readonly<Record<SitePlacement, number>> = {
  areaCorner: 1,
  lineEnd: 2,
  smallArea: 2,
  point: 3,
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
}

export function findControlSites(
  features: readonly MapFeature[],
  grid: CostGrid,
): ControlSiteCandidate[] {
  const leadingDistance = distanceToLeadingFeatures(features, grid)
  const avoided = avoidedAreaMask(features, grid)
  const accepted: ControlSiteCandidate[] = []
  const occupied = new Map<string, LocalPoint[]>()

  for (const raw of rawSites(features)) {
    const index = cellIndexOf(grid, raw.position)
    if (index === null || avoided[index] || !isReachable(grid, index)) continue
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
      distanceToLeadingFeatureMeters: distance,
      leadingFeatureDistance: band,
      inSlowTerrain: fastestNearby(grid, index) < RUNNABILITY[2].minSpeedFraction,
      technicalDifficulty: Math.min(
        5,
        BASE_DIFFICULTY[raw.placement] + DISTANCE_DIFFICULTY[band],
      ) as TechnicalDifficulty,
    })
  }
  return accepted
}

function* rawSites(features: readonly MapFeature[]): Generator<RawSite> {
  const withRule = features.flatMap(feature => {
    const rule = feature.isomCode === null ? undefined : isomSymbolRule(feature.isomCode)
    return rule ? [{ feature, controlSite: rule.controlSite }] : []
  })
  for (const { feature, controlSite } of withRule) {
    if (controlSite === 'yes' && feature.geometry.type === 'Point') {
      yield { position: feature.geometry.coordinates, feature, placement: 'point' }
    }
  }
  for (const { feature, controlSite } of withRule) {
    const { geometry } = feature
    if (controlSite !== 'yes' || geometry.type !== 'LineString') continue
    const points = geometry.coordinates
    const first = points[0]!
    const last = points[points.length - 1]!
    yield { position: first, feature, placement: 'lineEnd' }
    if (distanceBetween(first, last) > MERGE_DISTANCE_METERS) {
      yield { position: last, feature, placement: 'lineEnd' }
    }
  }
  for (const { feature, controlSite } of withRule) {
    const { geometry } = feature
    if (controlSite !== 'yes' || geometry.type !== 'Polygon') continue
    const outer = geometry.coordinates[0]!
    if (Math.abs(signedArea(outer)) <= SMALL_AREA_MAX_SQUARE_METERS) {
      yield { position: centroid(outer), feature, placement: 'smallArea' }
    }
  }
  for (const { feature, controlSite } of withRule) {
    const { geometry } = feature
    if (controlSite !== 'edge' || geometry.type !== 'Polygon') continue
    for (const ring of geometry.coordinates) {
      for (const corner of corners(ring))
        yield { position: corner, feature, placement: 'areaCorner' }
    }
  }
}

function corners(ring: readonly LocalPoint[]): LocalPoint[] {
  const closed =
    ring.length > 1 && distanceBetween(ring[0]!, ring[ring.length - 1]!) === 0
      ? ring.slice(0, -1)
      : ring
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
  return closed.filter((vertex, i) => {
    const before = pointAtDistance(i, -1)
    const after = pointAtDistance(i, 1)
    const inX = vertex[0] - before[0]
    const inY = vertex[1] - before[1]
    const outX = after[0] - vertex[0]
    const outY = after[1] - vertex[1]
    const lengths = Math.hypot(inX, inY) * Math.hypot(outX, outY)
    if (lengths === 0) return false
    const cosine = Math.max(-1, Math.min(1, (inX * outX + inY * outY) / lengths))
    return (Math.acos(cosine) * 180) / Math.PI >= CORNER_MIN_TURN_DEGREES
  })
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

function chamferDistance(distance: Float32Array, frame: GridFrame) {
  const straight = frame.cellSizeMeters
  const diagonal = frame.cellSizeMeters * Math.SQRT2
  const { columns, rows } = frame
  const relax = (i: number, neighbour: number, step: number) => {
    const candidate = distance[neighbour]! + step
    if (candidate < distance[i]!) distance[i] = candidate
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const i = r * columns + c
      if (c > 0) relax(i, i - 1, straight)
      if (r > 0) {
        relax(i, i - columns, straight)
        if (c > 0) relax(i, i - columns - 1, diagonal)
        if (c < columns - 1) relax(i, i - columns + 1, diagonal)
      }
    }
  }
  for (let r = rows - 1; r >= 0; r--) {
    for (let c = columns - 1; c >= 0; c--) {
      const i = r * columns + c
      if (c < columns - 1) relax(i, i + 1, straight)
      if (r < rows - 1) {
        relax(i, i + columns, straight)
        if (c < columns - 1) relax(i, i + columns + 1, diagonal)
        if (c > 0) relax(i, i + columns - 1, diagonal)
      }
    }
  }
}

function avoidedAreaMask(features: readonly MapFeature[], frame: GridFrame): Uint8Array {
  const mask = new Uint8Array(frame.columns * frame.rows)
  for (const { isomCode, geometry } of features) {
    const rule = isomCode === null ? undefined : isomSymbolRule(isomCode)
    if (!rule || !AVOIDED_SITE_RULES.has(rule.controlSite) || geometry.type !== 'Polygon') continue
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
  const n = points.length
  const x = points.reduce((sum, p) => sum + p[0], 0) / n
  const y = points.reduce((sum, p) => sum + p[1], 0) / n
  return [x, y] as const as LocalPoint
}
