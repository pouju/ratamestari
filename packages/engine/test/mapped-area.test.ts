import { describe, expect, it } from 'vitest'
import { localExtent, localPoint, type MapFeature } from '@ratamestari/core'
import { buildCostGrid } from '../src/cost-grid'
import { mappedAreaMask } from '../src/mapped-area'
import { cellIndexOf } from '../src/raster'
import { feature, line, point, rectangle } from './fixtures'

const extent = localExtent(0, 0, 2000, 1000)

const contoursEvery = (spacing: number, fromX: number, toX: number): MapFeature[] => {
  const contours: MapFeature[] = []
  for (let y = 50; y < 1000; y += spacing) contours.push(feature('101', line([fromX, y], [toX, y])))
  return contours
}

const maskOf = (features: MapFeature[]) => {
  const grid = buildCostGrid([], extent)
  const mask = mappedAreaMask(features, grid)
  return (x: number, y: number) => mask[cellIndexOf(grid, localPoint(x, y))!] === 1
}

describe('mappedAreaMask', () => {
  it('covers the area drawn with contours, including flat forest between them', () => {
    const isMapped = maskOf(contoursEvery(150, 100, 1400))
    expect(isMapped(700, 500)).toBe(true)
    expect(isMapped(700, 575)).toBe(true)
  })

  it('leaves out a margin with a logo and texts far from the terrain', () => {
    const logo = [feature('530', point(1800, 500)), feature('204', point(1820, 520))]
    const isMapped = maskOf([...contoursEvery(150, 100, 1400), ...logo])
    expect(isMapped(1800, 500)).toBe(false)
    expect(isMapped(1700, 500)).toBe(false)
  })

  it('counts vegetation and open land areas as mapped terrain', () => {
    const isMapped = maskOf([feature('401', rectangle(300, 300, 900, 700))])
    expect(isMapped(600, 500)).toBe(true)
    expect(isMapped(1500, 500)).toBe(false)
  })

  it('keeps unmapped sea outside', () => {
    const isMapped = maskOf(contoursEvery(100, 100, 1000))
    expect(isMapped(1600, 500)).toBe(false)
  })
})
