import { describe, expect, it } from 'vitest'
import { localPoint, type LocalPoint } from '@ratamestari/core'
import { FORMAT_QUALITY } from '@ratamestari/rules'
import {
  alternation,
  convexHullArea,
  directionChanges,
  firstLegTowardsFinish,
  legLengthDistribution,
  reversals,
  ring,
  routeDoglegs,
  signedTurns,
  spread,
} from '../src/course-metrics'

const course = (...points: [number, number][]): LocalPoint[] =>
  points.map(([x, y]) => localPoint(x, y))

const square = course([0, 0], [1000, 0], [1000, 1000], [0, 1000], [0, 10])
const zigzag = course([0, 0], [400, 300], [800, 0], [1200, 300], [1600, 0], [2000, 300])

describe('course metrics', () => {
  it('measures turns at the controls, left positive', () => {
    expect(signedTurns(square).map(Math.round)).toEqual([90, 90, 90])
  })

  it('finds a reversal and weighs it by the shorter leg', () => {
    const shortBack = reversals(course([0, 0], [1000, 0], [900, 5], [900, 500]))
    const longBack = reversals(course([0, 0], [1000, 0], [0, 50], [0, 500]))
    expect(shortBack.value).toBeGreaterThan(0)
    expect(longBack.value).toBeGreaterThan(shortBack.value * 5)
    expect(longBack.note).toBe('turns back at control 1')
    expect(reversals(square).value).toBe(0)
  })

  it('calls a course that always turns the same way a ring', () => {
    expect(ring(square).value).toBeCloseTo(1)
    expect(ring(zigzag).value).toBeLessThan(0.3)
  })

  it('compares leg lengths with the target distribution', () => {
    const middleTarget = FORMAT_QUALITY.middle.legLengths
    const shortLegs = course([0, 0], [200, 0], [200, 200], [0, 200], [0, 400], [200, 400])
    const longLegs = course([0, 0], [1500, 0], [1500, 1500], [0, 1500])
    expect(legLengthDistribution(shortLegs, middleTarget).value).toBeLessThan(
      legLengthDistribution(longLegs, middleTarget).value,
    )
    expect(legLengthDistribution(shortLegs, middleTarget).note).toBe('100% of legs are 150–300 m')
  })

  it('finds runs of legs of similar length', () => {
    const monotonous = alternation(zigzag)
    expect(monotonous.value).toBeGreaterThan(0.5)
    expect(monotonous.note).toBe('similar lengths in legs 1–5')
    const varied = course([0, 0], [100, 0], [100, 900], [400, 900], [400, 2000])
    expect(alternation(varied).value).toBe(0)
  })

  it('compares the share of real direction changes with the target', () => {
    expect(directionChanges(square, 0.75).value).toBe(0)
    const doubledBack = course([0, 0], [500, 0], [0, 40], [500, 80])
    expect(directionChanges(doubledBack, 0.75).value).toBe(0.75)
    expect(directionChanges(course([0, 0], [500, 0], [1000, 50], [1500, 0]), 0.75).value).toBe(0.75)
  })

  it('notices a first leg heading straight for the finish', () => {
    expect(firstLegTowardsFinish(course([0, 0], [300, 10], [600, 600], [900, 0])).value).toBe(1)
    expect(firstLegTowardsFinish(square).value).toBe(0)
  })

  it('measures how much of the usable terrain the course reaches', () => {
    expect(convexHullArea(square)).toBeCloseTo(1_000_000, -3)
    expect(spread(square, 2_000_000, 0.5).value).toBe(0)
    expect(spread(square, 8_000_000, 0.5).value).toBeCloseTo(0.75, 1)
  })

  it('finds a dogleg where the next route runs back along the incoming one', () => {
    const along = course([0, 0], [100, 0], [200, 0], [300, 0])
    const back = course([300, 0], [200, 5], [150, 5], [100, 300])
    const away = course([300, 0], [300, 200], [300, 400])
    expect(routeDoglegs([along, back]).value).toBeGreaterThan(0.5)
    expect(routeDoglegs([along, back]).note).toMatch(/^routes double back at control 1/)
    expect(routeDoglegs([along, away]).value).toBe(0)
  })
})
