import Feature from 'ol/Feature'
import Circle from 'ol/geom/Circle'
import LineString from 'ol/geom/LineString'
import Point from 'ol/geom/Point'
import Polygon from 'ol/geom/Polygon'
import { Fill, Stroke, Style, Text } from 'ol/style'
import type { FeatureLike } from 'ol/Feature'
import type { LocalPoint } from '@ratamestari/core'
import type { Course } from '@ratamestari/engine'
import { COURSE_OVERPRINT } from '@ratamestari/rules'

export const COURSE_OVERPRINT_PURPLE = COURSE_OVERPRINT.colour

const START_TRIANGLE_SIDE_MM = COURSE_OVERPRINT.startTriangleSideMillimetres
const CONTROL_CIRCLE_DIAMETER_MM = COURSE_OVERPRINT.controlCircleDiameterMillimetres
const FINISH_INNER_DIAMETER_MM = COURSE_OVERPRINT.finishInnerDiameterMillimetres
const FINISH_OUTER_DIAMETER_MM = COURSE_OVERPRINT.finishOuterDiameterMillimetres
const CONTROL_NUMBER_HEIGHT_MM = COURSE_OVERPRINT.controlNumberHeightMillimetres
const COURSE_LINE_WIDTH_MM = COURSE_OVERPRINT.courseLineWidthMillimetres
const COURSE_LINE_GAP_MM = COURSE_OVERPRINT.courseLineGapMillimetres

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

  const features: Feature[] = [startTriangle(start, firstTarget, startRadius)]
  controls.forEach((position, i) => {
    features.push(lineFeature(new Circle([...position], controlRadius)))
    features.push(controlNumber(position, i + 1, controlRadius))
  })
  features.push(lineFeature(new Circle([...course.finish], courseMm(FINISH_INNER_DIAMETER_MM) / 2)))
  features.push(lineFeature(new Circle([...course.finish], finishRadius)))

  const stops = [start, ...controls, course.finish]
  const radii = [startRadius, ...controls.map(() => controlRadius), finishRadius]
  for (let i = 1; i < stops.length; i++) {
    const leg = shortenedLeg(stops[i - 1]!, stops[i]!, radii[i - 1]! + gap, radii[i]! + gap)
    if (leg) features.push(lineFeature(new LineString(leg)))
  }
  return features
}

export function courseOverprintStyle(feature: FeatureLike, metersPerPixel: number): Style {
  const kind = feature.get('kind') as Kind
  if (kind === 'label') {
    const pixels = courseMm(CONTROL_NUMBER_HEIGHT_MM) / metersPerPixel
    return new Style({
      text: new Text({
        text: String(feature.get('label')),
        font: `${Math.max(9, pixels)}px Arial, sans-serif`,
        fill: new Fill({ color: COURSE_OVERPRINT_PURPLE }),
        stroke: new Stroke({ color: 'white', width: 2 }),
      }),
    })
  }
  return new Style({
    stroke: new Stroke({
      color: COURSE_OVERPRINT_PURPLE,
      width: Math.max(1, courseMm(COURSE_LINE_WIDTH_MM) / metersPerPixel),
    }),
  })
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

function shortenedLeg(
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
