import { localPoint, type LocalPoint } from '@ratamestari/core'
import type { TechnicalAreaRule } from '@ratamestari/rules'
import type { ControlSiteCandidate } from './control-sites'
import { BLOCKED, routableCellOf, type CostGrid } from './cost-grid'
import { convexHull, convexHullArea } from './course-metrics'

export interface TechnicalArea {
  // Indices into the pool the areas were found in.
  readonly sites: readonly number[]
  readonly centre: LocalPoint
  readonly hull: readonly LocalPoint[]
  readonly areaSquareMetres: number
  readonly meanQuality: number
  // About how much course the area holds without crowding: legs of the format's typical
  // technical length between well-spread sites.
  readonly capacitySeconds: number
}

const NOISE = -1
const UNVISITED = -2
const MEDOID_ITERATIONS = 5

const distanceBetween = (a: LocalPoint, b: LocalPoint) => Math.hypot(b[0] - a[0], b[1] - a[1])

export function findTechnicalAreas(
  pool: readonly ControlSiteCandidate[],
  quality: Float32Array,
  rule: TechnicalAreaRule,
  grid: CostGrid,
  paceSecondsPerKm: number,
): TechnicalArea[] {
  const candidates = pool.flatMap((_, i) => (quality[i]! >= rule.minQuality ? [i] : []))
  const positionOf = (i: number) => pool[i]!.position
  return clusterByDensity(candidates, positionOf, rule.clusterRadiusMetres, rule.minPoints)
    .flatMap(cluster => splitLarge(cluster, positionOf, rule.maxAreaSquareMetres))
    .filter(
      sites =>
        sites.length >= rule.minPoints &&
        convexHullArea(sites.map(positionOf)) >= rule.minAreaSquareMetres,
    )
    .map(sites => describeArea(sites, pool, quality, rule, grid, paceSecondsPerKm))
    .sort((a, b) => b.meanQuality * b.capacitySeconds - a.meanQuality * a.capacitySeconds)
}

// DBSCAN: deterministic, needs no cluster count and leaves weak, scattered sites as noise.
function clusterByDensity(
  indices: readonly number[],
  positionOf: (i: number) => LocalPoint,
  radius: number,
  minPoints: number,
): number[][] {
  const bucketKey = (point: LocalPoint) =>
    `${Math.floor(point[0] / radius)},${Math.floor(point[1] / radius)}`
  const buckets = new Map<string, number[]>()
  for (const i of indices) {
    const key = bucketKey(positionOf(i))
    const bucket = buckets.get(key)
    if (bucket) bucket.push(i)
    else buckets.set(key, [i])
  }
  const neighbours = (i: number) => {
    const [x, y] = positionOf(i)
    const bx = Math.floor(x / radius)
    const by = Math.floor(y / radius)
    const found: number[] = []
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const j of buckets.get(`${bx + dx},${by + dy}`) ?? []) {
          if (distanceBetween(positionOf(i), positionOf(j)) <= radius) found.push(j)
        }
      }
    }
    return found
  }

  const label = new Map<number, number>(indices.map(i => [i, UNVISITED]))
  const clusters: number[][] = []
  for (const i of indices) {
    if (label.get(i) !== UNVISITED) continue
    const seeds = neighbours(i)
    if (seeds.length < minPoints) {
      label.set(i, NOISE)
      continue
    }
    const cluster: number[] = []
    const id = clusters.length
    clusters.push(cluster)
    const queue = [...seeds]
    for (let q = 0; q < queue.length; q++) {
      const j = queue[q]!
      const was = label.get(j)
      if (was === NOISE) {
        label.set(j, id)
        cluster.push(j)
      }
      if (was !== UNVISITED) continue
      label.set(j, id)
      cluster.push(j)
      const around = neighbours(j)
      if (around.length >= minPoints) queue.push(...around)
    }
  }
  return clusters
}

// k-medoids with medoids seeded by farthest-point sampling, so the split is deterministic.
function splitLarge(
  cluster: readonly number[],
  positionOf: (i: number) => LocalPoint,
  maxAreaSquareMetres: number,
): number[][] {
  const area = convexHullArea(cluster.map(positionOf))
  const parts = Math.ceil(area / maxAreaSquareMetres)
  if (parts <= 1) return [[...cluster]]
  let medoids = farthestPoints(cluster, positionOf, parts)
  let groups: number[][] = []
  for (let iteration = 0; iteration < MEDOID_ITERATIONS; iteration++) {
    groups = medoids.map(() => [])
    for (const i of cluster) {
      let nearest = 0
      medoids.forEach((medoid, m) => {
        if (
          distanceBetween(positionOf(i), positionOf(medoid)) <
          distanceBetween(positionOf(i), positionOf(medoids[nearest]!))
        ) {
          nearest = m
        }
      })
      groups[nearest]!.push(i)
    }
    const next = groups.map((group, m) =>
      group.length === 0 ? medoids[m]! : medoidOf(group, positionOf),
    )
    if (next.every((medoid, m) => medoid === medoids[m])) break
    medoids = next
  }
  return groups.filter(group => group.length > 0)
}

function farthestPoints(
  indices: readonly number[],
  positionOf: (i: number) => LocalPoint,
  count: number,
): number[] {
  const chosen = [medoidOf(indices, positionOf)]
  while (chosen.length < count) {
    let farthest = indices[0]!
    let farthestDistance = -1
    for (const i of indices) {
      const nearestChosen = Math.min(
        ...chosen.map(c => distanceBetween(positionOf(i), positionOf(c))),
      )
      if (nearestChosen > farthestDistance) {
        farthestDistance = nearestChosen
        farthest = i
      }
    }
    chosen.push(farthest)
  }
  return chosen
}

// The member nearest the group's mean position: cheap, and good enough for compact clusters.
function medoidOf(group: readonly number[], positionOf: (i: number) => LocalPoint): number {
  const meanX = group.reduce((sum, i) => sum + positionOf(i)[0], 0) / group.length
  const meanY = group.reduce((sum, i) => sum + positionOf(i)[1], 0) / group.length
  return group.reduce((a, b) =>
    Math.hypot(positionOf(b)[0] - meanX, positionOf(b)[1] - meanY) <
    Math.hypot(positionOf(a)[0] - meanX, positionOf(a)[1] - meanY)
      ? b
      : a,
  )
}

function describeArea(
  sites: readonly number[],
  pool: readonly ControlSiteCandidate[],
  quality: Float32Array,
  rule: TechnicalAreaRule,
  grid: CostGrid,
  paceSecondsPerKm: number,
): TechnicalArea {
  const positions = sites.map(i => pool[i]!.position)
  const totalQuality = sites.reduce((sum, i) => sum + quality[i]!, 0)
  const centre = localPoint(
    sites.reduce((sum, i) => sum + pool[i]!.position[0] * quality[i]!, 0) / totalQuality,
    sites.reduce((sum, i) => sum + pool[i]!.position[1] * quality[i]!, 0) / totalQuality,
  )
  const spread = spreadSites(sites, pool, quality, rule.capacityLegMetres)
  const speeds = sites.flatMap(i => {
    const cell = routableCellOf(grid, pool[i]!.position)
    const speed = cell === null ? BLOCKED : grid.speed[cell]!
    return speed === BLOCKED ? [] : [speed]
  })
  const meanSpeed = speeds.length === 0 ? 1 : speeds.reduce((sum, s) => sum + s, 0) / speeds.length
  const typicalLegSeconds = (rule.capacityLegMetres * paceSecondsPerKm) / 1000 / meanSpeed
  return {
    sites,
    centre,
    hull: convexHull(positions),
    areaSquareMetres: convexHullArea(positions),
    meanQuality: totalQuality / sites.length,
    capacitySeconds: Math.max(0, spread - 1) * typicalLegSeconds,
  }
}

// How many sites, best first, can be picked at least `separation` apart. Best-first packs the
// area more fully than farthest-point sampling would.
function spreadSites(
  sites: readonly number[],
  pool: readonly ControlSiteCandidate[],
  quality: Float32Array,
  separation: number,
): number {
  const picked: LocalPoint[] = []
  for (const i of [...sites].sort((a, b) => quality[b]! - quality[a]!)) {
    const position = pool[i]!.position
    if (picked.every(other => distanceBetween(other, position) >= separation)) picked.push(position)
  }
  return picked.length
}
