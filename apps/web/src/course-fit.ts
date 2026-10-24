import type { Course } from '@ratamestari/engine'
import {
  ageClassSchema,
  courseTargetFor,
  eventLevelSchema,
  formatSchema,
  skillLetterSchema,
  type CourseClass,
  type CourseRequest,
  type CourseTarget,
} from '@ratamestari/rules'

export interface CourseFit {
  readonly request: CourseRequest
  readonly target: CourseTarget
  readonly estimatedMinutes: number
  // How far the estimated winning time is outside the class's range, 0 inside it.
  readonly minutesOutsideRange: number
  readonly controlsOutsideDifficulty: number
  readonly score: number
}

// Interpretation: the winning time weighs most, since courses are set to the class's winning time
// (LS 11.25); a control outside the class's difficulty range costs as much as being 5% off it.
const PERCENT_COST_PER_CONTROL_OUTSIDE_DIFFICULTY = 5
const NEARNESS_TO_TARGET_WEIGHT = 0.01
const CLOSE_SCORE_DIFFERENCE = 1

type MeasuredCourse = Pick<Course, 'estimatedSeconds' | 'controlDifficulties'>

function candidateRequests(known: CourseClass | null, sex: CourseRequest['sex']): CourseRequest[] {
  const classes: CourseClass[] = known
    ? [known]
    : [...ageClassSchema.values].flatMap(ageClass =>
        skillLetterSchema.options.map(skillLetter => ({ sex, ageClass, skillLetter })),
      )
  return eventLevelSchema.options.flatMap(eventLevel =>
    formatSchema.options.flatMap(format =>
      classes.map(courseClass => ({ eventLevel, format, ...courseClass })),
    ),
  )
}

export function fitOf(course: MeasuredCourse, request: CourseRequest): CourseFit | null {
  const target = courseTargetFor(request)
  if (!target) return null
  const { minMinutes, maxMinutes, targetMinutes } = target.winningTime
  const estimatedMinutes = course.estimatedSeconds / 60
  const minutesOutsideRange = Math.max(
    0,
    minMinutes - estimatedMinutes,
    estimatedMinutes - maxMinutes,
  )
  const [easiest, hardest] = target.siteDifficulty
  const controlsOutsideDifficulty = course.controlDifficulties.filter(
    difficulty => difficulty < easiest || difficulty > hardest,
  ).length
  const percentOutside = (100 * minutesOutsideRange) / targetMinutes
  const percentFromTarget = (100 * Math.abs(estimatedMinutes - targetMinutes)) / targetMinutes
  return {
    request,
    target,
    estimatedMinutes,
    minutesOutsideRange,
    controlsOutsideDifficulty,
    score:
      percentOutside +
      PERCENT_COST_PER_CONTROL_OUTSIDE_DIFFICULTY * controlsOutsideDifficulty +
      NEARNESS_TO_TARGET_WEIGHT * percentFromTarget,
  }
}

export interface DeducedClass {
  readonly best: CourseFit
  readonly alsoFits: readonly CourseFit[]
}

// Which level, distance and, unless the course name gave it, class the measured course fits best.
export function deduceClass(
  course: MeasuredCourse,
  known: CourseClass | null,
  fallbackSex: CourseRequest['sex'],
): DeducedClass | null {
  const fits = candidateRequests(known, fallbackSex)
    .map(request => fitOf(course, request))
    .filter(fit => fit !== null)
    .sort((a, b) => a.score - b.score)
  const [best, ...rest] = fits
  if (!best) return null
  return {
    best,
    alsoFits: rest.filter(fit => fit.score - best.score <= CLOSE_SCORE_DIFFERENCE).slice(0, 2),
  }
}
