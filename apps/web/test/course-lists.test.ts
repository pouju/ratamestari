import { describe, expect, it } from 'vitest'
import { addCourse, emptyEvent } from '@ratamestari/engine'
import { applyCourseList, WEEKLY_COURSE_LIST } from '../src/course-lists'
import { eventWithOneCourse } from '../src/event-workspace'

describe('applyCourseList', () => {
  it('fills the first empty course and adds the rest in order', () => {
    const { event, courseId } = eventWithOneCourse()
    const applied = applyCourseList(event, WEEKLY_COURSE_LIST, () => false)
    expect(applied.event.courses.map(entry => entry.name)).toEqual(['A', 'B', 'C', 'D'])
    expect(applied.steps.map(step => step.kind)).toEqual(['fill', 'add', 'add', 'add'])
    expect(applied.steps[0]).toMatchObject({ courseId, request: { skillColour: 'blue' } })
  })

  it('leaves a course that is already set as it is', () => {
    const { event, courseId } = eventWithOneCourse()
    const applied = applyCourseList(event, WEEKLY_COURSE_LIST, id => id === courseId)
    expect(applied.steps.some(step => step.courseId === courseId)).toBe(false)
    expect(applied.event.courses).toHaveLength(4)
  })

  it('keeps courses the list does not name', () => {
    const extra = addCourse(emptyEvent(), 'Sprint')
    const applied = applyCourseList(extra.event, WEEKLY_COURSE_LIST, () => false)
    expect(applied.event.courses.map(entry => entry.name)).toEqual(['Sprint', 'A', 'B', 'C', 'D'])
  })
})

describe('WEEKLY_COURSE_LIST', () => {
  it('runs from the longest and hardest A to the shortest and easiest D', () => {
    const lengths = WEEKLY_COURSE_LIST.map(({ request }) =>
      'kind' in request ? request.lengthKm.max : 0,
    )
    expect(lengths).toEqual([...lengths].sort((a, b) => b - a))
  })
})
