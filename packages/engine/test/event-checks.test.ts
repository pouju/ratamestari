import { describe, expect, it } from 'vitest'
import { localPoint } from '@ratamestari/core'
import type { ControlSiteCandidate } from '../src/control-sites'
import type { Course } from '../src/course-search'
import { addCourse, emptyEvent, setCourseOf, type EventPlan } from '../src/event'
import { eventFindings } from '../src/event-checks'

const FOREST_SCALE = 10000

const site = (id: number, x: number, y = 0, isomCode = '204'): ControlSiteCandidate => ({
  id,
  position: localPoint(x, y),
  isomCode,
  symbolNumber: Number(isomCode) * 1000,
  placement: 'point',
  contourForm: null,
  distanceToLeadingFeatureMeters: 100,
  leadingFeatureDistance: 'far',
  inSlowTerrain: false,
  technicalDifficulty: 3,
  orientation: null,
  similarFeatureOffsets: [],
  flagSide: 'side',
})

const courseThrough = (...controls: ControlSiteCandidate[]) => ({ controls }) as unknown as Course

function eventOf(...courses: ControlSiteCandidate[][]): EventPlan {
  let event = emptyEvent()
  courses.forEach((controls, i) => {
    const added = addCourse(event, String.fromCharCode(65 + i))
    event = setCourseOf(added.event, added.courseId, courseThrough(...controls))
  })
  return event
}

const kinds = (event: EventPlan) => eventFindings(event, FOREST_SCALE).map(finding => finding.kind)

describe('eventFindings', () => {
  it('finds controls of different courses closer than the minimum distance', () => {
    const event = eventOf([site(1, 0), site(2, 500)], [site(3, 20), site(4, 900)])
    expect(kinds(event)).toContain('controlsTooClose')
  })

  it('leaves the spacing within one course to that course', () => {
    expect(kinds(eventOf([site(1, 0), site(2, 20)]))).not.toContain('controlsTooClose')
  })

  it('asks for 60 m between similar features of different courses, not between different ones', () => {
    const similar = eventOf([site(1, 0), site(2, 500)], [site(3, 45), site(4, 900)])
    expect(kinds(similar)).toContain('similarControlsClose')
    const different = eventOf([site(1, 0), site(2, 500)], [site(3, 45, 0, '109'), site(4, 900)])
    expect(kinds(different)).not.toContain('similarControlsClose')
  })

  it('finds similar codes on neighbouring controls only', () => {
    // New controls avoid similar codes, but codes can come from elsewhere, such as a course file.
    const withCodes = (event: EventPlan, codes: number[]): EventPlan => ({
      ...event,
      controls: event.controls.map((control, i) => ({ ...control, code: codes[i]! })),
    })
    const near = withCodes(eventOf([site(1, 0), site(2, 150)]), [55, 56])
    expect(kinds(near)).toContain('similarCodesNear')
    const far = withCodes(eventOf([site(1, 0), site(2, 600)]), [81, 181])
    expect(kinds(far)).not.toContain('similarCodesNear')
  })

  it('finds a leg several courses run, and a leg run both ways', () => {
    const shared = eventOf([site(1, 0), site(2, 500)], [site(1, 0), site(2, 500), site(3, 900)])
    expect(kinds(shared)).toEqual(['legSharedByCourses'])
    const opposite = eventOf([site(1, 0), site(2, 500)], [site(2, 500), site(1, 0)])
    expect(kinds(opposite)).toContain('legRunBothWays')
  })

  it('finds nothing for courses kept apart', () => {
    expect(
      kinds(eventOf([site(1, 0), site(2, 500)], [site(3, 0, 800), site(4, 600, 800)])),
    ).toEqual([])
  })
})
