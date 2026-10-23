import { describe, expect, it } from 'vitest'
import type { LocalPoint, MapFeature } from '@ratamestari/core'
import { isomSymbolRule } from '@ratamestari/rules'
import { loadOcadMap } from '../src/load'
import { localMapExists, readLocalMap } from './local-map'

const pointsOf = ({ geometry }: MapFeature): readonly LocalPoint[] => {
  switch (geometry.type) {
    case 'Point':
      return [geometry.coordinates]
    case 'LineString':
      return geometry.coordinates
    case 'Polygon':
      return geometry.coordinates.flat()
  }
}

const movementKindOf = (feature: MapFeature) =>
  feature.isomCode === null ? undefined : isomSymbolRule(feature.isomCode)?.movement.kind

describe.skipIf(!localMapExists)('OcadMap.features with git-ignored maps/example.ocd', () => {
  const bytes = localMapExists ? readLocalMap() : new Uint8Array()

  it('reads every object as a feature', async () => {
    const map = await loadOcadMap(bytes)
    expect(map.features()).toHaveLength(map.objectCount)
  })

  it('places all features inside the map extent', async () => {
    const map = await loadOcadMap(bytes)
    const [minX, minY, maxX, maxY] = map.info.extent
    const toleranceMeters = 1
    const outside = map
      .features()
      .flatMap(pointsOf)
      .filter(
        ([x, y]) =>
          x < minX - toleranceMeters ||
          x > maxX + toleranceMeters ||
          y < minY - toleranceMeters ||
          y > maxY + toleranceMeters,
      )
    expect(outside).toEqual([])
  })

  it('gives terrain features the ISOM codes the rules know', async () => {
    const map = await loadOcadMap(bytes)
    const kinds = new Set(map.features().map(movementKindOf))
    expect(kinds).toContain('impassable')
    expect(kinds).toContain('forbidden')
    expect(kinds).toContain('runnability')
    expect(map.features().find(f => f.symbolNumber === 520004)?.isomCode).toBe('520')
  })

  it('applies per-map ISOM code overrides', async () => {
    const forbiddenRailwayYard = 509001
    const map = await loadOcadMap(bytes, {
      isomCodeOverrides: new Map([[forbiddenRailwayYard, '520']]),
    })
    const yards = map.features().filter(f => f.symbolNumber === forbiddenRailwayYard)
    expect(yards.length).toBeGreaterThan(0)
    for (const yard of yards) expect(yard.isomCode).toBe('520')
  })

  it('reads features once and reuses them', async () => {
    const map = await loadOcadMap(bytes)
    expect(map.features()).toBe(map.features())
  })
})
