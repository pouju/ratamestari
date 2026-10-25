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

// What the guides replay on the hero's sample run, in the same page units: recorded from the
// engine by `pnpm record-demo-run` (scripts/record-demo-run.ts).
export interface GuideRun {
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
  readonly plannedLeg: (GuideLeg & { readonly from: DemoPoint; readonly to: DemoPoint }) | null
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

export const GUIDE_RUN: GuideRun = {
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
  },
}
