import { DESCRIPTION_BOX, PAPER, type PaperSize } from '@ratamestari/rules'
import type { ControlSiteCandidate } from './control-sites'
import { expectedControlCount, searchCourse, type Course, type CourseSpec } from './course-search'
import { planPrintArea } from './print-area'
import type { Terrain } from './terrain'

export type PaperChoice = PaperSize | 'auto'

const FITS_WITHIN_SHARE_OF_TARGET = 0.05

const timeError = (course: Course) =>
  Math.abs(course.estimatedSeconds - course.targetSeconds) / course.targetSeconds

const fitsOnPaper = (course: Course) =>
  timeError(course) <= FITS_WITHIN_SHARE_OF_TARGET &&
  course.problems.courseLinesOverDescriptions === 0

export function setCourseOnPaper(
  terrain: Terrain,
  sites: readonly ControlSiteCandidate[],
  spec: CourseSpec,
  paper: PaperChoice,
  onProgress: (course: Course) => void = () => {},
): Course | null {
  const papers = paper === 'auto' ? PAPER.preferenceOrder : [paper]
  const descriptionRows = expectedControlCount(spec.format) + DESCRIPTION_BOX.rowsBesidesControls
  let best: Course | null = null
  for (const size of papers) {
    const printArea = planPrintArea(terrain, sites, {
      paper: size,
      mapScale: spec.mapScale,
      competitionCentre: spec.competitionCentre,
      descriptionRows,
    })
    if (!printArea) continue
    const course = searchCourse(terrain, sites, { ...spec, printArea }, onProgress)
    if (!course) continue
    if (fitsOnPaper(course)) return course
    if (!best || timeError(course) < timeError(best)) best = course
  }
  return best
}
