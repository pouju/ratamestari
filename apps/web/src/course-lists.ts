import { addCourse, type EventPlan } from '@ratamestari/engine'
import {
  courseRequestSchema,
  openCourseRequestSchema,
  type AnyCourseRequest,
} from '@ratamestari/rules'
import { z } from 'zod'

// The courses an event starts from (D27): names with their class or length and colour.
export interface ListedCourse {
  readonly name: string
  readonly request: AnyCourseRequest
}

const open = (
  name: string,
  skillColour: 'white' | 'yellow' | 'orange' | 'blue',
  format: 'long' | 'middle',
  min: number,
  max: number,
): ListedCourse => ({
  name,
  request: { kind: 'open', format, skillColour, lengthKm: { min, max } },
})

// Interpretation: a weekly event series' public instructions (D28, rules digest › Open courses).
// A club's defaults, changed and saved as the club's own list.
export const WEEKLY_COURSE_LIST: readonly ListedCourse[] = [
  open('A', 'blue', 'long', 5, 7),
  open('B', 'orange', 'middle', 4, 5),
  open('C', 'yellow', 'middle', 2.5, 3.5),
  open('D', 'white', 'middle', 1.5, 2.5),
]

export type ListStep =
  | { readonly kind: 'fill'; readonly courseId: string; readonly request: AnyCourseRequest }
  | { readonly kind: 'add'; readonly courseId: string; readonly request: AnyCourseRequest }

// Courses already set keep everything; a listed name with no course yet takes the list's request,
// and names the event lacks are added in the list's order.
export function applyCourseList(
  event: EventPlan,
  list: readonly ListedCourse[],
  isSet: (courseId: string) => boolean,
): { event: EventPlan; steps: ListStep[] } {
  let next = event
  const steps: ListStep[] = []
  for (const { name, request } of list) {
    const existing = next.courses.find(entry => entry.name === name)
    if (existing) {
      if (!isSet(existing.id)) steps.push({ kind: 'fill', courseId: existing.id, request })
      continue
    }
    const added = addCourse(next, name)
    next = added.event
    steps.push({ kind: 'add', courseId: added.courseId, request })
  }
  return { event: next, steps }
}

const listSchema = z.array(
  z.object({
    name: z.string().min(1),
    request: z.union([openCourseRequestSchema, courseRequestSchema]),
  }),
)

const OWN_LIST_KEY = 'ratamestari.courseList'

// The club's own list stays in this browser, like the language and the symbol corrections.
export function loadOwnCourseList(): ListedCourse[] | null {
  try {
    const stored = localStorage.getItem(OWN_LIST_KEY)
    if (!stored) return null
    const parsed = listSchema.safeParse(JSON.parse(stored))
    return parsed.success && parsed.data.length > 0 ? parsed.data : null
  } catch {
    // Blocked storage or an unreadable list: the event starts without it.
    return null
  }
}

export function saveOwnCourseList(list: readonly ListedCourse[]): boolean {
  try {
    localStorage.setItem(OWN_LIST_KEY, JSON.stringify(list))
    return true
  } catch {
    return false
  }
}
