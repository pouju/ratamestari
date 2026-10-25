import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadOcadMap } from '@ratamestari/map-import-ocad'
import { courseTargetFor } from '@ratamestari/rules'
import { routableCellOf } from '../src/cost-grid'
import { findControlSites, type ControlSiteCandidate } from '../src/control-sites'
import { setCourseOnPaper } from '../src/course-on-paper'
import { searchCourse, type CourseSpec } from '../src/course-search'
import { isUsableInPrintArea } from '../src/print-area'
import { isSameSite } from '../src/locks'
import { findPeripheralInformation, isInPeripheralBlock } from '../src/peripheral'
import { cellCenterOf } from '../src/raster'
import { buildTerrain, type Terrain } from '../src/terrain'
import { secondsFrom } from '../src/time-tree'

const SAMPLE_MAP = fileURLToPath(
  new URL('../../../apps/web/public/sample/leirikangas-sample.ocd', import.meta.url),
)
const PACE_SECONDS_PER_KM = 400
const SETUP_TIMEOUT_MS = 60_000

describe('engine on the committed sample map', { timeout: SETUP_TIMEOUT_MS }, () => {
  let terrain: Terrain
  let sites: ControlSiteCandidate[]

  beforeAll(async () => {
    const map = await loadOcadMap(new Uint8Array(readFileSync(SAMPLE_MAP)))
    const features = map.features()
    terrain = buildTerrain(features, map.info.extent)
    const peripheral = findPeripheralInformation(map.annotations(), terrain, map.info.scale)
    sites = findControlSites(features, terrain).filter(
      site => !isInPeripheralBlock(peripheral, site.position),
    )
  }, SETUP_TIMEOUT_MS)

  // The middle-distance core can lie far from the finish; the start must still be near it.
  it('starts a middle course at most a fifth of the winning time from the finish', () => {
    const target = courseTargetFor({
      eventLevel: 'national',
      format: 'middle',
      sex: 'D',
      ageClass: 12,
      skillLetter: 'A',
    })!
    const mapped = [...terrain.mappedArea.keys()].filter(i => terrain.mappedArea[i])
    for (const share of [0.1, 0.3]) {
      const centre = cellCenterOf(terrain.grid, mapped[Math.floor(mapped.length * share)]!)
      const course = searchCourse(terrain, sites, {
        target,
        format: 'middle',
        printScale: 10000,
        competitionCentre: centre,
        seed: 1,
        paceSecondsPerKm: PACE_SECONDS_PER_KM,
        improvementSteps: 50,
      })!
      const toFinish = secondsFrom(terrain.grid, course.finish, PACE_SECONDS_PER_KM, Infinity)
      const startSeconds = toFinish[routableCellOf(terrain.grid, course.start.position)!]!
      expect(startSeconds).toBeLessThanOrEqual(0.2 * course.targetSeconds)
    }
  })

  it('keeps the kept controls and legs when the course is set again', () => {
    const mapped = [...terrain.mappedArea.keys()].filter(i => terrain.mappedArea[i])
    const spec: CourseSpec = {
      target: courseTargetFor({
        eventLevel: 'national',
        format: 'middle',
        sex: 'D',
        ageClass: 14,
        skillLetter: 'A',
      })!,
      format: 'middle',
      printScale: 10000,
      competitionCentre: cellCenterOf(terrain.grid, mapped[Math.floor(mapped.length / 2)]!),
      seed: 1,
      paceSecondsPerKm: PACE_SECONDS_PER_KM,
      improvementSteps: 50,
    }
    const first = searchCourse(terrain, sites, spec)!
    const kept = [1, 4, 5].map(i => first.controls[i]!)
    const again = searchCourse(terrain, sites, {
      ...spec,
      seed: 2,
      locks: {
        start: null,
        controls: kept,
        keptLegs: [false, false, true, false],
      },
    })!
    const positions = kept.map(site => again.controls.findIndex(other => isSameSite(other, site)))
    expect(positions.every(position => position >= 0)).toBe(true)
    expect(positions[1]!).toBeGreaterThan(positions[0]!)
    expect(positions[2]).toBe(positions[1]! + 1)
    expect(again.controls.map(site => site.id)).not.toEqual(first.controls.map(site => site.id))
  })

  it('sets a course around a planned leg, on paper that holds it', () => {
    const mapped = [...terrain.mappedArea.keys()].filter(i => terrain.mappedArea[i])
    const centre = cellCenterOf(terrain.grid, mapped[Math.floor(mapped.length / 2)]!)
    const distanceFromCentre = (site: ControlSiteCandidate) =>
      Math.hypot(site.position[0] - centre[0], site.position[1] - centre[1])
    const from = sites.find(
      site => distanceFromCentre(site) > 500 && distanceFromCentre(site) < 700,
    )!
    const to = sites.find(
      site =>
        Math.hypot(site.position[0] - from.position[0], site.position[1] - from.position[1]) >
          300 &&
        Math.hypot(site.position[0] - from.position[0], site.position[1] - from.position[1]) < 450,
    )!
    const course = setCourseOnPaper(
      terrain,
      sites,
      {
        target: courseTargetFor({
          eventLevel: 'national',
          format: 'middle',
          sex: 'D',
          ageClass: 16,
          skillLetter: 'A',
        })!,
        format: 'middle',
        printScale: 10000,
        competitionCentre: centre,
        seed: 1,
        paceSecondsPerKm: PACE_SECONDS_PER_KM,
        improvementSteps: 50,
        locks: { start: null, controls: [from, to], keptLegs: [false, true, false] },
      },
      'auto',
    )!
    const first = course.controls.findIndex(site => isSameSite(site, from))
    expect(first).toBeGreaterThanOrEqual(0)
    expect(isSameSite(course.controls[first + 1]!, to)).toBe(true)
    expect([from, to].every(site => isUsableInPrintArea(site.position, course.printArea!))).toBe(
      true,
    )
  })
})
