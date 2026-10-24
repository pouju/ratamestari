import { describe, expect, it } from 'vitest'
import { localExtent, localPoint, type MapFeature } from '@ratamestari/core'
import { courseTargetFor, type CourseRequest } from '@ratamestari/rules'
import { findControlSites } from '../src/control-sites'
import { checkSetCourse } from '../src/course-check'
import type { CourseSpec } from '../src/course-search'
import { buildTerrain } from '../src/terrain'
import { feature, point } from './fixtures'

const extent = localExtent(0, 0, 1200, 1200)
const boulders: MapFeature[] = []
for (let x = 30; x < 1200; x += 60) {
  for (let y = 30; y < 1200; y += 60) boulders.push(feature('204', point(x, y)))
}
const terrain = buildTerrain(boulders, extent)
const sites = findControlSites(boulders, terrain)

const spec: CourseSpec = {
  target: courseTargetFor({
    eventLevel: 'national',
    format: 'middle',
    sex: 'H',
    ageClass: 21,
    skillLetter: 'A',
  } satisfies CourseRequest)!,
  format: 'middle',
  printScale: 10000,
  competitionCentre: localPoint(600, 600),
  seed: 1,
}

describe('checkSetCourse', () => {
  const onBoulder = localPoint(394, 516)
  const betweenBoulders = localPoint(780, 780)
  const course = checkSetCourse(terrain, sites, spec, {
    start: localPoint(510, 210),
    controls: [onBoulder, localPoint(272, 868), betweenBoulders, localPoint(812, 452)],
    finish: localPoint(600, 600),
  })

  it("keeps the setter's positions and describes controls from the feature under them", () => {
    expect(course.controls[0]!.position).toEqual(onBoulder)
    expect(course.controls[0]!.isomCode).toBe('204')
    expect(course.controls[2]!.position).toEqual(betweenBoulders)
  })

  it('flags a control with no map feature near it', () => {
    expect(course.problems.controlsWithoutFeature).toBe(1)
    expect(course.findings).toContainEqual({ kind: 'controlsWithoutFeature', stops: [3] })
  })

  it('measures the course and checks it by the same rules as a generated one', () => {
    expect(course.lengthMeters).toBeGreaterThan(1500)
    expect(course.legSeconds).toHaveLength(5)
    expect(course.breakdown.total).toBeGreaterThan(0)
  })
})
