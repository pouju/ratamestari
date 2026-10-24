import { DESCRIPTION_BOX, PAPER, type PaperSize } from '@ratamestari/rules'
import type { ControlSiteCandidate } from './control-sites'
import {
  expectedControlCount,
  runSearch,
  searchCourseSteps,
  type Course,
  type CourseSpec,
  type Search,
} from './course-search'
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
  return runSearch(setCourseOnPaperSteps(terrain, sites, spec, paper), onProgress)
}

export function* setCourseOnPaperSteps(
  terrain: Terrain,
  sites: readonly ControlSiteCandidate[],
  spec: CourseSpec,
  paper: PaperChoice,
): Search {
  const papers = papersFor(paper)
  const state = { stopped: false }
  const attempt = function* (size: PaperSize, showsProgress: boolean): Search {
    const printArea = planPrintArea(terrain, sites, {
      paper: size,
      printScale: spec.printScale,
      competitionCentre: spec.competitionCentre,
      descriptionRows: expectedControlCount(spec.format) + DESCRIPTION_BOX.rowsBesidesControls,
      peripheralSize: spec.peripheralSize ?? null,
    })
    if (!printArea) return null
    const search = searchCourseSteps(terrain, sites, { ...spec, printArea })
    for (let step = search.next(); ;) {
      if (step.done) return step.value
      const stop = Boolean(yield showsProgress ? step.value : null)
      if (stop) state.stopped = true
      step = search.next(stop)
    }
  }

  const [first, ...larger] = papers
  let course = first ? yield* attempt(first, true) : null
  for (const size of larger) {
    if (state.stopped || (course && fitsOnPaper(course))) break
    // A larger sheet helps only when the paper, not the terrain, was the limit.
    const alternative = yield* attempt(size, false)
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
