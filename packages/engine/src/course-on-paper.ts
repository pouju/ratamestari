import { DESCRIPTION_BOX, PAPER, type PaperSize } from '@ratamestari/rules'
import type { ControlSiteCandidate } from './control-sites'
import { expectedControlCount, searchCourse, type Course, type CourseSpec } from './course-search'
import { fitPrintAreaToCourse, planPrintArea, type PaperBoxSize } from './print-area'
import type { Terrain } from './terrain'

export type PaperChoice = PaperSize | 'auto'

const FITS_WITHIN_SHARE_OF_TARGET = 0.05
const CLEARLY_BETTER_SHARE_OF_TARGET = 0.05

const timeError = (course: Course) =>
  Math.abs(course.estimatedSeconds - course.targetSeconds) / course.targetSeconds

const fitsOnPaper = (course: Course) =>
  timeError(course) <= FITS_WITHIN_SHARE_OF_TARGET &&
  course.problems.courseLinesOverDescriptions === 0

export const papersFor = (paper: PaperChoice): readonly PaperSize[] =>
  paper === 'auto' ? PAPER.preferenceOrder : [paper]

export function setCourseOnPaper(
  terrain: Terrain,
  sites: readonly ControlSiteCandidate[],
  spec: CourseSpec,
  paper: PaperChoice,
  onProgress: (course: Course) => void = () => {},
): Course | null {
  const papers = papersFor(paper)
  const attempt = (size: PaperSize, report: (course: Course) => void) => {
    const printArea = planPrintArea(terrain, sites, {
      paper: size,
      printScale: spec.printScale,
      competitionCentre: spec.competitionCentre,
      descriptionRows: expectedControlCount(spec.format) + DESCRIPTION_BOX.rowsBesidesControls,
      peripheralSize: spec.peripheralSize ?? null,
    })
    return printArea ? searchCourse(terrain, sites, { ...spec, printArea }, report) : null
  }

  const [first, ...larger] = papers
  let course = first ? attempt(first, onProgress) : null
  for (const size of larger) {
    if (course && fitsOnPaper(course)) break
    // A larger sheet helps only when the paper, not the terrain, was the limit.
    const alternative = attempt(size, () => {})
    if (
      alternative &&
      (!course || timeError(alternative) < timeError(course) - CLEARLY_BETTER_SHARE_OF_TARGET)
    ) {
      course = alternative
    }
  }
  if (!course) return null

  return fitCourseToPaper(terrain, course, papers, spec.printScale, spec.peripheralSize)
}

export function fitCourseToPaper(
  terrain: Terrain,
  course: Course,
  papers: readonly PaperSize[],
  printScale: number,
  peripheralSize: PaperBoxSize | null = null,
): Course {
  const stops = [
    course.start.position,
    ...course.controls.map(site => site.position),
    course.finish,
  ]
  const fitted = fitPrintAreaToCourse(terrain, stops, {
    papers,
    printScale,
    descriptionRows: course.controls.length + DESCRIPTION_BOX.rowsBesidesControls,
    peripheralSize,
  })
  if (!fitted) return course
  return {
    ...course,
    printArea: fitted,
    problems: { ...course.problems, courseLinesOverDescriptions: 0 },
    findings: course.findings.filter(finding => finding.kind !== 'courseLinesOverDescriptions'),
  }
}
