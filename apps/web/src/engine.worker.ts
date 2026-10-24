import * as Comlink from 'comlink'
import type { LocalPoint } from '@ratamestari/core'
import {
  buildTerrain,
  evaluateLeg,
  findControlSites,
  fitCourseToPaper,
  fixControl,
  moveControl,
  papersFor,
  setCourseOnPaper,
  type CourseSpec,
  type PaperChoice,
  type ControlSiteCandidate,
  type Course,
  type LegEvaluation,
  type Terrain,
} from '@ratamestari/engine'
import { describeControl } from '@ratamestari/iof'
import { loadOcadMap } from '@ratamestari/map-ocad'
import {
  courseRequestSchema,
  courseTargetFor,
  printScaleFor,
  type CourseRequest,
  type PrintScaleChoice,
} from '@ratamestari/rules'
import type { CostGridSnapshot } from './cost-map-image'

let terrain: Terrain | null = null
let sites: readonly ControlSiteCandidate[] = []
let lastSetting: { spec: CourseSpec; paper: PaperChoice } | null = null

function editedCourse(course: Course, edit: (spec: CourseSpec) => Course | null): Course | null {
  if (!terrain || !lastSetting) throw new Error('Set a course before editing it')
  const { spec, paper } = lastSetting
  const edited = edit({ ...spec, ...(course.printArea && { printArea: course.printArea }) })
  return edited && fitCourseToPaper(terrain, edited, papersFor(paper), spec.printScale)
}

const engine = {
  async loadMap(bytes: Uint8Array): Promise<void> {
    const map = await loadOcadMap(bytes)
    terrain = buildTerrain(map.features(), map.info.extent)
    sites = findControlSites(map.features(), terrain).filter(site => describeControl(site) !== null)
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
    printScaleChoice: PrintScaleChoice,
    onProgress: (course: Course) => void,
  ): Course | null {
    if (!terrain) throw new Error('No map loaded in the engine')
    const validRequest = courseRequestSchema.parse(request)
    const target = courseTargetFor(validRequest)
    if (!target) return null
    const spec: CourseSpec = {
      target,
      format: validRequest.format,
      printScale: printScaleFor(printScaleChoice, validRequest.format),
      competitionCentre,
      seed,
      paceSecondsPerKm,
    }
    lastSetting = { spec, paper }
    return setCourseOnPaper(terrain, sites, spec, paper, onProgress)
  },

  moveControl(course: Course, stopIndex: number, to: LocalPoint): Course | null {
    return editedCourse(course, spec => moveControl(terrain!, sites, spec, course, stopIndex, to))
  },

  fixControl(course: Course, controlNumber: number): Course | null {
    return editedCourse(course, spec => fixControl(terrain!, sites, spec, course, controlNumber))
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
