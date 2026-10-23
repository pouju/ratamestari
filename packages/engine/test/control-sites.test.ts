import { describe, expect, it } from 'vitest'
import type { MapFeature } from '@ratamestari/core'
import { findControlSites } from '../src/control-sites'
import { buildTerrain } from '../src/terrain'
import { feature, line, point, polygon, rectangle, SQUARE_KILOMETRE } from './fixtures'

const sitesOf = (features: MapFeature[]) =>
  findControlSites(features, buildTerrain(features, SQUARE_KILOMETRE))

const squareRing = (cx: number, cy: number, halfWidth: number, isomCode = '101') =>
  feature(
    isomCode,
    line(
      [cx - halfWidth, cy - halfWidth],
      [cx + halfWidth, cy - halfWidth],
      [cx + halfWidth, cy + halfWidth],
      [cx - halfWidth, cy + halfWidth],
      [cx - halfWidth, cy - halfWidth],
    ),
  )

const seaInTheSouth = feature('301', rectangle(0, 0, 1000, 50))
const TICK_POINTS_NORTH = 0

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

  it('places sites at both ends and the centre of a cliff', () => {
    const sites = sitesOf([feature('202', line([300, 300], [340, 310]))])
    expect(sites.map(s => [s.placement, ...s.position])).toEqual([
      ['lineCentre', 320, 305],
      ['lineEnd', 300, 300],
      ['lineEnd', 340, 310],
    ])
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

  it('ignores corners of areas hidden under other areas', () => {
    const sites = sitesOf([
      feature('406', rectangle(150, 150, 450, 350)),
      feature('401', rectangle(200, 200, 400, 300)),
    ])
    expect(sites.every(s => s.isomCode === '406')).toBe(true)
    expect(sites).toHaveLength(4)
  })

  it('ignores seams where two pieces of the same area meet', () => {
    const sites = sitesOf([
      feature('406', rectangle(200, 200, 300, 300)),
      feature('406', rectangle(300, 200, 400, 300)),
    ])
    expect(sites.map(s => s.position[0]).sort((a, b) => a - b)).toEqual([200, 200, 400, 400])
  })

  it('places a site at the centre of a short cliff', () => {
    const sites = sitesOf([feature('202', line([300, 300], [312, 300]))])
    expect(sites).toHaveLength(1)
    expect(sites[0]!.placement).toBe('lineCentre')
    expect(sites[0]!.position).toEqual([306, 300])
  })

  it('places sites at the top of a small contour knoll', () => {
    const sites = sitesOf([squareRing(500, 500, 60), squareRing(500, 500, 20)])
    const knolls = sites.filter(s => s.placement === 'contourKnoll')
    expect(knolls).toHaveLength(1)
    expect(knolls[0]!.position).toEqual([500, 500])
    expect(knolls[0]!.contourForm).toBe('knoll')
  })

  it('recognises a depression from its slope tick', () => {
    const sites = sitesOf([
      squareRing(500, 500, 20),
      feature('101', point(500, 480), TICK_POINTS_NORTH),
    ])
    expect(sites.find(s => s.placement === 'contourKnoll')?.contourForm).toBe('depression')
  })

  it('places sites on knoll symbols but not on slope ticks', () => {
    const sites = sitesOf([
      feature('101', line([0, 700], [1000, 700])),
      feature('101', point(300, 700), TICK_POINTS_NORTH),
      feature('101', point(300, 300)),
    ])
    expect(sites.filter(s => s.placement === 'point').map(s => s.position)).toEqual([[300, 300]])
  })

  it('finds spurs and re-entrants from contour bends', () => {
    const contourWithBend = (apexY: number) =>
      feature(
        '101',
        line(
          [0, 300],
          [450, 300],
          [490, 300 + (apexY - 300) * 0.67],
          [500, apexY],
          [510, 300 + (apexY - 300) * 0.67],
          [550, 300],
          [1000, 300],
        ),
      )
    const formAt = (apexY: number) =>
      sitesOf([seaInTheSouth, contourWithBend(apexY)]).find(s => s.placement === 'contourBend')
    expect(formAt(255)?.contourForm).toBe('spur')
    expect(formAt(255)?.position).toEqual([500, 255])
    expect(formAt(345)?.contourForm).toBe('reEntrant')
  })
})
