import { CONTROL_CODES, isAllowedControlCode } from '@ratamestari/rules'
import type { ControlSiteCandidate } from './control-sites'
import type { Course } from './course-search'
import { isSameSite } from './locks'

// Several courses on one map share one list of controls, each with a fixed code (D27).
export interface EventControl {
  readonly id: string
  readonly code: number
  readonly site: ControlSiteCandidate
}

export interface EventCourse {
  readonly id: string
  readonly name: string
  readonly course: Course | null
  // course.controls as event control ids, in course order.
  readonly controlIds: readonly string[]
}

export interface EventPlan {
  readonly controls: readonly EventControl[]
  readonly courses: readonly EventCourse[]
  readonly nextId: number
}

export const emptyEvent = (): EventPlan => ({ controls: [], courses: [], nextId: 1 })

export function addCourse(event: EventPlan, name: string): { event: EventPlan; courseId: string } {
  const courseId = `course-${event.nextId}`
  return {
    courseId,
    event: {
      ...event,
      courses: [...event.courses, { id: courseId, name, course: null, controlIds: [] }],
      nextId: event.nextId + 1,
    },
  }
}

export function renameCourse(event: EventPlan, courseId: string, name: string): EventPlan {
  return {
    ...event,
    courses: event.courses.map(entry => (entry.id === courseId ? { ...entry, name } : entry)),
  }
}

export function removeCourse(event: EventPlan, courseId: string): EventPlan {
  return withoutUnusedControls({
    ...event,
    courses: event.courses.filter(entry => entry.id !== courseId),
  })
}

export function lowestFreeControlCode(used: ReadonlySet<number>): number | null {
  for (let code = CONTROL_CODES.min; code <= CONTROL_CODES.max; code++) {
    if (isAllowedControlCode(code) && !used.has(code)) return code
  }
  return null
}

// Sites already in the event keep their control and code. A control moved within this course alone
// keeps its id and code at its new site. Other new sites get the lowest free codes.
export function setCourseOf(event: EventPlan, courseId: string, course: Course | null): EventPlan {
  const entry = event.courses.find(other => other.id === courseId)
  if (!entry) throw new Error(`No course ${courseId} in the event`)
  const sites = course?.controls ?? []
  const usedByOtherCourses = new Set(
    event.courses.filter(other => other.id !== courseId).flatMap(other => other.controlIds),
  )

  const ids: (string | null)[] = sites.map(
    site => event.controls.find(control => isSameSite(control.site, site))?.id ?? null,
  )
  const claimed = new Set(ids.filter(id => id !== null))
  const movedSites = new Map<string, ControlSiteCandidate>()
  sites.forEach((site, k) => {
    const previous = entry.controlIds[k]
    if (ids[k] !== null || previous === undefined) return
    if (claimed.has(previous) || usedByOtherCourses.has(previous)) return
    ids[k] = previous
    claimed.add(previous)
    movedSites.set(previous, site)
  })

  const keptControls = event.controls
    .filter(control => claimed.has(control.id) || usedByOtherCourses.has(control.id))
    .map(control => {
      const site = movedSites.get(control.id)
      return site ? { ...control, site } : control
    })
  const usedCodes = new Set(keptControls.map(control => control.code))
  const newControls: EventControl[] = []
  let nextId = event.nextId
  sites.forEach((site, k) => {
    if (ids[k] !== null) return
    const sameNewSite = newControls.find(control => isSameSite(control.site, site))
    if (sameNewSite) {
      ids[k] = sameNewSite.id
      return
    }
    const code = lowestFreeControlCode(usedCodes)
    if (code === null) throw new Error('No control codes left for the event')
    usedCodes.add(code)
    const control = { id: `control-${nextId++}`, code, site }
    newControls.push(control)
    ids[k] = control.id
  })

  return {
    controls: [...keptControls, ...newControls],
    courses: event.courses.map(other =>
      other.id === courseId
        ? { ...other, course, controlIds: ids.filter(id => id !== null) }
        : other,
    ),
    nextId,
  }
}

export function controlCodesOf(event: EventPlan, courseId: string): number[] {
  const entry = event.courses.find(other => other.id === courseId)
  if (!entry) throw new Error(`No course ${courseId} in the event`)
  const codeOf = new Map(event.controls.map(control => [control.id, control.code]))
  return entry.controlIds.map(id => codeOf.get(id)!)
}

function withoutUnusedControls(event: EventPlan): EventPlan {
  const used = new Set(event.courses.flatMap(entry => entry.controlIds))
  return { ...event, controls: event.controls.filter(control => used.has(control.id)) }
}
