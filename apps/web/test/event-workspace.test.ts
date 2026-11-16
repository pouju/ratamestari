import { describe, expect, it } from 'vitest'
import { localPoint } from '@ratamestari/core'
import { addCourse, setCourseOf, type ControlSiteCandidate, type Course } from '@ratamestari/engine'
import {
  eventWithOneCourse,
  nextCourseName,
  otherCoursesControls,
  otherCoursesOf,
} from '../src/event-workspace'

const site = (id: number) =>
  ({ id, position: localPoint(id * 100, 0) }) as unknown as ControlSiteCandidate
const courseThrough = (...ids: number[]) =>
  ({ start: site(0), controls: ids.map(site) }) as unknown as Course

describe('nextCourseName', () => {
  it('names courses A, B, C… skipping names in use', () => {
    const first = eventWithOneCourse()
    expect(first.event.courses[0]?.name).toBe('A')
    expect(nextCourseName(first.event)).toBe('B')
    const withC = addCourse(first.event, 'C').event
    expect(nextCourseName(withC)).toBe('B')
  })
})

describe('otherCoursesControls', () => {
  it("lists the other courses' controls this course doesn't visit, once each", () => {
    const first = eventWithOneCourse()
    const second = addCourse(first.event, 'B')
    const third = addCourse(second.event, 'C')
    let event = setCourseOf(third.event, first.courseId, courseThrough(1, 2))
    event = setCourseOf(event, second.courseId, courseThrough(2, 3))
    event = setCourseOf(event, third.courseId, courseThrough(3, 4))
    expect(otherCoursesControls(event, first.courseId)).toEqual([
      localPoint(300, 0),
      localPoint(400, 0),
    ])
  })
})

describe('otherCoursesOf', () => {
  it("gives the other set courses' start, controls and legs, not the course's own", () => {
    const first = eventWithOneCourse()
    const second = addCourse(first.event, 'B')
    let event = setCourseOf(second.event, first.courseId, courseThrough(1, 2))
    expect(otherCoursesOf(event, first.courseId)).toBeNull()
    event = setCourseOf(event, second.courseId, courseThrough(2, 3))
    const others = otherCoursesOf(event, second.courseId)!
    expect(others.start.id).toBe(0)
    expect(others.controls.map(control => control.id)).toEqual([1, 2])
    expect(others.legs).toEqual([[localPoint(100, 0), localPoint(200, 0)]])
  })
})
