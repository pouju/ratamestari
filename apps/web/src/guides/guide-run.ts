import type { CompassDirection } from '@ratamestari/engine'
import type { DemoPoint } from '../landing/demo-run'
import recorded from './guide-run.json'

export interface GuideRoute {
  readonly points: readonly DemoPoint[]
  readonly lengthMeters: number
  readonly timeSeconds: number
}

// The fastest route first, then the other real routes from fastest to slowest.
export interface GuideLeg {
  readonly straightMeters: number
  readonly bearingDegrees: number
  readonly routes: readonly GuideRoute[]
}

// A course set around kept controls: its stops, and where the kept controls ended up.
export interface GuideCourse {
  readonly start: DemoPoint
  readonly controls: readonly DemoPoint[]
  readonly numbers: readonly DemoPoint[]
  readonly keptStops: readonly number[]
}

// The course set again after keeping leg `leg` of the sample course.
export interface GuideKeep extends GuideCourse {
  readonly leg: number
}

// What the guides replay on the hero's sample run, in the same page units: recorded from the
// engine by `pnpm record-demo-run` (scripts/record-demo-run.ts).
export interface GuideRun {
  readonly keep: GuideKeep | null
  readonly leg: GuideLeg & { readonly index: number }
  readonly courseRoutes: readonly (readonly GuideRoute[])[]
  readonly findings: number
  readonly drag: {
    readonly control: number
    readonly to: DemoPoint
    readonly findings: number
  } | null
  readonly assistant: {
    readonly control: number
    readonly direction: CompassDirection
    readonly to: DemoPoint
  } | null
  readonly plannedLeg:
    | (GuideLeg & {
        readonly from: DemoPoint
        readonly to: DemoPoint
        // The course set around the planned leg.
        readonly around: GuideCourse | null
      })
    | null
}

const point = ([x = 0, y = 0]: readonly number[]): DemoPoint => [x, y]

interface RecordedRoute {
  points: number[][]
  lengthMeters: number
  timeSeconds: number
}
const route = (recordedRoute: RecordedRoute): GuideRoute => ({
  ...recordedRoute,
  points: recordedRoute.points.map(point),
})
const leg = (recordedLeg: {
  straightMeters: number
  bearingDegrees: number
  routes: RecordedRoute[]
}) => ({
  straightMeters: recordedLeg.straightMeters,
  bearingDegrees: recordedLeg.bearingDegrees,
  routes: recordedLeg.routes.map(route),
})

interface RecordedCourse {
  start: number[]
  controls: number[][]
  numbers: number[][]
  keptStops: number[]
}
const guideCourse = (course: RecordedCourse): GuideCourse => ({
  start: point(course.start),
  controls: course.controls.map(point),
  numbers: course.numbers.map(point),
  keptStops: course.keptStops,
})

export const GUIDE_RUN: GuideRun = {
  keep: recorded.keep && { leg: recorded.keep.leg, ...guideCourse(recorded.keep) },
  leg: { index: recorded.leg.index, ...leg(recorded.leg) },
  courseRoutes: recorded.courseRoutes.map(routes => routes.map(route)),
  findings: recorded.findings,
  drag: recorded.drag && { ...recorded.drag, to: point(recorded.drag.to) },
  assistant: recorded.assistant && {
    control: recorded.assistant.control,
    direction: recorded.assistant.direction as CompassDirection,
    to: point(recorded.assistant.to),
  },
  plannedLeg: recorded.plannedLeg && {
    ...leg(recorded.plannedLeg),
    from: point(recorded.plannedLeg.from),
    to: point(recorded.plannedLeg.to),
    around: recorded.plannedLeg.around && guideCourse(recorded.plannedLeg.around),
  },
}
