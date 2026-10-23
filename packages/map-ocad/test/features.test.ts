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

describe.skipIf(!localMapExists)('OcadMap.features with a local map from git-ignored maps/', () => {
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

  it('gives most features an ISOM code the rules know', async () => {
    const map = await loadOcadMap(bytes)
    const features = map.features()
    const known = features.filter(f => movementKindOf(f) !== undefined)
    expect(known.length / features.length).toBeGreaterThan(0.5)
    expect(new Set(known.map(movementKindOf))).toContain('runnability')
  })

  it('applies per-map ISOM code overrides', async () => {
    const overriddenSymbol = (await loadOcadMap(bytes)).features()[0]!.symbolNumber
    const map = await loadOcadMap(bytes, {
      isomCodeOverrides: new Map([[overriddenSymbol, '520']]),
    })
    const overridden = map.features().filter(f => f.symbolNumber === overriddenSymbol)
    expect(overridden.length).toBeGreaterThan(0)
    for (const feature of overridden) expect(feature.isomCode).toBe('520')
  })

  it('reads point symbol rotation in degrees', async () => {
    const map = await loadOcadMap(bytes)
    const rotations = map.features().map(f => f.symbolRotationDegreesCounterClockwise)
    expect(rotations.every(r => r >= 0 && r < 360)).toBe(true)
    expect(rotations.some(r => r !== 0)).toBe(true)
  })

  it('reads features once and reuses them', async () => {
    const map = await loadOcadMap(bytes)
    expect(map.features()).toBe(map.features())
  })
})
