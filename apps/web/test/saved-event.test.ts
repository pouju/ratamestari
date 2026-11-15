import { describe, expect, it } from 'vitest'
import { addCourse } from '@ratamestari/engine'
import { eventWithOneCourse, type CourseSnapshot } from '../src/event-workspace'
import { isOpenableEvent, SAVED_EVENT_VERSION } from '../src/saved-event'

const snapshot = {} as CourseSnapshot
const first = eventWithOneCourse()
const second = addCourse(first.event, 'B')
const saved = {
  version: SAVED_EVENT_VERSION,
  event: second.event,
  selectedCourseId: second.courseId,
  courses: { [first.courseId]: snapshot, [second.courseId]: snapshot },
  settings: {},
  competitionCentre: null,
  paceText: '5:00',
}

describe('isOpenableEvent', () => {
  it('opens an event saved in this shape', () => {
    expect(isOpenableEvent(saved)).toBe(true)
  })

  it('leaves events saved in another shape', () => {
    expect(isOpenableEvent({ ...saved, version: SAVED_EVENT_VERSION + 1 })).toBe(false)
    expect(isOpenableEvent(null)).toBe(false)
    expect(isOpenableEvent('event')).toBe(false)
  })

  it('needs every course of the event and the shown one', () => {
    expect(isOpenableEvent({ ...saved, courses: { [first.courseId]: snapshot } })).toBe(false)
    expect(isOpenableEvent({ ...saved, selectedCourseId: 'course-99' })).toBe(false)
  })
})
