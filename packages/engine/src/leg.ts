import type { LocalPoint } from '@ratamestari/core'
import { ROUTE_CHOICE } from '@ratamestari/rules'
import { countContourCrossings } from './contours'
import type { CostGrid } from './cost-grid'
import { distanceToSegment } from './polyline'
import { cellIndexOf } from './raster'
import { findRoute, type Route, type RouteOptions } from './router'
import type { Terrain } from './terrain'

export interface LegEvaluation {
  readonly straightMeters: number
  readonly bearingDegrees: number
  readonly fastest: Route
  readonly alternatives: readonly Route[]
  readonly hasRouteChoice: boolean
  readonly lengthRatio: number
  readonly maxDeviationMeters: number
  readonly contourCrossings: number
  readonly climbMeters: number
  readonly descentMeters: number
  readonly unknownHeightChangeMeters: number
}

const CORRIDOR_SLOWDOWN = 4
const CORRIDORS_TRIED_PER_ALTERNATIVE = 2
const RELAXED_CORRIDOR_SHARE_OF_SEPARATION = 1 / 3
const RELAXATION_STEPS = 4
const RELAXATION_SETTLED_SHARE = 0.002

export function evaluateLeg(
  terrain: Terrain,
  from: LocalPoint,
  to: LocalPoint,
  routeOptions: RouteOptions = {},
): LegEvaluation | null {
  const { grid } = terrain
  const fastest = findRoute(grid, from, to, routeOptions)
  if (!fastest) return null

  const straightMeters = Math.hypot(to[0] - from[0], to[1] - from[1])
  const crossings = countContourCrossings(terrain.contours, fastest.points, grid.cellSizeMeters)
  const interval = terrain.contourIntervalMeters
  const alternatives = findAlternatives(grid, from, to, fastest, straightMeters, routeOptions)

  return {
    straightMeters,
    bearingDegrees: bearingDegrees(from, to),
    fastest,
    alternatives,
    hasRouteChoice: alternatives.length > 0,
    lengthRatio: straightMeters === 0 ? 1 : fastest.lengthMeters / straightMeters,
    maxDeviationMeters: Math.max(...fastest.points.map(p => distanceToSegment(p, from, to))),
    contourCrossings: crossings.up + crossings.down + crossings.unknown,
    climbMeters: crossings.up * interval,
    descentMeters: crossings.down * interval,
    unknownHeightChangeMeters: crossings.unknown * interval,
  }
}

function findAlternatives(
  grid: CostGrid,
  from: LocalPoint,
  to: LocalPoint,
  fastest: Route,
  straightMeters: number,
  routeOptions: RouteOptions,
): Route[] {
  const separationMeters = Math.max(
    ROUTE_CHOICE.minSeparationMeters,
    ROUTE_CHOICE.minSeparationShareOfStraightDistance * straightMeters,
  )
  const maxSeconds = fastest.timeSeconds * (1 + ROUTE_CHOICE.maxExtraTimeShare)
  const accepted: Route[] = []
  const penalized: CostGrid = { ...grid, speed: grid.speed.slice() }
  const slowed = new Uint8Array(grid.speed.length)
  for (const end of [from, to]) {
    visitCorridor(grid, [end], separationMeters, index => (slowed[index] = 1))
  }
  const slowCorridorOf = (route: Route) =>
    visitCorridor(grid, route.points, separationMeters, index => {
      if (slowed[index]) return
      slowed[index] = 1
      penalized.speed[index]! /= CORRIDOR_SLOWDOWN
    })
  slowCorridorOf(fastest)

  for (
    let attempt = 0;
    attempt < CORRIDORS_TRIED_PER_ALTERNATIVE * ROUTE_CHOICE.maxAlternatives &&
    accepted.length < ROUTE_CHOICE.maxAlternatives;
    attempt++
  ) {
    const candidate = findRoute(penalized, from, to, routeOptions)
    if (!candidate) break
    slowCorridorOf(candidate)
    const relaxed = relax(
      grid,
      candidate,
      separationMeters * RELAXED_CORRIDOR_SHARE_OF_SEPARATION,
      routeOptions,
    )
    if (!relaxed || relaxed.timeSeconds > maxSeconds) continue
    const isSeparate = [fastest, ...accepted].every(
      route => maxDistanceFrom(relaxed.points, route.points) >= separationMeters,
    )
    if (isSeparate) accepted.push(relaxed)
  }
  return accepted
}

// The detour forced by the slowed corridors hugs their edges. Let loose a little at a time, a real
// route choice settles where it is held by whatever separates it from the others, while a line that
// is merely parallel drifts back towards a route already found.
function relax(
  grid: CostGrid,
  route: Route,
  radiusMeters: number,
  routeOptions: RouteOptions,
): Route | null {
  let relaxed = fastestWithinCorridor(grid, route, radiusMeters, routeOptions)
  for (let step = 1; relaxed && step < RELAXATION_STEPS; step++) {
    const next = fastestWithinCorridor(grid, relaxed, radiusMeters, routeOptions)
    if (!next || next.timeSeconds >= relaxed.timeSeconds * (1 - RELAXATION_SETTLED_SHARE)) break
    relaxed = next
  }
  return relaxed
}

function fastestWithinCorridor(
  grid: CostGrid,
  route: Route,
  radiusMeters: number,
  routeOptions: RouteOptions,
): Route | null {
  const corridor = croppedAround(grid, route.points, radiusMeters)
  const columnOffset = Math.round((corridor.minX - grid.minX) / grid.cellSizeMeters)
  const rowOffset = Math.round((corridor.minY - grid.minY) / grid.cellSizeMeters)
  visitCorridor(corridor, route.points, radiusMeters, index => {
    const column = (index % corridor.columns) + columnOffset
    const row = Math.floor(index / corridor.columns) + rowOffset
    corridor.speed[index] = grid.speed[row * grid.columns + column]!
  })
  return findRoute(corridor, route.points[0]!, route.points.at(-1)!, routeOptions)
}

function croppedAround(
  grid: CostGrid,
  points: readonly LocalPoint[],
  marginMeters: number,
): CostGrid {
  const cellOf = (value: number, origin: number, count: number) =>
    Math.min(count - 1, Math.max(0, Math.floor((value - origin) / grid.cellSizeMeters)))
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const minColumn = cellOf(Math.min(...xs) - marginMeters, grid.minX, grid.columns)
  const maxColumn = cellOf(Math.max(...xs) + marginMeters, grid.minX, grid.columns)
  const minRow = cellOf(Math.min(...ys) - marginMeters, grid.minY, grid.rows)
  const maxRow = cellOf(Math.max(...ys) + marginMeters, grid.minY, grid.rows)
  const columns = maxColumn - minColumn + 1
  const rows = maxRow - minRow + 1
  return {
    minX: grid.minX + minColumn * grid.cellSizeMeters,
    minY: grid.minY + minRow * grid.cellSizeMeters,
    cellSizeMeters: grid.cellSizeMeters,
    columns,
    rows,
    speed: new Float32Array(columns * rows),
    maxSpeed: grid.maxSpeed,
  }
}

function visitCorridor(
  grid: CostGrid,
  route: readonly LocalPoint[],
  radiusMeters: number,
  visit: (index: number) => void,
) {
  const radiusCells = Math.ceil(radiusMeters / grid.cellSizeMeters)
  for (const point of route) {
    const center = cellIndexOf(grid, point)
    if (center === null) continue
    const column = center % grid.columns
    const row = Math.floor(center / grid.columns)
    for (let dr = -radiusCells; dr <= radiusCells; dr++) {
      for (let dc = -radiusCells; dc <= radiusCells; dc++) {
        if (dr * dr + dc * dc > radiusCells * radiusCells) continue
        const r = row + dr
        const c = column + dc
        if (r < 0 || c < 0 || r >= grid.rows || c >= grid.columns) continue
        visit(r * grid.columns + c)
      }
    }
  }
}

function maxDistanceFrom(points: readonly LocalPoint[], other: readonly LocalPoint[]): number {
  let max = 0
  for (const p of points) {
    let nearest = Number.POSITIVE_INFINITY
    for (let i = 1; i < other.length; i++) {
      nearest = Math.min(nearest, distanceToSegment(p, other[i - 1]!, other[i]!))
    }
    max = Math.max(max, nearest)
  }
  return max
}

function bearingDegrees(from: LocalPoint, to: LocalPoint): number {
  const degrees = (Math.atan2(to[0] - from[0], to[1] - from[1]) * 180) / Math.PI
  return (degrees + 360) % 360
}
