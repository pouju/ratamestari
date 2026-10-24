import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadOcadMap } from '@ratamestari/map-ocad'
import { courseTargetFor } from '@ratamestari/rules'
import { routableCellOf } from '../src/cost-grid'
import { findControlSites, type ControlSiteCandidate } from '../src/control-sites'
import { searchCourse } from '../src/course-search'
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
})
