import type { LocalPoint } from '@ratamestari/core'
import {
  addCourse,
  emptyEvent,
  type ControlSiteCandidate,
  type Course,
  type EventPlan,
  type Orientation,
  type PaperChoice,
} from '@ratamestari/engine'
import type { AnyCourseRequest, PrintScaleChoice } from '@ratamestari/rules'
import type { Kept } from './kept'

export interface PlacedFrame {
  readonly centre: LocalPoint
  readonly orientation: Orientation
}

// What the workspace keeps of a course while another course of the event is shown (D27).
export interface CourseSnapshot {
  readonly request: AnyCourseRequest
  readonly seed: number
  readonly course: Course | null
  readonly kept: Kept
  readonly undoHistory: readonly (Course | null)[]
  readonly paper: PaperChoice
  readonly printScale: PrintScaleChoice
  readonly placedFrame: PlacedFrame | null
  readonly startWish: readonly [number, number] | null
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export function nextCourseName(event: EventPlan): string {
  const taken = new Set(event.courses.map(entry => entry.name))
  for (const letter of LETTERS) if (!taken.has(letter)) return letter
  return String(event.courses.length + 1)
}

export function eventWithOneCourse(): { event: EventPlan; courseId: string } {
  const empty = emptyEvent()
  return addCourse(empty, nextCourseName(empty))
}

// Controls of the other courses that this course doesn't visit, to draw faintly under it.
export function otherCoursesControls(event: EventPlan, courseId: string): LocalPoint[] {
  const own = new Set(event.courses.find(entry => entry.id === courseId)?.controlIds ?? [])
  const others = new Set(
    event.courses.filter(entry => entry.id !== courseId).flatMap(entry => entry.controlIds),
  )
  return event.controls
    .filter(control => others.has(control.id) && !own.has(control.id))
    .map(control => control.site.position)
}

// What setting a course needs to know of the event's other set courses (D27): the start they
// begin from and the controls the course shares or keeps clear of.
export function otherCoursesOf(
  event: EventPlan,
  courseId: string,
): { start: ControlSiteCandidate; controls: ControlSiteCandidate[] } | null {
  const others = event.courses.filter(entry => entry.id !== courseId && entry.course !== null)
  const first = others[0]?.course
  if (!first) return null
  const ids = new Set(others.flatMap(entry => entry.controlIds))
  return {
    start: first.start,
    controls: event.controls.filter(control => ids.has(control.id)).map(control => control.site),
  }
}
