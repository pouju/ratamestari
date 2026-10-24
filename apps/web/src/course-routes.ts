import { useEffect, useMemo, useState } from 'react'
import type { LocalPoint } from '@ratamestari/core'
import type { Course, LegEvaluation } from '@ratamestari/engine'
import type { Engine } from './engine'
import { courseStops, type LegRoutesState } from './leg-routes'
import { SUPERSEDED, type RouteJobPriority, type RouteQueue } from './route-queue'

const KEY_DECIMALS = 1

export const legKey = (from: LocalPoint, to: LocalPoint, paceSecondsPerKm: number): string =>
  [...from, ...to].map(value => value.toFixed(KEY_DECIMALS)).join(',') + `@${paceSecondsPerKm}`

export function courseLegEnds(course: Course): (readonly [LocalPoint, LocalPoint])[] {
  const stops = courseStops(course)
  return stops.slice(1).map((to, i) => [stops[i]!, to] as const)
}

export interface LegRouteCache {
  get(from: LocalPoint, to: LocalPoint, pace: number): LegRoutesState | undefined
  // Finds a leg's routes unless they are known; resolves to null when superseded or stale.
  find(
    engine: Engine,
    queue: RouteQueue,
    priority: RouteJobPriority,
    slot: string,
    ends: readonly [LocalPoint, LocalPoint],
    pace: number,
  ): Promise<LegRoutesState | null>
  // The terrain changed (another map, or corrected symbols), so every route may be different.
  clear(): void
}

// Routes worked out once are kept by leg ends and pace, so the course layer, the route list and
// the selected leg share them, and an edit only sends the legs it changed.
export function createLegRouteCache(): LegRouteCache {
  const routes = new Map<string, LegRoutesState>()
  let generation = 0
  const get = (from: LocalPoint, to: LocalPoint, pace: number) => routes.get(legKey(from, to, pace))
  return {
    get,
    async find(engine, queue, priority, slot, [from, to], pace) {
      const known = get(from, to, pace)
      if (known) return known
      const askedIn = generation
      const leg = await queue.request(slot, priority, () => engine.evaluateLeg(from, to, pace))
      if (leg === SUPERSEDED || askedIn !== generation) return null
      const state = stateOf(leg)
      routes.set(legKey(from, to, pace), state)
      return state
    },
    clear() {
      routes.clear()
      generation++
    },
  }
}

const stateOf = (leg: LegEvaluation | null): LegRoutesState =>
  leg ? { status: 'evaluated', leg } : { status: 'unreachable' }

export interface RouteSummary {
  readonly legs: number
  readonly evaluated: number
  readonly withRouteChoice: number
}

export function routeSummary(legs: readonly LegRoutesState[]): RouteSummary {
  const evaluated = legs.filter(leg => leg.status !== 'finding')
  return {
    legs: legs.length,
    evaluated: evaluated.length,
    withRouteChoice: evaluated.filter(leg => leg.status === 'evaluated' && leg.leg.hasRouteChoice)
      .length,
  }
}

// Every leg's routes while `isActive`, found one leg at a time in course order.
export function useCourseRoutes(
  engine: Engine,
  queue: RouteQueue,
  cache: LegRouteCache,
  course: Course | null,
  pace: number,
  isActive: boolean,
): readonly LegRoutesState[] | null {
  const [found, setFound] = useState(0)

  useEffect(() => {
    if (!isActive || !course) return
    let isCurrent = true
    queue.cancel('course')
    for (const ends of courseLegEnds(course)) {
      if (cache.get(...ends, pace)) continue
      void cache.find(engine, queue, 'course', legKey(...ends, pace), ends, pace).then(state => {
        if (state && isCurrent) setFound(count => count + 1)
      })
    }
    return () => {
      isCurrent = false
    }
  }, [engine, queue, cache, course, pace, isActive])

  return useMemo(
    () =>
      isActive && course
        ? courseLegEnds(course).map(ends => cache.get(...ends, pace) ?? { status: 'finding' })
        : null,
    // `found` changes whenever another leg's routes arrive in the cache.
    [cache, course, pace, isActive, found],
  )
}
