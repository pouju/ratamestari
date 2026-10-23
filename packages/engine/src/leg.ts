import type { LocalPoint } from '@ratamestari/core'
import { ROUTE_CHOICE } from '@ratamestari/rules'
import { countContourCrossings } from './contours'
import type { CostGrid } from './cost-grid'
import { distanceToSegment } from './polyline'
import { cellIndexOf } from './raster'
import { findRoute, routeTimeSeconds, type Route, type RouteOptions } from './router'
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
  let penalized = grid
  let lastRoute = fastest

  for (let attempt = 0; attempt < ROUTE_CHOICE.maxAlternatives; attempt++) {
    penalized = withCorridorSlowdown(penalized, lastRoute.points, separationMeters)
    const candidate = findRoute(penalized, from, to, routeOptions)
    if (!candidate) break
    const timeSeconds = routeTimeSeconds(grid, candidate.points, routeOptions)
    if (timeSeconds > maxSeconds) break
    lastRoute = candidate
    const isSeparate = [fastest, ...accepted].every(
      route => maxDistanceFrom(candidate.points, route.points) >= separationMeters,
    )
    if (isSeparate) accepted.push({ ...candidate, timeSeconds })
  }
  return accepted
}

function withCorridorSlowdown(
  grid: CostGrid,
  route: readonly LocalPoint[],
  radiusMeters: number,
): CostGrid {
  const speed = grid.speed.slice()
  const radiusCells = Math.ceil(radiusMeters / grid.cellSizeMeters)
  const slowed = new Uint8Array(speed.length)
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
        const index = r * grid.columns + c
        if (slowed[index]) continue
        slowed[index] = 1
        speed[index]! /= CORRIDOR_SLOWDOWN
      }
    }
  }
  return { ...grid, speed }
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
