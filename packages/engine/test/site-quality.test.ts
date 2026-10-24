import { describe, expect, it } from 'vitest'
import { localPoint } from '@ratamestari/core'
import type { ControlSiteCandidate } from '../src/control-sites'
import { siteAreaQuality, siteAreaQualityOf } from '../src/site-quality'

const site = (
  x: number,
  y: number,
  overrides: Partial<ControlSiteCandidate> = {},
): ControlSiteCandidate => ({
  id: 0,
  position: localPoint(x, y),
  isomCode: '204',
  symbolNumber: 204000,
  placement: 'point',
  contourForm: null,
  distanceToLeadingFeatureMeters: 100,
  leadingFeatureDistance: 'far',
  inSlowTerrain: false,
  technicalDifficulty: 4,
  orientation: null,
  similarFeatureOffsets: [],
  flagSide: null,
  ...overrides,
})

const cluster = (cx: number, cy: number, count: number, overrides = {}) =>
  Array.from({ length: count }, (_, i) =>
    site(cx + (i % 5) * 20, cy + Math.floor(i / 5) * 20, overrides),
  )

describe('siteAreaQuality', () => {
  it('rates sites in dense technical terrain above lone sites', () => {
    const sites = [...cluster(100, 100, 20), site(1000, 1000)]
    const quality = siteAreaQuality(sites)
    expect(quality[0]).toBeGreaterThan(quality[20]! * 5)
  })

  it('values demanding sites more than easy ones', () => {
    const demanding = cluster(100, 100, 15)
    const easy = cluster(1000, 1000, 15, { technicalDifficulty: 1 })
    const quality = siteAreaQuality([...demanding, ...easy])
    expect(quality[0]).toBeGreaterThan(quality[15]!)
  })

  it('values contour detail', () => {
    const boulders = cluster(100, 100, 15)
    const knolls = cluster(1000, 1000, 15, { placement: 'contourKnoll', contourForm: 'knoll' })
    const quality = siteAreaQuality([...boulders, ...knolls])
    expect(quality[15]).toBeGreaterThan(quality[0]!)
  })

  it('halves the value of sites in slow terrain', () => {
    const sites = [...cluster(100, 100, 15), ...cluster(1000, 1000, 15, { inSlowTerrain: true })]
    const quality = siteAreaQuality(sites)
    expect(quality[15]).toBeCloseTo(quality[0]! / 2, 1)
  })

  it('scales to between 0 and 1', () => {
    const quality = siteAreaQuality([...cluster(100, 100, 20), ...cluster(900, 900, 8)])
    expect(Math.max(...quality)).toBeLessThanOrEqual(1)
    expect(Math.min(...quality)).toBeGreaterThan(0)
  })

  it('looks quality up by site even when ids are not positions in the list', () => {
    const filtered = [...cluster(100, 100, 20), site(1000, 1000)].map((s, i) => ({
      ...s,
      id: 500 + i * 7,
    }))
    const qualityOf = siteAreaQualityOf(filtered)
    const byPosition = siteAreaQuality(filtered)
    expect(qualityOf(filtered[0]!)).toBe(byPosition[0])
    expect(qualityOf(filtered[20]!)).toBe(byPosition[20])
    expect(Number.isNaN(qualityOf(filtered[20]!))).toBe(false)
  })
})
