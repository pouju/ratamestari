import type { LocalPoint } from '@ratamestari/core'
import type { ControlSiteCandidate, Course, FlagSide } from '@ratamestari/engine'
import { describeControl, descriptionText } from '@ratamestari/iof'
import { describeFinding } from './rule-findings'

export interface ControlSummary {
  readonly number: number
  readonly feature: string
  readonly technicalDifficulty: number
  readonly legStraightMeters: number
  readonly legMinutes: number
}

export interface CourseSummary {
  readonly option: number
  readonly controlCount: number
  readonly estimatedWinningMinutes: number
  readonly targetWinningMinutes: number
  readonly lengthKilometers: number | null
  readonly climbMeters: number | null
  readonly ruleProblems: readonly string[]
  readonly start: string
  readonly controls: readonly ControlSummary[]
  readonly finishLeg: { readonly straightMeters: number; readonly minutes: number }
}

export function describeSite(site: ControlSiteCandidate, flagSide: FlagSide | null = null): string {
  const description = describeControl(site, flagSide)
  return description ? descriptionText(description) : 'not describable'
}

const distance = (a: LocalPoint, b: LocalPoint) => Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]))
const minutes = (seconds: number) => Math.round(seconds / 6) / 10

export function summarizeCourse(course: Course): CourseSummary {
  const positions = [course.start.position, ...course.controls.map(site => site.position)]
  const finishLegSeconds = course.legSeconds[course.controls.length] ?? 0
  return {
    option: course.seed,
    controlCount: course.controls.length,
    estimatedWinningMinutes: minutes(course.estimatedSeconds),
    targetWinningMinutes: minutes(course.targetSeconds),
    lengthKilometers:
      course.lengthMeters === null ? null : Math.round(course.lengthMeters / 100) / 10,
    climbMeters: course.climbMeters === null ? null : Math.round(course.climbMeters / 5) * 5,
    ruleProblems: course.findings.map(
      finding => describeFinding(finding, course.controls.length).text,
    ),
    start: describeSite(course.start),
    controls: course.controls.map((site, i) => ({
      number: i + 1,
      feature: describeSite(site, course.flagSides[i] ?? null),
      technicalDifficulty: course.controlDifficulties[i] ?? site.technicalDifficulty,
      legStraightMeters: distance(positions[i]!, site.position),
      legMinutes: minutes(course.legSeconds[i] ?? 0),
    })),
    finishLeg: {
      straightMeters: distance(positions.at(-1)!, course.finish),
      minutes: minutes(finishLegSeconds),
    },
  }
}
