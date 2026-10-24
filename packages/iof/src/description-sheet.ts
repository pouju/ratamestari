import type { Course } from '@ratamestari/engine'
import {
  isAllowedControlCode,
  CONTROL_CODES,
  type DescriptionFinishRoute,
} from '@ratamestari/rules'
import { describeControl, type ControlDescription } from './describe-control'

export interface DescriptionRow {
  readonly number: number
  readonly code: number
  readonly description: ControlDescription | null
}

export interface DescriptionSheet {
  readonly title: string
  readonly courseName: string
  readonly lengthKilometers: number | null
  readonly climbMeters: number | null
  readonly start: ControlDescription | null
  readonly controls: readonly DescriptionRow[]
  readonly finish: { readonly distanceMeters: number; readonly route: DescriptionFinishRoute }
}

export interface SheetOptions {
  readonly title: string
  readonly courseName: string
  readonly finishRoute?: DescriptionFinishRoute
}

export function allowedControlCodes(count: number): number[] {
  const codes: number[] = []
  for (let code = CONTROL_CODES.min; codes.length < count && code <= CONTROL_CODES.max; code++) {
    if (isAllowedControlCode(code)) codes.push(code)
  }
  return codes
}

const roundToTenth = (value: number) => Math.round(value * 10) / 10
const roundToFive = (value: number) => Math.round(value / 5) * 5

export function descriptionSheet(
  course: Course,
  { title, courseName, finishRoute = 'tapedAllTheWay' }: SheetOptions,
): DescriptionSheet {
  const codes = allowedControlCodes(course.controls.length)
  const last = course.controls.at(-1)?.position ?? course.start.position
  return {
    title,
    courseName,
    lengthKilometers:
      course.lengthMeters === null ? null : roundToTenth(course.lengthMeters / 1000),
    climbMeters: course.climbMeters === null ? null : roundToFive(course.climbMeters),
    start: describeControl(course.start),
    controls: course.controls.map((site, i) => ({
      number: i + 1,
      code: codes[i]!,
      description: describeControl(site),
    })),
    finish: {
      distanceMeters: roundToFive(
        Math.hypot(course.finish[0] - last[0], course.finish[1] - last[1]),
      ),
      route: finishRoute,
    },
  }
}
