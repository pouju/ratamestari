import type { LocalPoint } from '@ratamestari/core'
import type { ControlSiteCandidate, TechnicalDifficulty } from './control-sites'
import { featurelessSite, nearestSite, recheckCourse } from './course-editing'
import type { Course, CourseSpec } from './course-search'
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
  const siteAt = (position: LocalPoint): ControlSiteCandidate => {
    const site = nearestSite(sites, position, CONTROL_FEATURE_MATCH_METRES)
    return site
      ? { ...site, position }
      : featurelessSite(position, spec.target.siteDifficulty[1] as TechnicalDifficulty)
  }
  return recheckCourse(terrain, sites, spec, {
    start: siteAt(stops.start),
    controls: stops.controls.map(siteAt),
    finish: stops.finish,
  })
}
