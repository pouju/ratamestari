import { describe, expect, it } from 'vitest'
import { localPoint, type LocalPoint } from '@ratamestari/core'
import { buildContourIndex, countContourCrossings } from '../src/contours'
import { feature, line } from './fixtures'

const CELL_SIZE_METERS = 5

const contoursAt = (...ys: number[]) => ys.map(y => feature('101', line([0, y], [1000, y])))

const route = (...points: [number, number][]): LocalPoint[] =>
  points.map(([x, y]) => localPoint(x, y))

describe('countContourCrossings', () => {
  it('counts each contour crossed', () => {
    const index = buildContourIndex(contoursAt(200, 400, 600))
    expect(countContourCrossings(index, route([500, 100], [500, 700]), CELL_SIZE_METERS)).toBe(3)
  })

  it('counts index contours but not form lines', () => {
    const index = buildContourIndex([
      feature('102', line([0, 200], [1000, 200])),
      feature('103', line([0, 400], [1000, 400])),
    ])
    expect(countContourCrossings(index, route([500, 100], [500, 700]), CELL_SIZE_METERS)).toBe(1)
  })

  it('counts a contour crossed twice when the route goes over and back', () => {
    const index = buildContourIndex(contoursAt(400))
    expect(
      countContourCrossings(index, route([100, 300], [300, 500], [500, 300]), CELL_SIZE_METERS),
    ).toBe(2)
  })

  it('ignores grid zigzag along a contour', () => {
    const index = buildContourIndex(contoursAt(400))
    const zigzag = route(
      [100, 399],
      [110, 401],
      [120, 399],
      [130, 401],
      [140, 399],
      [150, 401],
      [160, 399],
    )
    expect(countContourCrossings(index, zigzag, CELL_SIZE_METERS)).toBe(0)
  })

  it('ignores slope ticks drawn as short lines', () => {
    const index = buildContourIndex([feature('101', line([495, 400], [505, 400]))])
    expect(countContourCrossings(index, route([500, 100], [500, 700]), CELL_SIZE_METERS)).toBe(0)
  })

  it('finds crossings across bucket boundaries on long segments', () => {
    const index = buildContourIndex(contoursAt(1, 499, 999))
    expect(countContourCrossings(index, route([0, 0], [1000, 1000]), CELL_SIZE_METERS)).toBe(3)
  })
})
