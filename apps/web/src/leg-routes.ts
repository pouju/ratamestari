import { localPoint, type LocalPoint } from '@ratamestari/core'
import type { Course, LegEvaluation, Route } from '@ratamestari/engine'
import type { StopName } from './i18n'

export interface PlannedLeg {
  readonly from: LocalPoint | null
  readonly to: LocalPoint | null
}

export const EMPTY_PLANNED_LEG: PlannedLeg = { from: null, to: null }

export const needsPlacing = (plan: PlannedLeg): boolean => plan.from === null || plan.to === null

export function placeNext(plan: PlannedLeg, point: LocalPoint): PlannedLeg {
  if (plan.from === null) return { ...plan, from: point }
  return plan.to === null ? { ...plan, to: point } : plan
}

export const plannedEnds = (plan: PlannedLeg): readonly [LocalPoint, LocalPoint] | null =>
  plan.from && plan.to ? [plan.from, plan.to] : null

export type LegRoutesState =
  | { readonly status: 'finding' }
  | { readonly status: 'evaluated'; readonly leg: LegEvaluation }
  | { readonly status: 'unreachable' }

export type RouteRank = 'fastest' | 'middle' | 'slowest'

export interface RankedRoute {
  readonly route: Route
  readonly rank: RouteRank
  readonly secondsSlower: number
}

export const ROUTE_COLOUR_TOKENS: Readonly<Record<RouteRank, string>> = {
  fastest: '--colour-route-fastest',
  middle: '--colour-route-middle',
  slowest: '--colour-route-slowest',
}

export interface PreviewLeg {
  readonly fastest: Route
  readonly alternatives: readonly Route[]
  readonly hasLookedForAlternatives: boolean
}

// Where a control would go if placed at the pointer, and the routes of the legs it would make.
export interface ControlPreview {
  readonly position: LocalPoint
  readonly legs: readonly PreviewLeg[]
}

// The legs a control at `position` would make with its neighbours: from the stop before it, and
// to the stop after it when it goes into a leg.
export function legEndsAround(
  position: LocalPoint,
  neighbours: readonly LocalPoint[],
): (readonly [LocalPoint, LocalPoint])[] {
  const [before, after] = neighbours
  return [
    ...(before ? [[before, position] as const] : []),
    ...(after ? [[position, after] as const] : []),
  ]
}

const samePoint = (a: LocalPoint, b: LocalPoint) => a[0] === b[0] && a[1] === b[1]

export const isSamePreview = (a: ControlPreview | null, b: ControlPreview): boolean =>
  a !== null &&
  samePoint(a.position, b.position) &&
  a.legs.length === b.legs.length &&
  a.legs.every((leg, i) => {
    const other = b.legs[i]!.fastest.points
    const points = leg.fastest.points
    return samePoint(points[0]!, other[0]!) && samePoint(points.at(-1)!, other.at(-1)!)
  })

export function rankedRoutes(leg: Pick<LegEvaluation, 'fastest' | 'alternatives'>): RankedRoute[] {
  const routes = [
    leg.fastest,
    ...[...leg.alternatives].sort((a, b) => a.timeSeconds - b.timeSeconds),
  ]
  const last = routes.length - 1
  return routes.map((route, i) => ({
    route,
    rank: i === 0 ? 'fastest' : i === last ? 'slowest' : 'middle',
    secondsSlower: route.timeSeconds - leg.fastest.timeSeconds,
  }))
}

export const courseStops = (course: Course): LocalPoint[] => [
  course.start.position,
  ...course.controls.map(control => control.position),
  course.finish,
]

export const legCount = (course: Course): number => course.controls.length + 1

export function legEnds(course: Course, leg: number): readonly [LocalPoint, LocalPoint] | null {
  const stops = courseStops(course)
  const from = stops[leg]
  const to = stops[leg + 1]
  return from && to ? [from, to] : null
}

export function stopName(course: Course, stop: number): StopName {
  if (stop === 0) return 'start'
  return stop === course.controls.length + 1 ? 'finish' : stop
}

export function pointAlong(points: readonly LocalPoint[], share: number): LocalPoint | null {
  const lengths = points
    .slice(1)
    .map((p, i) => Math.hypot(p[0] - points[i]![0], p[1] - points[i]![1]))
  let remaining = lengths.reduce((sum, length) => sum + length, 0) * share
  for (let i = 0; i < lengths.length; i++) {
    const length = lengths[i]!
    if (remaining <= length) {
      const t = length === 0 ? 0 : remaining / length
      const [ax, ay] = points[i]!
      const [bx, by] = points[i + 1]!
      return localPoint(ax + (bx - ax) * t, ay + (by - ay) * t)
    }
    remaining -= length
  }
  return points.at(-1) ?? null
}
