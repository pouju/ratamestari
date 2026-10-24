import * as Comlink from 'comlink'
import type { LocalPoint } from '@ratamestari/core'
import {
  buildTerrain,
  evaluateLeg,
  findControlSites,
  setCourseOnPaper,
  type PaperChoice,
  type ControlSiteCandidate,
  type Course,
  type LegEvaluation,
  type Terrain,
} from '@ratamestari/engine'
import { describeControl } from '@ratamestari/iof'
import { loadOcadMap } from '@ratamestari/map-ocad'
import { courseRequestSchema, courseTargetFor, type CourseRequest } from '@ratamestari/rules'
import type { CostGridSnapshot } from './cost-map-image'

let terrain: Terrain | null = null
let sites: readonly ControlSiteCandidate[] = []
let mapScale = 0

const engine = {
  async loadMap(bytes: Uint8Array): Promise<void> {
    const map = await loadOcadMap(bytes)
    terrain = buildTerrain(map.features(), map.info.extent)
    sites = findControlSites(map.features(), terrain).filter(site => describeControl(site) !== null)
    mapScale = map.info.scale
  },

  evaluateLeg(from: LocalPoint, to: LocalPoint, paceSecondsPerKm: number): LegEvaluation | null {
    if (!terrain) throw new Error('No map loaded in the engine')
    return evaluateLeg(terrain, from, to, { paceSecondsPerKm })
  },

  generateCourse(
    request: CourseRequest,
    competitionCentre: LocalPoint,
    seed: number,
    paceSecondsPerKm: number,
    paper: PaperChoice,
    onProgress: (course: Course) => void,
  ): Course | null {
    if (!terrain) throw new Error('No map loaded in the engine')
    const validRequest = courseRequestSchema.parse(request)
    const target = courseTargetFor(validRequest)
    if (!target) return null
    return setCourseOnPaper(
      terrain,
      sites,
      { target, format: validRequest.format, mapScale, competitionCentre, seed, paceSecondsPerKm },
      paper,
      onProgress,
    )
  },

  controlSites(): readonly ControlSiteCandidate[] {
    return sites
  },

  costGrid(): CostGridSnapshot {
    if (!terrain) throw new Error('No map loaded in the engine')
    const { minX, minY, cellSizeMeters, columns, rows, speed } = terrain.grid
    return { frame: { minX, minY, cellSizeMeters, columns, rows }, speed }
  },
}

export type EngineApi = typeof engine

Comlink.expose(engine)
