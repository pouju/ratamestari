import type { LocalPoint } from '@ratamestari/core'
import type { Course } from '@ratamestari/engine'
import type { CourseHit } from './course-overprint'
import { courseStops } from './leg-routes'

export type HandEdit =
  | { readonly kind: 'start'; readonly at: LocalPoint }
  | { readonly kind: 'add'; readonly at: LocalPoint }
  | { readonly kind: 'insert'; readonly afterStop: number; readonly at: LocalPoint }
  | { readonly kind: 'select'; readonly stop: number | null }

// The first tap places the start. Later taps add a control at the end, put one into a tapped leg
// or select a tapped stop; with a stop selected, a tap on open map only clears the selection, so
// that a tap meant to deselect never adds a control.
export function handEditFor(
  course: Course | null,
  selectedStop: number | null,
  hit: CourseHit | null,
  at: LocalPoint,
): HandEdit {
  if (!course) return { kind: 'start', at }
  if (hit?.kind === 'stop')
    return { kind: 'select', stop: hit.stop === selectedStop ? null : hit.stop }
  if (selectedStop !== null) return { kind: 'select', stop: null }
  if (hit?.kind === 'leg') return { kind: 'insert', afterStop: hit.leg, at }
  return { kind: 'add', at }
}

// The stops a control placed by this edit would join: the one before it, and the one after it
// when it goes into a leg. A new control at the end goes in before the finish.
export function neighboursOf(course: Course | null, edit: HandEdit): readonly LocalPoint[] | null {
  if (!course) return null
  const stops = courseStops(course)
  if (edit.kind === 'add') return [stops[course.controls.length]!]
  if (edit.kind === 'insert') return [stops[edit.afterStop]!, stops[edit.afterStop + 1]!]
  return null
}

export const isControlStop = (course: Course | null, stop: number | null): stop is number =>
  course !== null && stop !== null && stop >= 1 && stop <= course.controls.length

const UNDO_STEPS = 50

export const withUndoStep = (
  history: readonly (Course | null)[],
  before: Course | null,
): readonly (Course | null)[] => [...history.slice(1 - UNDO_STEPS), before]
