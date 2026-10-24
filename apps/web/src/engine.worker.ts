import * as Comlink from 'comlink'
import type { LocalPoint } from '@ratamestari/core'
import {
  buildTerrain,
  evaluateLeg,
  findControlSites,
  findPeripheralInformation,
  fitCourseToPaper,
  fixControl,
  moveControl,
  papersFor,
  peripheralLayout,
  setCourseOnPaper,
  type CourseSpec,
  type PaperChoice,
  type ReplacementPreference,
  type ControlSiteCandidate,
  type Course,
  type LegEvaluation,
  type PeripheralInformation,
  type Terrain,
} from '@ratamestari/engine'
import { describeControl } from '@ratamestari/iof'
import { loadOcadMap, type IsomCodeOverrides, type OcadMap } from '@ratamestari/map-ocad'
import {
  courseRequestSchema,
  courseTargetFor,
  printScaleFor,
  type CourseRequest,
  type PrintScaleChoice,
} from '@ratamestari/rules'
import type { CostGridSnapshot } from './cost-map-image'

let map: OcadMap | null = null
let terrain: Terrain | null = null
let sites: readonly ControlSiteCandidate[] = []
let peripheral: PeripheralInformation | null = null
let lastSetting: { spec: CourseSpec; paper: PaperChoice } | null = null

function editedCourse(course: Course, edit: (spec: CourseSpec) => Course | null): Course | null {
  if (!terrain || !lastSetting) throw new Error('Set a course before editing it')
  const { spec, paper } = lastSetting
  const edited = edit({ ...spec, ...(course.printArea && { printArea: course.printArea }) })
  return (
    edited &&
    fitCourseToPaper(terrain, edited, papersFor(paper), spec.printScale, spec.peripheralSize)
  )
}

const engine = {
  async loadMap(bytes: Uint8Array, corrections: IsomCodeOverrides): Promise<void> {
    map = await loadOcadMap(bytes)
    engine.applySymbolCorrections(corrections)
  },

  applySymbolCorrections(corrections: IsomCodeOverrides): void {
    if (!map) throw new Error('No map loaded in the engine')
    const features = map.features(corrections)
    terrain = buildTerrain(features, map.info.extent)
    sites = findControlSites(features, terrain).filter(site => describeControl(site) !== null)
    peripheral = findPeripheralInformation(map.annotations(corrections), terrain, map.info.scale)
  },

  peripheralInformation(): PeripheralInformation {
    if (!peripheral) throw new Error('No map loaded in the engine')
    return peripheral
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
      peripheralSize: peripheral && peripheralLayout(peripheral.blocks),
    }
    lastSetting = { spec, paper }
    return setCourseOnPaper(terrain, sites, spec, paper, onProgress)
  },

  moveControl(course: Course, stopIndex: number, to: LocalPoint): Course | null {
    return editedCourse(course, spec => moveControl(terrain!, sites, spec, course, stopIndex, to))
  },

  fixControl(
    course: Course,
    controlNumber: number,
    preference: ReplacementPreference = 'best',
  ): Course | null {
    return editedCourse(course, spec =>
      fixControl(terrain!, sites, spec, course, controlNumber, preference),
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
