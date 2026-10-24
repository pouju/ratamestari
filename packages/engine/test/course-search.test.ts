import { describe, expect, it } from 'vitest'
import { localExtent, localPoint, type MapFeature } from '@ratamestari/core'
import { courseTargetFor, FOREST_CONTROL_SPACING, type CourseRequest } from '@ratamestari/rules'
import { findControlSites } from '../src/control-sites'
import { searchCourse, type Course, type CourseSpec } from '../src/course-search'
import { buildTerrain } from '../src/terrain'
import { feature, line, point } from './fixtures'

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

const spec = (overrides: Partial<CourseSpec> = {}): CourseSpec => ({
  target: middleDistanceH21,
  format: 'middle',
  printScale: 10000,
  competitionCentre: localPoint(1000, 1000),
  seed: 1,
  improvementSteps: 400,
  ...overrides,
})

const allPoints = (course: Course) => [course.start, ...course.controls].map(s => s.position)

const SEARCH_TIMEOUT_MS = 30_000

describe('searchCourse', { timeout: SEARCH_TIMEOUT_MS }, () => {
  const course = searchCourse(terrain, sites, spec())!

  it('sets a course close to the target winning time', () => {
    expect(course.controls.length).toBeGreaterThan(3)
    expect(
      Math.abs(course.estimatedSeconds - course.targetSeconds) / course.targetSeconds,
    ).toBeLessThan(0.1)
    expect(course.legSeconds).toHaveLength(course.controls.length + 1)
  })

  it('keeps controls at least the minimum distance apart', () => {
    const points = allPoints(course)
    for (let a = 0; a < points.length; a++) {
      for (let b = a + 1; b < points.length; b++) {
        const distance = Math.hypot(points[a]![0] - points[b]![0], points[a]![1] - points[b]![1])
        expect(distance).toBeGreaterThanOrEqual(FOREST_CONTROL_SPACING.minStraightMeters)
      }
    }
    expect(course.problems.spacing).toBe(0)
  })

  it('avoids acute angles', () => {
    expect(course.problems.acuteAngleWarnings).toBe(0)
  })

  it('keeps control circles on the course from overlapping', () => {
    const points = allPoints(course)
    for (let a = 0; a < points.length; a++) {
      for (let b = a + 1; b < points.length; b++) {
        const distance = Math.hypot(points[a]![0] - points[b]![0], points[a]![1] - points[b]![1])
        expect(distance).toBeGreaterThanOrEqual(75)
      }
    }
    expect(course.problems.overlappingCircles).toBe(0)
  })

  it('checks the angle at the last control too', () => {
    const [beforeLast, last] = allPoints(course).slice(-2)
    const toBefore = [beforeLast![0] - last![0], beforeLast![1] - last![1]]
    const toFinish = [course.finish[0] - last![0], course.finish[1] - last![1]]
    const cosine =
      (toBefore[0]! * toFinish[0]! + toBefore[1]! * toFinish[1]!) /
      (Math.hypot(toBefore[0]!, toBefore[1]!) * Math.hypot(toFinish[0]!, toFinish[1]!))
    expect((Math.acos(cosine) * 180) / Math.PI).toBeGreaterThanOrEqual(45)
  })

  it('rarely crosses its own course lines and never runs them through other controls', () => {
    expect(course.problems.courseLineCrossings).toBeLessThanOrEqual(1)
    expect(course.problems.courseLinesThroughControls).toBe(0)
  })

  it('ends with a short leg into the finish', () => {
    const finalLeg = course.legSeconds[course.legSeconds.length - 1]!
    expect(finalLeg / course.targetSeconds).toBeLessThanOrEqual(0.04)
    expect(course.problems.finalLegTooLong).toBe(false)
  })

  it('finishes at the competition centre', () => {
    expect(course.finish).toEqual([1000, 1000])
  })

  it('repeats the same course for the same seed', () => {
    const again = searchCourse(terrain, sites, spec())!
    expect(allPoints(again)).toEqual(allPoints(course))
  })

  it('sets a different course for a different seed', () => {
    const other = searchCourse(terrain, sites, spec({ seed: 2 }))!
    expect(allPoints(other)).not.toEqual(allPoints(course))
  })

  it('reports progress as the course improves', () => {
    const progress: Course[] = []
    searchCourse(terrain, sites, spec(), c => progress.push(c))
    expect(progress.length).toBeGreaterThan(0)
    const scores = progress.map(c => c.score)
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
  })

  it('returns null when the centre cannot be reached', () => {
    const lake = buildTerrain(
      [
        feature('301', {
          type: 'Polygon',
          coordinates: [
            [
              localPoint(0, 0),
              localPoint(2000, 0),
              localPoint(2000, 2000),
              localPoint(0, 2000),
              localPoint(0, 0),
            ],
          ],
        }),
      ],
      extent,
    )
    expect(searchCourse(lake, sites, spec())).toBeNull()
  })

  it('keeps course lines inside the mapped area', () => {
    const uShapedMap: MapFeature[] = []
    for (let y = 50; y < 2000; y += 100) {
      uShapedMap.push(feature('101', line([50, y], [700, y])))
      uShapedMap.push(feature('101', line([1300, y], [1950, y])))
    }
    for (let y = 50; y < 700; y += 100) uShapedMap.push(feature('101', line([700, y], [1300, y])))
    const features = [...uShapedMap, ...boulders]
    const uTerrain = buildTerrain(features, extent)
    const uSites = findControlSites(features, uTerrain)
    const uCourse = searchCourse(
      uTerrain,
      uSites,
      spec({ competitionCentre: localPoint(1000, 300) }),
    )!
    expect(uCourse.problems.courseLinesOutsideMap).toBe(0)
    const stops = [...allPoints(uCourse), uCourse.finish]
    for (let i = 1; i < stops.length; i++) {
      for (let t = 0; t <= 1; t += 0.02) {
        const x = stops[i - 1]![0] + (stops[i]![0] - stops[i - 1]![0]) * t
        const y = stops[i - 1]![1] + (stops[i]![1] - stops[i - 1]![1]) * t
        const inGap = x > 800 && x < 1200 && y > 900
        expect(inGap).toBe(false)
      }
    }
  })
})
