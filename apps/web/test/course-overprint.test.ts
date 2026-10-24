import { describe, expect, it } from 'vitest'
import LineString from 'ol/geom/LineString'
import { localPoint } from '@ratamestari/core'
import type { Course } from '@ratamestari/engine'
import {
  courseOverprintFeatures,
  courseHitOf,
  courseOverprintStyle,
  legOfFeature,
} from '../src/course-overprint'

const course = {
  start: { position: localPoint(0, 0) },
  controls: [{ position: localPoint(1000, 0) }],
  finish: localPoint(1000, 1000),
} as unknown as Course

const features = courseOverprintFeatures(course)
const legLine = (leg: number) =>
  features.find(
    feature => feature.getGeometry() instanceof LineString && legOfFeature(feature) === leg,
  )!
const controlCircle = features.find(
  feature =>
    !(feature.getGeometry() instanceof LineString) &&
    legOfFeature(feature) === 0 &&
    feature.get('stopIndex') === 1,
)!

describe('drawing a course leg by leg', () => {
  const halfway = courseOverprintStyle(null, 0.5)

  it('draws only the share of the leg reached so far', () => {
    const style = halfway(legLine(0), 1)!
    const [, end = []] = (style.getGeometry() as LineString).getCoordinates()
    const [, fullEnd = []] = (legLine(0).getGeometry() as LineString).getCoordinates()
    expect(end[0]).toBeLessThan(fullEnd[0]!)
  })

  it('hides the legs and controls not reached yet', () => {
    expect(halfway(legLine(1), 1)).toBeUndefined()
    expect(halfway(controlCircle, 1)).toBeUndefined()
  })

  it('shows everything once the course is drawn', () => {
    const whole = courseOverprintStyle(null)
    expect(whole(legLine(1), 1)).toBeDefined()
    expect(whole(controlCircle, 1)).toBeDefined()
  })
})

describe('what a tap on the course hits', () => {
  const finishCircles = features.filter(feature => feature.get('stopIndex') === 2)

  it('prefers a control over the leg line next to it', () => {
    expect(courseHitOf([legLine(0), controlCircle])).toEqual({ kind: 'stop', stop: 1 })
    expect(courseHitOf([legLine(1)])).toEqual({ kind: 'leg', leg: 1 })
    expect(courseHitOf([])).toBeNull()
  })

  it('lets the finish be dragged like the start and the controls', () => {
    expect(finishCircles).toHaveLength(1)
  })

  it('draws the selected stop thicker', () => {
    const plain = courseOverprintStyle(null)(controlCircle, 1)!
    const selected = courseOverprintStyle(null, null, 1)(controlCircle, 1)!
    expect(selected.getStroke()!.getWidth()).toBeGreaterThan(plain.getStroke()!.getWidth()!)
  })
})
