import Feature from 'ol/Feature'
import Circle from 'ol/geom/Circle'
import LineString from 'ol/geom/LineString'
import Point from 'ol/geom/Point'
import Polygon from 'ol/geom/Polygon'
import { asArray } from 'ol/color'
import { Fill, Stroke, Style, Text } from 'ol/style'
import type { FeatureLike } from 'ol/Feature'
import type { LocalPoint } from '@ratamestari/core'
import type { Course } from '@ratamestari/engine'
import { COURSE_OVERPRINT } from '@ratamestari/rules'

export const COURSE_OVERPRINT_PURPLE = COURSE_OVERPRINT.colour
const FADED_OVERPRINT_OPACITY = 0.3
const FADED_OVERPRINT_PURPLE = [
  ...asArray(COURSE_OVERPRINT_PURPLE).slice(0, 3),
  FADED_OVERPRINT_OPACITY,
]

const START_TRIANGLE_SIDE_MM = COURSE_OVERPRINT.startTriangleSideMillimetres
const CONTROL_CIRCLE_DIAMETER_MM = COURSE_OVERPRINT.controlCircleDiameterMillimetres
const FINISH_INNER_DIAMETER_MM = COURSE_OVERPRINT.finishInnerDiameterMillimetres
const FINISH_OUTER_DIAMETER_MM = COURSE_OVERPRINT.finishOuterDiameterMillimetres
const CONTROL_NUMBER_HEIGHT_MM = COURSE_OVERPRINT.controlNumberHeightMillimetres
const COURSE_LINE_WIDTH_MM = COURSE_OVERPRINT.courseLineWidthMillimetres
const COURSE_LINE_GAP_MM = COURSE_OVERPRINT.courseLineGapMillimetres
const SELECTED_LINE_WIDTH_FACTOR = 2.5

// Course symbols keep their ground size at any print scale (ISOM 2017-2 §3.7).
const courseMm = (mm: number) => (mm * COURSE_OVERPRINT.baseScale) / 1000

type Kind = 'line' | 'label'

export function courseOverprintFeatures(course: Course): Feature[] {
  const start = course.start.position
  const controls = course.controls.map(c => c.position)
  const firstTarget = controls[0] ?? course.finish
  const controlRadius = courseMm(CONTROL_CIRCLE_DIAMETER_MM) / 2
  const startRadius = courseMm(START_TRIANGLE_SIDE_MM) / Math.sqrt(3)
  const finishRadius = courseMm(FINISH_OUTER_DIAMETER_MM) / 2
  const gap = courseMm(COURSE_LINE_GAP_MM)

  const finishStop = controls.length + 1
  const features: Feature[] = [
    draggable(atStop(startTriangle(start, firstTarget, startRadius), 0), 0),
  ]
  controls.forEach((position, i) => {
    features.push(
      draggable(atStop(lineFeature(new Circle([...position], controlRadius)), i + 1), i + 1),
    )
    features.push(atStop(controlNumber(position, i + 1, controlRadius), i + 1))
  })
  features.push(
    atStop(
      lineFeature(new Circle([...course.finish], courseMm(FINISH_INNER_DIAMETER_MM) / 2)),
      finishStop,
    ),
  )
  features.push(
    draggable(
      atStop(lineFeature(new Circle([...course.finish], finishRadius)), finishStop),
      finishStop,
    ),
  )

  const stops = [start, ...controls, course.finish]
  const radii = [startRadius, ...controls.map(() => controlRadius), finishRadius]
  for (let i = 1; i < stops.length; i++) {
    const leg = shortenedLeg(stops[i - 1]!, stops[i]!, radii[i - 1]! + gap, radii[i]! + gap)
    if (leg) features.push(onLeg(lineFeature(new LineString(leg)), i - 1))
  }
  return features
}

// drawnLegs is how far the course has been drawn, in legs (1.5 = first leg and half the second),
// or null when the whole course is shown.
export const courseOverprintStyle =
  (
    highlightedLeg: number | null,
    drawnLegs: number | null = null,
    selectedStop: number | null = null,
  ) =>
  (feature: FeatureLike, metersPerPixel: number): Style | undefined => {
    const colour =
      highlightedLeg === null || isOnLeg(feature, highlightedLeg)
        ? COURSE_OVERPRINT_PURPLE
        : FADED_OVERPRINT_PURPLE
    if (selectedStop !== null && feature.get(STOP) === selectedStop)
      return overprintStyle(feature, metersPerPixel, colour, SELECTED_LINE_WIDTH_FACTOR)
    if (drawnLegs === null) return overprintStyle(feature, metersPerPixel, colour)
    const leg = feature.get(LEG_INDEX)
    const stop = feature.get(STOP)
    if (typeof leg === 'number') {
      const share = Math.min(1, drawnLegs - leg)
      if (share <= 0) return undefined
      const style = overprintStyle(feature, metersPerPixel, colour)
      const line = feature.getGeometry()
      if (share < 1 && line instanceof LineString) style.setGeometry(partOfLine(line, share))
      return style
    }
    if (typeof stop === 'number' && stop > drawnLegs) return undefined
    return overprintStyle(feature, metersPerPixel, colour)
  }

function partOfLine(line: LineString, share: number): LineString {
  const [from = [], to = []] = line.getCoordinates()
  const [x1 = 0, y1 = 0] = from
  const [x2 = 0, y2 = 0] = to
  return new LineString([
    [x1, y1],
    [x1 + (x2 - x1) * share, y1 + (y2 - y1) * share],
  ])
}

function overprintStyle(
  feature: FeatureLike,
  metersPerPixel: number,
  colour: string | number[],
  lineWidthFactor = 1,
): Style {
  const kind = feature.get('kind') as Kind
  if (kind === 'label') {
    const pixels = courseMm(CONTROL_NUMBER_HEIGHT_MM) / metersPerPixel
    return new Style({
      text: new Text({
        text: String(feature.get('label')),
        font: `${Math.max(9, pixels)}px Arial, sans-serif`,
        fill: new Fill({ color: colour }),
        stroke: new Stroke({ color: 'white', width: 2 }),
      }),
    })
  }
  return new Style({
    stroke: new Stroke({
      color: colour,
      width: lineWidthFactor * Math.max(1, courseMm(COURSE_LINE_WIDTH_MM) / metersPerPixel),
    }),
  })
}

export const STOP_INDEX = 'stopIndex'
const STOP = 'stop'
const LEG_INDEX = 'legIndex'

export function legOfFeature(feature: FeatureLike): number | null {
  const leg = feature.get(LEG_INDEX)
  if (typeof leg === 'number') return leg
  const stop = feature.get(STOP)
  return typeof stop === 'number' ? Math.max(0, stop - 1) : null
}

export type CourseHit =
  { readonly kind: 'stop'; readonly stop: number } | { readonly kind: 'leg'; readonly leg: number }

// A control, the start or the finish wins over a leg line drawn next to it.
export function courseHitOf(features: readonly FeatureLike[]): CourseHit | null {
  let legHit: CourseHit | null = null
  for (const feature of features) {
    const stop = feature.get(STOP)
    if (typeof stop === 'number') return { kind: 'stop', stop }
    const leg = feature.get(LEG_INDEX)
    if (legHit === null && typeof leg === 'number') legHit = { kind: 'leg', leg }
  }
  return legHit
}

function isOnLeg(feature: FeatureLike, leg: number): boolean {
  const stop = feature.get(STOP)
  return feature.get(LEG_INDEX) === leg || stop === leg || stop === leg + 1
}

function atStop(feature: Feature, stop: number): Feature {
  feature.set(STOP, stop)
  return feature
}

function onLeg(feature: Feature, leg: number): Feature {
  feature.set(LEG_INDEX, leg)
  return feature
}

function draggable(feature: Feature, stopIndex: number): Feature {
  feature.set(STOP_INDEX, stopIndex)
  return feature
}

function lineFeature(geometry: Circle | LineString | Polygon): Feature {
  return new Feature({ geometry, kind: 'line' satisfies Kind })
}

function startTriangle(center: LocalPoint, towards: LocalPoint, radius: number): Feature {
  const heading = Math.atan2(towards[1] - center[1], towards[0] - center[0])
  const corners = [0, 120, 240].map(degrees => {
    const angle = heading + (degrees * Math.PI) / 180
    return [center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle)]
  })
  return lineFeature(new Polygon([[...corners, corners[0]!]]))
}

function controlNumber(position: LocalPoint, number: number, circleRadius: number): Feature {
  const offset = circleRadius + courseMm(CONTROL_NUMBER_HEIGHT_MM) / 2
  return new Feature({
    geometry: new Point([position[0] + offset * Math.SQRT1_2, position[1] + offset * Math.SQRT1_2]),
    kind: 'label' satisfies Kind,
    label: number,
  })
}

export function shortenedLeg(
  from: LocalPoint,
  to: LocalPoint,
  trimStart: number,
  trimEnd: number,
): number[][] | null {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const length = Math.hypot(dx, dy)
  if (length <= trimStart + trimEnd) return null
  const ux = dx / length
  const uy = dy / length
  return [
    [from[0] + ux * trimStart, from[1] + uy * trimStart],
    [to[0] - ux * trimEnd, to[1] - uy * trimEnd],
  ]
}
