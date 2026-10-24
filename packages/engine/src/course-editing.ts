import type { LocalPoint } from '@ratamestari/core'
import { REFERENCE_PACE_SECONDS_PER_KM } from '@ratamestari/rules'
import type { ControlSiteCandidate } from './control-sites'
import {
  assembleCourse,
  evaluationFor,
  type Course,
  type CourseContext,
  type CourseSpec,
} from './course-search'
import { difficultyInCourse } from './flag-side'
import { isUsableInPrintArea } from './print-area'
import { cellIndexOf } from './raster'
import { findRoute } from './router'
import { siteAreaQuality } from './site-quality'
import type { Terrain } from './terrain'
import { secondsFrom } from './time-tree'

const SNAP_RADIUS_METERS = 60
const FIX_SEARCH_RADIUS_METERS = 400

const distanceBetween = (a: LocalPoint, b: LocalPoint) => Math.hypot(b[0] - a[0], b[1] - a[1])

function editingContext(
  terrain: Terrain,
  sites: readonly ControlSiteCandidate[],
  spec: CourseSpec,
  finish: LocalPoint,
  pool: readonly ControlSiteCandidate[],
): CourseContext {
  const { grid } = terrain
  const pace = spec.paceSecondsPerKm ?? REFERENCE_PACE_SECONDS_PER_KM.value
  const toFinishGrid = secondsFrom(grid, finish, pace, Number.POSITIVE_INFINITY)
  const toFinish = Float32Array.from(pool, site => {
    const cell = cellIndexOf(grid, site.position)
    return cell === null ? Number.POSITIVE_INFINITY : toFinishGrid[cell]!
  })
  const qualityBySiteId = siteAreaQuality(sites)
  const quality = Float32Array.from(pool, site => qualityBySiteId[site.id] ?? 0)
  const legCache = new Map<string, number>()
  const legSeconds = (from: number, to: number) => {
    const key = from < to ? `${from},${to}` : `${to},${from}`
    const cached = legCache.get(key)
    if (cached !== undefined) return cached
    const route = findRoute(grid, pool[from]!.position, pool[to]!.position, {
      paceSecondsPerKm: pace,
    })
    const seconds = route?.timeSeconds ?? Number.POSITIVE_INFINITY
    legCache.set(key, seconds)
    return seconds
  }
  const { evaluation } = evaluationFor(terrain, spec, pool, finish, toFinish, legSeconds, quality)
  return {
    terrain,
    spec,
    pool,
    finish,
    targetSeconds: spec.target.winningTime.targetMinutes * 60,
    evaluation,
  }
}

const controlOrder = (count: number) => Array.from({ length: count }, (_, i) => i + 1)

export function recheckCourse(
  terrain: Terrain,
  sites: readonly ControlSiteCandidate[],
  spec: CourseSpec,
  course: Course,
): Course {
  const pool = [course.start, ...course.controls]
  const context = editingContext(terrain, sites, spec, course.finish, pool)
  return assembleCourse(context, 0, controlOrder(course.controls.length), true)
}

export function nearestSite(
  sites: readonly ControlSiteCandidate[],
  position: LocalPoint,
  withinMeters = SNAP_RADIUS_METERS,
): ControlSiteCandidate | null {
  let best: ControlSiteCandidate | null = null
  let bestDistance = withinMeters
  for (const site of sites) {
    const distance = distanceBetween(site.position, position)
    if (distance <= bestDistance) {
      best = site
      bestDistance = distance
    }
  }
  return best
}

export function moveControl(
  terrain: Terrain,
  sites: readonly ControlSiteCandidate[],
  spec: CourseSpec,
  course: Course,
  stopIndex: number,
  to: LocalPoint,
): Course | null {
  const site = nearestSite(sites, to)
  if (!site) return null
  const moved =
    stopIndex === 0
      ? { ...course, start: site }
      : { ...course, controls: course.controls.map((c, i) => (i === stopIndex - 1 ? site : c)) }
  return recheckCourse(terrain, sites, spec, moved)
}

export type ReplacementPreference = 'best' | 'harder' | 'easier'

export function fixControl(
  terrain: Terrain,
  sites: readonly ControlSiteCandidate[],
  spec: CourseSpec,
  course: Course,
  controlNumber: number,
  preference: ReplacementPreference = 'best',
): Course {
  const current = course.controls[controlNumber - 1]
  if (!current) return course
  const maxDifficulty = spec.target.siteDifficulty[1]
  const currentDifficulty = difficultyInCourse(current, maxDifficulty)
  const suitsPreference = (site: ControlSiteCandidate) => {
    const difficulty = difficultyInCourse(site, maxDifficulty)
    if (preference === 'harder') return difficulty > currentDifficulty
    if (preference === 'easier') return difficulty < currentDifficulty
    return true
  }
  const inCourse = new Set([course.start.id, ...course.controls.map(site => site.id)])
  const candidates = sites.filter(
    site =>
      !inCourse.has(site.id) &&
      suitsPreference(site) &&
      (!spec.printArea || isUsableInPrintArea(site.position, spec.printArea)) &&
      distanceBetween(site.position, current.position) <= FIX_SEARCH_RADIUS_METERS,
  )
  const pool = [course.start, ...course.controls, ...candidates]
  const context = editingContext(terrain, sites, spec, course.finish, pool)
  const order = controlOrder(course.controls.length)
  let bestOrder = order
  // A harder or easier control is wanted even if the rules score it a little worse.
  let bestScore =
    preference === 'best' ? context.evaluation.score(0, order).score : Number.POSITIVE_INFINITY
  candidates.forEach((_, i) => {
    const replaced = order.map((poolIndex, k) =>
      k === controlNumber - 1 ? course.controls.length + 1 + i : poolIndex,
    )
    const { score } = context.evaluation.score(0, replaced)
    if (score < bestScore) {
      bestScore = score
      bestOrder = replaced
    }
  })
  return assembleCourse(context, 0, bestOrder, true)
}
