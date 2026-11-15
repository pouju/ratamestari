import type { LocalPoint } from '@ratamestari/core'
import {
  addCourse,
  emptyEvent,
  type Course,
  type EventPlan,
  type Orientation,
  type PaperChoice,
} from '@ratamestari/engine'
import type { CourseRequest, PrintScaleChoice } from '@ratamestari/rules'
import type { Kept } from './kept'

export interface PlacedFrame {
  readonly centre: LocalPoint
  readonly orientation: Orientation
}

// What the workspace keeps of a course while another course of the event is shown (D27).
export interface CourseSnapshot {
  readonly request: CourseRequest
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
