import { localPoint, type LocalPoint } from '@ratamestari/core'
import type { ControlSiteCandidate, Course, CourseLocks } from '@ratamestari/engine'

// What the user keeps when the course is set again (D15). Kept by site rather than by number,
// so that it survives edits that renumber the controls.
export interface Kept {
  readonly sites: ReadonlySet<string>
  // `${from}>${to}` site keys; the finish is FINISH_KEY.
  readonly legs: ReadonlySet<string>
}

export const NOTHING_KEPT: Kept = { sites: new Set(), legs: new Set() }

const FINISH_KEY = 'finish'

// Hand-placed sites without a feature share an id, so the position tells them apart.
const siteKey = (site: ControlSiteCandidate) => `${site.id}@${site.position[0]},${site.position[1]}`

const stopKeys = (course: Course): string[] => [
  siteKey(course.start),
  ...course.controls.map(siteKey),
  FINISH_KEY,
]

const legKey = (keys: readonly string[], leg: number) => `${keys[leg]}>${keys[leg + 1]}`

const isFinish = (course: Course, stop: number) => stop === course.controls.length + 1

export const isStopKept = (kept: Kept, course: Course, stop: number): boolean =>
  !isFinish(course, stop) && kept.sites.has(stopKeys(course)[stop]!)

export const isLegKept = (kept: Kept, course: Course, leg: number): boolean =>
  kept.legs.has(legKey(stopKeys(course), leg))

export function toggleStop(kept: Kept, course: Course, stop: number): Kept {
  if (isFinish(course, stop)) return kept
  const key = stopKeys(course)[stop]!
  if (!kept.sites.has(key)) return { ...kept, sites: new Set([...kept.sites, key]) }
  const touches = (leg: string) => leg.startsWith(`${key}>`) || leg.endsWith(`>${key}`)
  return {
    sites: new Set([...kept.sites].filter(site => site !== key)),
    legs: new Set([...kept.legs].filter(leg => !touches(leg))),
  }
}

// Keeping a leg keeps both its ends; letting it go keeps the ends.
export function toggleLeg(kept: Kept, course: Course, leg: number): Kept {
  const keys = stopKeys(course)
  const key = legKey(keys, leg)
  if (kept.legs.has(key))
    return { ...kept, legs: new Set([...kept.legs].filter(other => other !== key)) }
  const ends = [keys[leg]!, keys[leg + 1]!].filter(end => end !== FINISH_KEY)
  return { sites: new Set([...kept.sites, ...ends]), legs: new Set([...kept.legs, key]) }
}

export interface KeptCount {
  readonly controls: number
  readonly legs: number
}

export function keptCount(kept: Kept, course: Course): KeptCount {
  const keys = stopKeys(course)
  return {
    controls: keys.filter(key => kept.sites.has(key)).length,
    legs: keys.slice(1).filter((_, leg) => kept.legs.has(legKey(keys, leg))).length,
  }
}

// The engine's locks for the controls of `course` that are kept, or null when none is.
export function locksFor(kept: Kept, course: Course): CourseLocks | null {
  const keys = stopKeys(course)
  const controls = course.controls.filter((_, i) => kept.sites.has(keys[i + 1]!))
  const start = kept.sites.has(keys[0]!) ? course.start : null
  if (!start && controls.length === 0) return null
  const keptLegInto = (stop: number) => kept.legs.has(legKey(keys, stop - 1))
  const keptStops = course.controls.flatMap((_, i) => (kept.sites.has(keys[i + 1]!) ? [i + 1] : []))
  const last = course.controls.length
  return {
    start,
    controls,
    keptLegs: [...keptStops.map(keptLegInto), keptStops.at(-1) === last && keptLegInto(last + 1)],
  }
}

// A kept stop moved by hand stays kept, with the legs kept at it.
export function withMovedStop(kept: Kept, before: Course, after: Course, stop: number): Kept {
  const from = stopKeys(before)[stop]
  const to = stopKeys(after)[stop]
  if (!from || !to || from === to || !kept.sites.has(from)) return kept
  const renamed = (key: string) => (key === from ? to : key)
  return {
    sites: new Set([...kept.sites].map(renamed)),
    legs: new Set([...kept.legs].map(leg => leg.split('>').map(renamed).join('>'))),
  }
}

// Just outside a control circle (37.5 m radius on the ground, ISOM sym. 703).
const KEPT_MARK_OFFSET_METERS = 60

// Where the map shows a lock: beside each kept stop, on the side away from its number (below and
// to the left without one), and at the middle of each kept leg.
export function keptMarksOf(
  kept: Kept,
  course: Course,
  numberCentres: readonly (LocalPoint | undefined)[] = [],
): LocalPoint[] {
  const stops = [course.start.position, ...course.controls.map(c => c.position), course.finish]
  const awayFromNumber = (position: LocalPoint, stop: number): LocalPoint => {
    const number = numberCentres[stop - 1]
    const [dx, dy] = number ? [position[0] - number[0], position[1] - number[1]] : [-1, -1]
    const length = Math.hypot(dx, dy) || 1
    return localPoint(
      position[0] + (dx / length) * KEPT_MARK_OFFSET_METERS,
      position[1] + (dy / length) * KEPT_MARK_OFFSET_METERS,
    )
  }
  const atStops = stops.flatMap((position, stop) =>
    isStopKept(kept, course, stop) ? [awayFromNumber(position, stop)] : [],
  )
  const atLegs = stops.slice(1).flatMap((to, leg) => {
    const from = stops[leg]!
    return isLegKept(kept, course, leg)
      ? [localPoint((from[0] + to[0]) / 2, (from[1] + to[1]) / 2)]
      : []
  })
  return [...atStops, ...atLegs]
}

// Stop and leg numbers, as the assistant gives and reads them.
export function keptIndices(kept: Kept, course: Course) {
  const stops = course.controls.length + 2
  return {
    stops: Array.from({ length: stops }, (_, stop) => stop).filter(stop =>
      isStopKept(kept, course, stop),
    ),
    legs: Array.from({ length: stops - 1 }, (_, leg) => leg).filter(leg =>
      isLegKept(kept, course, leg),
    ),
  }
}

export function keepStopsAndLegs(
  kept: Kept,
  course: Course,
  stops: readonly number[],
  legs: readonly number[],
): Kept {
  const withStops = stops.reduce(
    (current, stop) =>
      isStopKept(current, course, stop) ? current : toggleStop(current, course, stop),
    kept,
  )
  return legs.reduce(
    (current, leg) => (isLegKept(current, course, leg) ? current : toggleLeg(current, course, leg)),
    withStops,
  )
}

export const forgetStops = (kept: Kept, course: Course, stops: readonly number[]): Kept =>
  stops.reduce(
    (current, stop) =>
      isStopKept(current, course, stop) ? toggleStop(current, course, stop) : current,
    kept,
  )
