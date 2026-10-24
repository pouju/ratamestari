import { describe, expect, it } from 'vitest'
import { localExtent, localPoint, type MapFeature } from '@ratamestari/core'
import { courseTargetFor, type CourseRequest } from '@ratamestari/rules'
import { findControlSites } from '../src/control-sites'
import {
  compassDirection,
  fixControl,
  insertControl,
  moveControl,
  moveStart,
  recheckCourse,
  removeControl,
  suggestChanges,
} from '../src/course-editing'
import { searchCourse, type CourseSpec } from '../src/course-search'
import { buildTerrain } from '../src/terrain'
import { feature, line, point } from './fixtures'

const extent = localExtent(0, 0, 2000, 2000)
const boulders: MapFeature[] = []
for (let x = 30; x < 2000; x += 60) {
  for (let y = 30; y < 2000; y += 60) boulders.push(feature('204', point(x, y)))
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
  competitionCentre: localPoint(1000, 1000),
  seed: 1,
  improvementSteps: 150,
}

const EDITING_TIMEOUT_MS = 60_000

describe('course editing', { timeout: EDITING_TIMEOUT_MS }, () => {
  const course = searchCourse(terrain, sites, spec)!

  it('lists a finding for every counted problem, with the stops involved', () => {
    const counted = Object.entries(course.problems).reduce(
      (sum, [, value]) => sum + (typeof value === 'number' ? value : value ? 1 : 0),
      0,
    )
    expect(course.findings).toHaveLength(counted)
    expect(course.findings.every(finding => finding.stops.length > 0)).toBe(true)
  })

  it('re-checks an unchanged course to the same rule results', () => {
    const rechecked = recheckCourse(terrain, sites, spec, course)
    expect(rechecked.problems).toEqual(course.problems)
    expect(rechecked.controls.map(site => site.id)).toEqual(course.controls.map(site => site.id))
    expect(rechecked.lengthMeters).toBeCloseTo(course.lengthMeters!, -1)
  })

  it('snaps a moved control to the nearest control site and re-checks the rules', () => {
    const first = course.controls[0]!
    const target = localPoint(first.position[0] + 50, first.position[1] + 10)
    const moved = moveControl(terrain, sites, spec, course, 1, target)!
    const [x, y] = moved.controls[0]!.position
    expect(Math.hypot(x - target[0], y - target[1])).toBeLessThanOrEqual(45)
    expect(moved.controls.slice(1)).toEqual(course.controls.slice(1))
  })

  it('refuses a move where there is no control site', () => {
    const empty = buildTerrain([], extent)
    expect(moveControl(empty, [], spec, course, 1, localPoint(500, 500))).toBeNull()
  })

  it('fixes a control that breaks the spacing rule', () => {
    // Control 3 is put on the same site as control 2.
    const second = course.controls[1]!
    const crowded = recheckCourse(terrain, sites, spec, {
      ...course,
      controls: course.controls.map((site, i) => (i === 2 ? second : site)),
    })
    expect(crowded.problems.spacing).toBeGreaterThan(0)
    const fixed = fixControl(terrain, sites, spec, crowded, 3)
    expect(fixed.problems.spacing).toBe(0)
    expect(fixed.score).toBeLessThan(crowded.score)
  })

  it('replaces a control with a harder one when asked', () => {
    const withPath = [...boulders, feature('505', line([0, 1000], [2000, 1000]))]
    const pathTerrain = buildTerrain(withPath, extent)
    const pathSites = findControlSites(withPath, pathTerrain)
    const byPath = pathSites.find(
      site => site.placement === 'point' && site.leadingFeatureDistance === 'on',
    )!
    const easy = recheckCourse(pathTerrain, pathSites, spec, {
      ...course,
      controls: course.controls.map((site, i) => (i === 0 ? byPath : site)),
    })
    const harder = fixControl(pathTerrain, pathSites, spec, easy, 1, 'harder')
    expect(harder.controlDifficulties[0]).toBeGreaterThan(easy.controlDifficulties[0]!)
  })
  it('names compass directions with map north up', () => {
    expect(compassDirection(localPoint(0, 0), localPoint(0, 100))).toBe('N')
    expect(compassDirection(localPoint(0, 0), localPoint(100, 100))).toBe('NE')
    expect(compassDirection(localPoint(0, 0), localPoint(-100, 0))).toBe('W')
    expect(compassDirection(localPoint(0, 0), localPoint(-10, -100))).toBe('S')
  })

  it('moves a control in the asked direction', () => {
    const moved = fixControl(terrain, sites, spec, course, 2, 'best', 'E')
    const before = course.controls[1]!.position
    const after = moved.controls[1]!.position
    expect(compassDirection(before, after)).toBe('E')
    expect(moved.controls.filter((_, i) => i !== 1)).toEqual(
      course.controls.filter((_, i) => i !== 1),
    )
  })

  it('removes a control and re-checks the course', () => {
    const removed = removeControl(terrain, sites, spec, course, 2)!
    expect(removed.controls.map(site => site.id)).toEqual(
      course.controls.filter((_, i) => i !== 1).map(site => site.id),
    )
    expect(removed.legSeconds).toHaveLength(course.controls.length)
    expect(removeControl(terrain, sites, spec, course, course.controls.length + 1)).toBeNull()
  })

  it('inserts a control on the asked leg', () => {
    const inserted = insertControl(terrain, sites, spec, course, 2)!
    expect(inserted.controls).toHaveLength(course.controls.length + 1)
    expect(inserted.controls.slice(0, 2)).toEqual(course.controls.slice(0, 2))
    expect(inserted.controls.slice(3)).toEqual(course.controls.slice(2))
    const ids = new Set(course.controls.map(site => site.id))
    expect(ids.has(inserted.controls[2]!.id)).toBe(false)
  })

  it('moves the start within the wished distance of the finish', () => {
    const moved = moveStart(terrain, sites, spec, course, { distanceFromFinishMeters: [0, 120] })!
    const [x, y] = moved.start.position
    expect(Math.hypot(x - moved.finish[0], y - moved.finish[1])).toBeLessThanOrEqual(120)
    expect(moved.controls).toEqual(course.controls)
  })

  it('suggests changes that make the course score better', () => {
    const second = course.controls[1]!
    const crowded = recheckCourse(terrain, sites, spec, {
      ...course,
      controls: course.controls.map((site, i) => (i === 2 ? second : site)),
    })
    const suggestions = suggestChanges(terrain, sites, spec, crowded)
    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions.length).toBeLessThanOrEqual(5)
    for (const suggestion of suggestions) {
      expect(suggestion.course.score).toBeCloseTo(crowded.score - suggestion.scoreGain, 6)
    }
    const gains = suggestions.map(suggestion => suggestion.scoreGain)
    expect(gains).toEqual([...gains].sort((a, b) => b - a))
    expect(suggestions[0]!.course.problems.spacing).toBe(0)
  })
})
