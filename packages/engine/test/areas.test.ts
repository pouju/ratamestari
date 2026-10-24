import { describe, expect, it } from 'vitest'
import { localExtent, type MapFeature } from '@ratamestari/core'
import { TECHNICAL_AREAS } from '@ratamestari/rules'
import { findTechnicalAreas } from '../src/areas'
import { findControlSites } from '../src/control-sites'
import { siteAreaQuality } from '../src/site-quality'
import { buildTerrain } from '../src/terrain'
import { feature, point } from './fixtures'

const PACE_SECONDS_PER_KM = 300
// Fixed here, so the tests check the clustering and not the values tuned on club maps.
const RULE = { ...TECHNICAL_AREAS.long, minQuality: 0.45 }

function boulderField(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  step: number,
): MapFeature[] {
  const boulders: MapFeature[] = []
  for (let x = minX; x <= maxX; x += step) {
    for (let y = minY; y <= maxY; y += step) boulders.push(feature('204', point(x, y)))
  }
  return boulders
}

function areasOn(features: MapFeature[], width: number, height: number) {
  const terrain = buildTerrain(features, localExtent(0, 0, width, height))
  const sites = findControlSites(features, terrain)
  const quality = siteAreaQuality(sites)
  const areas = findTechnicalAreas(sites, quality, RULE, terrain.grid, PACE_SECONDS_PER_KM)
  return { sites, areas }
}

describe('findTechnicalAreas', () => {
  it('finds one area per dense patch of control sites and leaves scattered sites out', () => {
    const features = [
      ...boulderField(200, 200, 700, 700, 40),
      ...boulderField(2200, 200, 2700, 700, 40),
      ...boulderField(1000, 100, 1900, 900, 450),
    ]
    const { sites, areas } = areasOn(features, 3000, 1000)
    expect(areas).toHaveLength(2)
    const xs = areas.map(area => area.sites.map(i => sites[i]!.position[0]))
    const [west, east] = [...xs].sort((a, b) => a[0]! - b[0]!)
    expect(Math.max(...west!)).toBeLessThan(800)
    expect(Math.min(...east!)).toBeGreaterThan(2100)
    for (const area of areas) {
      expect(area.capacitySeconds).toBeGreaterThan(0)
      expect(area.hull.length).toBeGreaterThanOrEqual(3)
      expect(area.areaSquareMetres).toBeGreaterThan(200_000)
    }
  })

  it('splits an area larger than the format allows', () => {
    const { areas } = areasOn(boulderField(100, 100, 1900, 1000, 40), 2000, 1100)
    expect(areas.length).toBeGreaterThanOrEqual(2)
    for (const area of areas) {
      expect(area.areaSquareMetres).toBeLessThanOrEqual(RULE.maxAreaSquareMetres)
    }
  })

  it('finds no area in terrain without dense control sites', () => {
    const { areas } = areasOn(boulderField(100, 100, 1900, 900, 450), 2000, 1000)
    expect(areas).toEqual([])
  })
})
