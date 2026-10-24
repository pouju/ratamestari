import { describe, expect, it } from 'vitest'
import { localExtent, localPoint, type MapFeature } from '@ratamestari/core'
import { courseTargetFor, type CourseRequest } from '@ratamestari/rules'
import { findControlSites } from '../src/control-sites'
import { fitCourseToFrame, setCourseOnPaper } from '../src/course-on-paper'
import type { Course, CourseSpec } from '../src/course-search'
import { isUsableInPrintArea, printFrameAround } from '../src/print-area'
import { buildTerrain } from '../src/terrain'
import { feature, point } from './fixtures'

const extent = localExtent(0, 0, 2000, 2000)
const boulders: MapFeature[] = []
for (let x = 30; x < 2000; x += 60) {
  for (let y = 30; y < 2000; y += 60) boulders.push(feature('204', point(x, y)))
}
const terrain = buildTerrain(boulders, extent)
const sites = findControlSites(boulders, terrain)

const middleDistanceH21 = courseTargetFor({
  eventLevel: 'national',
  format: 'middle',
  sex: 'H',
  ageClass: 21,
  skillLetter: 'A',
} satisfies CourseRequest)!

const FRAME_SCALE = 5000
const centre = localPoint(600, 600)
const frame = printFrameAround(localPoint(700, 800), 'A4', 'portrait', FRAME_SCALE)

const spec = (overrides: Partial<CourseSpec> = {}): CourseSpec => ({
  target: middleDistanceH21,
  format: 'middle',
  printScale: 10000,
  competitionCentre: centre,
  seed: 1,
  improvementSteps: 200,
  printFrame: frame,
  ...overrides,
})

const stopsOf = (course: Course) => [
  course.start.position,
  ...course.controls.map(site => site.position),
]

const SEARCH_TIMEOUT_MS = 30_000

describe(
  'setCourseOnPaper with a print frame chosen by the user',
  { timeout: SEARCH_TIMEOUT_MS },
  () => {
    const course = setCourseOnPaper(terrain, sites, spec(), 'auto')!

    it('sets the whole course inside the frame and leaves the frame where it was', () => {
      expect(course.printArea!.extent).toEqual(frame.extent)
      expect(course.printArea!.paper).toBe('A4')
      expect(course.printArea!.scale).toBe(FRAME_SCALE)
      expect(stopsOf(course).every(stop => isUsableInPrintArea(stop, course.printArea!))).toBe(true)
      expect(course.problems.stopsOutsidePrintArea).toBe(0)
    })

    it('sets no course when the competition centre is outside the frame', () => {
      expect(
        setCourseOnPaper(
          terrain,
          sites,
          spec({ competitionCentre: localPoint(1800, 1800) }),
          'auto',
        ),
      ).toBeNull()
    })

    it('keeps the course and reports the controls a moved frame leaves outside', () => {
      const moved = printFrameAround(localPoint(1200, 800), 'A4', 'portrait', FRAME_SCALE)
      const refitted = fitCourseToFrame(terrain, course, moved)
      expect(refitted.printArea!.extent).toEqual(moved.extent)
      expect(refitted.controls).toEqual(course.controls)
      expect(refitted.problems.stopsOutsidePrintArea).toBeGreaterThan(0)
      expect(refitted.findings.some(finding => finding.kind === 'stopsOutsidePrintArea')).toBe(true)
    })

    it('says the winning time is out of reach when the frame is too small for the class', () => {
      const small = printFrameAround(centre, 'A4', 'portrait', 3000)
      const cramped = setCourseOnPaper(terrain, sites, spec({ printFrame: small }), 'auto')
      expect(cramped?.problems.winningTimeOutsideRange).toBe(true)
      expect(cramped?.printArea?.extent).toEqual(small.extent)
    })
  },
)
