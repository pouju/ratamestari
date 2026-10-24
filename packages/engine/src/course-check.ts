import type { LocalPoint } from '@ratamestari/core'
import type { ControlSiteCandidate, TechnicalDifficulty } from './control-sites'
import { nearestSite, recheckCourse } from './course-editing'
import type { Course, CourseSpec, Finding } from './course-search'
import type { Terrain } from './terrain'

export const CONTROL_FEATURE_MATCH_METRES = 15

export interface SetCourseStops {
  readonly start: LocalPoint
  readonly controls: readonly LocalPoint[]
  readonly finish: LocalPoint
}

// A course set by hand, in OCAD or Purple Pen, checked by the same rules as a generated one. Each
// control keeps the setter's position and takes its description from the map feature under it.
export function checkSetCourse(
  terrain: Terrain,
  sites: readonly ControlSiteCandidate[],
  spec: CourseSpec,
  stops: SetCourseStops,
): Course {
  const withoutFeature: number[] = []
  const siteAt = (position: LocalPoint, stop: number): ControlSiteCandidate => {
    const site = nearestSite(sites, position, CONTROL_FEATURE_MATCH_METRES)
    if (site) return { ...site, position }
    if (stop > 0) withoutFeature.push(stop)
    return featurelessSite(
      position,
      -1 - stop,
      spec.target.siteDifficulty[1] as TechnicalDifficulty,
    )
  }
  const checked = recheckCourse(terrain, sites, spec, {
    start: siteAt(stops.start, 0),
    controls: stops.controls.map((position, i) => siteAt(position, i + 1)),
    finish: stops.finish,
  })
  const findings: Finding[] = withoutFeature.map(stop => ({
    kind: 'controlsWithoutFeature',
    stops: [stop],
  }))
  return {
    ...checked,
    problems: { ...checked.problems, controlsWithoutFeature: withoutFeature.length },
    findings: [...checked.findings, ...findings],
  }
}

// Without a feature the control cannot be described; its difficulty is taken as the class's
// highest so that it raises no difficulty finding of its own.
function featurelessSite(
  position: LocalPoint,
  id: number,
  difficulty: TechnicalDifficulty,
): ControlSiteCandidate {
  return {
    id,
    position,
    isomCode: '',
    symbolNumber: 0,
    placement: 'point',
    contourForm: null,
    distanceToLeadingFeatureMeters: 0,
    leadingFeatureDistance: 'far',
    inSlowTerrain: false,
    technicalDifficulty: difficulty,
    orientation: null,
    similarFeatureOffsets: [],
    flagSide: null,
  }
}
