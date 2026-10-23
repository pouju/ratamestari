import { describe, expect, it } from 'vitest'
import { localPoint } from '@ratamestari/core'
import { ROUTE_CHOICE } from '@ratamestari/rules'
import { evaluateLeg } from '../src/leg'
import { buildTerrain } from '../src/terrain'
import { feature, line, rectangle, SQUARE_KILOMETRE } from './fixtures'

const south = localPoint(500, 100)
const north = localPoint(500, 900)

describe('evaluateLeg', () => {
  it('finds no route choice in uniform forest', () => {
    const leg = evaluateLeg(buildTerrain([], SQUARE_KILOMETRE), south, north)!
    expect(leg.hasRouteChoice).toBe(false)
    expect(leg.straightMeters).toBeCloseTo(800)
    expect(leg.lengthRatio).toBeLessThan(1.05)
    expect(leg.maxDeviationMeters).toBeLessThan(10)
  })

  it('measures the bearing clockwise from map north', () => {
    const terrain = buildTerrain([], SQUARE_KILOMETRE)
    expect(evaluateLeg(terrain, south, north)!.bearingDegrees).toBeCloseTo(0)
    expect(
      evaluateLeg(terrain, localPoint(100, 500), localPoint(900, 500))!.bearingDegrees,
    ).toBeCloseTo(90)
    expect(evaluateLeg(terrain, north, south)!.bearingDegrees).toBeCloseTo(180)
  })

  it('finds a route choice around both sides of a lake in the middle', () => {
    const terrain = buildTerrain([feature('301', rectangle(300, 350, 700, 650))], SQUARE_KILOMETRE)
    const leg = evaluateLeg(terrain, south, north)!
    expect(leg.hasRouteChoice).toBe(true)
    const sideOf = (x: number) => Math.sign(x - 500)
    const fastestSide = sideOf(leg.fastest.points[Math.floor(leg.fastest.points.length / 2)]![0])
    const alternative = leg.alternatives[0]!
    const alternativeSide = sideOf(
      alternative.points[Math.floor(alternative.points.length / 2)]![0],
    )
    expect(alternativeSide).toBe(-fastestSide)
    expect(alternative.timeSeconds).toBeLessThanOrEqual(
      leg.fastest.timeSeconds * (1 + ROUTE_CHOICE.maxExtraTimeShare),
    )
  })

  it('finds no route choice when one way around is clearly longer', () => {
    const terrain = buildTerrain([feature('301', rectangle(200, 350, 950, 650))], SQUARE_KILOMETRE)
    const leg = evaluateLeg(terrain, south, north)!
    expect(leg.hasRouteChoice).toBe(false)
    expect(leg.maxDeviationMeters).toBeGreaterThan(250)
  })

  it('estimates height change from contour crossings', () => {
    const contours = [300, 500, 700].map(y => feature('101', line([0, y], [1000, y])))
    const leg = evaluateLeg(buildTerrain(contours, SQUARE_KILOMETRE), south, north)!
    expect(leg.contourCrossings).toBe(3)
    expect(leg.heightChangeMeters).toBe(15)
  })

  it('uses the given contour interval', () => {
    const contours = [feature('101', line([0, 500], [1000, 500]))]
    const terrain = buildTerrain(contours, SQUARE_KILOMETRE, { contourIntervalMeters: 2.5 })
    expect(evaluateLeg(terrain, south, north)!.heightChangeMeters).toBe(2.5)
  })

  it('returns null when there is no route', () => {
    const terrain = buildTerrain([feature('521', rectangle(450, 850, 550, 950))], SQUARE_KILOMETRE)
    expect(evaluateLeg(terrain, south, north)).toBeNull()
  })
})
