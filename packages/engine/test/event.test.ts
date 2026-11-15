import { describe, expect, it } from 'vitest'
import { localPoint } from '@ratamestari/core'
import { FEATURELESS_SITE_ID, type ControlSiteCandidate } from '../src/control-sites'
import type { Course } from '../src/course-search'
import {
  addCourse,
  controlCodesOf,
  emptyEvent,
  lowestFreeControlCode,
  removeCourse,
  renameCourse,
  setCourseOf,
  type EventPlan,
} from '../src/event'

const site = (id: number, x = id * 100, y = 0): ControlSiteCandidate => ({
  id,
  position: localPoint(x, y),
  isomCode: '204',
  symbolNumber: 204000,
  placement: 'point',
  contourForm: null,
  distanceToLeadingFeatureMeters: 100,
  leadingFeatureDistance: 'far',
  inSlowTerrain: false,
  technicalDifficulty: 4,
  orientation: null,
  similarFeatureOffsets: [],
  flagSide: 'side',
})

// Only the controls matter to the event; the rest of a course is the engine's per-course result.
const courseThrough = (...controls: ControlSiteCandidate[]) => ({ controls }) as unknown as Course

function eventWith(...courses: ControlSiteCandidate[][]): { event: EventPlan; ids: string[] } {
  let event = emptyEvent()
  const ids: string[] = []
  courses.forEach((controls, i) => {
    const added = addCourse(event, `Course ${i + 1}`)
    event = setCourseOf(added.event, added.courseId, courseThrough(...controls))
    ids.push(added.courseId)
  })
  return { event, ids }
}

describe('lowestFreeControlCode', () => {
  it('skips used and excluded codes', () => {
    expect(lowestFreeControlCode(new Set())).toBe(31)
    expect(lowestFreeControlCode(new Set([31, 32]))).toBe(33)
    const upTo65 = new Set(Array.from({ length: 35 }, (_, i) => 31 + i))
    expect(lowestFreeControlCode(upTo65)).toBe(67)
  })
})

describe('setCourseOf', () => {
  it('gives new controls the lowest free codes in course order', () => {
    const { event, ids } = eventWith([site(1), site(2), site(3)])
    expect(controlCodesOf(event, ids[0]!)).toEqual([31, 32, 33])
  })

  it('shares a site with another course as one control with one code', () => {
    const { event, ids } = eventWith([site(1), site(2), site(3)], [site(4), site(2), site(5)])
    expect(controlCodesOf(event, ids[1]!)).toEqual([34, 32, 35])
    expect(event.controls).toHaveLength(5)
  })

  it('tells hand-placed controls apart by position', () => {
    const here = { ...site(FEATURELESS_SITE_ID, 100, 100) }
    const there = { ...site(FEATURELESS_SITE_ID, 300, 100) }
    const { event, ids } = eventWith([here, there], [{ ...there }])
    expect(controlCodesOf(event, ids[1]!)).toEqual([32])
  })

  it('uses one control for a site visited twice', () => {
    const { event, ids } = eventWith([site(1), site(2), site(1)])
    expect(controlCodesOf(event, ids[0]!)).toEqual([31, 32, 31])
    expect(event.controls).toHaveLength(2)
  })

  it('keeps the code of a control moved within its only course', () => {
    const { event, ids } = eventWith([site(1), site(2), site(3)])
    const moved = setCourseOf(event, ids[0]!, courseThrough(site(1), site(7), site(3)))
    expect(controlCodesOf(moved, ids[0]!)).toEqual([31, 32, 33])
    expect(moved.controls.find(control => control.code === 32)?.site.id).toBe(7)
  })

  it('gives a new control when a shared one is moved in one course', () => {
    const { event, ids } = eventWith([site(1), site(2)], [site(2), site(3)])
    const moved = setCourseOf(event, ids[0]!, courseThrough(site(1), site(7)))
    expect(controlCodesOf(moved, ids[0]!)).toEqual([31, 34])
    expect(controlCodesOf(moved, ids[1]!)).toEqual([32, 33])
  })

  it('drops controls no course uses any more and frees their codes', () => {
    const { event, ids } = eventWith([site(1), site(2), site(3)])
    const shorter = setCourseOf(event, ids[0]!, courseThrough(site(1), site(3)))
    expect(shorter.controls.map(control => control.code)).toEqual([31, 33])
    const longer = setCourseOf(shorter, ids[0]!, courseThrough(site(1), site(3), site(8)))
    expect(controlCodesOf(longer, ids[0]!)).toEqual([31, 33, 32])
  })

  it('keeps the other courses unchanged', () => {
    const { event, ids } = eventWith([site(1), site(2)], [site(3), site(4)])
    const changed = setCourseOf(event, ids[0]!, courseThrough(site(5)))
    expect(controlCodesOf(changed, ids[1]!)).toEqual([33, 34])
  })

  it('clears a course', () => {
    const { event, ids } = eventWith([site(1), site(2)])
    const cleared = setCourseOf(event, ids[0]!, null)
    expect(cleared.courses[0]?.controlIds).toEqual([])
    expect(cleared.controls).toEqual([])
  })
})

describe('courses', () => {
  it('are named and removed, taking their unshared controls with them', () => {
    const { event, ids } = eventWith([site(1), site(2)], [site(2), site(3)])
    const renamed = renameCourse(event, ids[1]!, 'A')
    expect(renamed.courses.map(entry => entry.name)).toEqual(['Course 1', 'A'])
    const removed = removeCourse(renamed, ids[0]!)
    expect(removed.controls.map(control => control.code)).toEqual([32, 33])
  })

  it('get ids that are never reused', () => {
    const first = addCourse(emptyEvent(), 'A')
    const second = addCourse(removeCourse(first.event, first.courseId), 'B')
    expect(second.courseId).not.toBe(first.courseId)
  })
})
