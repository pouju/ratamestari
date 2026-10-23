import { describe, expect, it } from 'vitest'
import type { MapFeature } from '@ratamestari/core'
import { findControlSites } from '../src/control-sites'
import { buildCostGrid } from '../src/cost-grid'
import { feature, line, point, polygon, rectangle, SQUARE_KILOMETRE } from './fixtures'

const sitesOf = (features: MapFeature[]) =>
  findControlSites(features, buildCostGrid(features, SQUARE_KILOMETRE))

const pathAlongY500 = feature('505', line([0, 500], [1000, 500]))

describe('findControlSites', () => {
  it('places a site on a boulder', () => {
    const [site, ...rest] = sitesOf([feature('204', point(300, 300))])
    expect(rest).toEqual([])
    expect(site!.position).toEqual([300, 300])
    expect(site!.placement).toBe('point')
    expect(site!.isomCode).toBe('204')
  })

  it('makes sites harder the further they are from a leading feature', () => {
    const sites = sitesOf([
      pathAlongY500,
      feature('204', point(300, 510)),
      feature('204', point(300, 550)),
      feature('204', point(300, 800)),
    ])
    const byY = (y: number) => sites.find(s => s.position[1] === y)!
    expect(byY(510).leadingFeatureDistance).toBe('on')
    expect(byY(550).leadingFeatureDistance).toBe('near')
    expect(byY(800).leadingFeatureDistance).toBe('far')
    expect(byY(510).technicalDifficulty).toBeLessThan(byY(550).technicalDifficulty)
    expect(byY(550).technicalDifficulty).toBeLessThan(byY(800).technicalDifficulty)
  })

  it('never places a site on a dangerous pit', () => {
    expect(sitesOf([feature('203.2', point(300, 300))])).toEqual([])
  })

  it('leaves out sites inside out-of-bounds areas and cultivated land', () => {
    expect(
      sitesOf([feature('520', rectangle(200, 200, 400, 400)), feature('204', point(300, 300))]),
    ).toEqual([])
    expect(
      sitesOf([feature('412', rectangle(200, 200, 400, 400)), feature('204', point(300, 300))]),
    ).toEqual([])
  })

  it('places sites at the corners of open land, which are on a leading feature', () => {
    const sites = sitesOf([feature('401', rectangle(200, 200, 400, 300))])
    expect(sites.map(s => s.position).sort()).toEqual(
      [
        [200, 200],
        [200, 300],
        [400, 200],
        [400, 300],
      ].sort(),
    )
    expect(sites.every(s => s.placement === 'areaCorner')).toBe(true)
    expect(sites.every(s => s.technicalDifficulty === 1)).toBe(true)
  })

  it('does not treat a curved edge as corners', () => {
    const circle = Array.from({ length: 73 }, (_, i): [number, number] => {
      const angle = (i * 5 * Math.PI) / 180
      return [500 + 100 * Math.cos(angle), 500 + 100 * Math.sin(angle)]
    })
    expect(sitesOf([feature('401', polygon(...circle))])).toEqual([])
  })

  it('places sites at building corners even though buildings block movement', () => {
    expect(sitesOf([feature('521', rectangle(300, 300, 320, 330))])).toHaveLength(4)
  })

  it('places sites at both ends of a cliff', () => {
    const sites = sitesOf([feature('202', line([300, 300], [340, 310]))])
    expect(sites.map(s => s.position)).toEqual([
      [300, 300],
      [340, 310],
    ])
    expect(sites.every(s => s.placement === 'lineEnd')).toBe(true)
  })

  it('keeps one site where features are closer than 10 m', () => {
    expect(
      sitesOf([feature('204', point(300, 300)), feature('204', point(305, 300))]),
    ).toHaveLength(1)
  })

  it('flags sites in slow vegetation', () => {
    const [site] = sitesOf([
      feature('408', rectangle(200, 200, 400, 400)),
      feature('204', point(300, 300)),
    ]).filter(s => s.placement === 'point')
    expect(site!.inSlowTerrain).toBe(true)
  })
})
