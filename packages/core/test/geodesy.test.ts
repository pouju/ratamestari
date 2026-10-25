import { describe, expect, it } from 'vitest'
import { projectedPoint } from '../src/geometry'
import { geographicToProjected, projectedSystemFor, projectedToGeographic } from '../src/geodesy'

describe('projectedToGeographic', () => {
  it('puts the ETRS-TM35FIN central meridian at 27° E', () => {
    const point = projectedToGeographic(projectedPoint(500000, 6651411.19), 3067)!
    expect(point.longitudeDegrees).toBeCloseTo(27, 8)
    expect(point.latitudeDegrees).toBeCloseTo(60, 6)
  })

  it('matches the known UTM easting of the zone 31 edge on the equator', () => {
    const point = projectedToGeographic(projectedPoint(166021.4431, 0), 32631)!
    expect(point.longitudeDegrees).toBeCloseTo(0, 6)
    expect(point.latitudeDegrees).toBeCloseTo(0, 6)
  })

  it('handles southern UTM zones', () => {
    const point = projectedToGeographic(projectedPoint(500000, 10000000), 32735)!
    expect(point.latitudeDegrees).toBeCloseTo(0, 8)
    expect(point.longitudeDegrees).toBeCloseTo(27, 8)
  })

  it('returns null for coordinate systems it does not know', () => {
    expect(projectedToGeographic(projectedPoint(0, 0), 2393)).toBeNull()
  })
})

describe('geographicToProjected', () => {
  it('inverts projectedToGeographic to well under a millimetre', () => {
    for (const [epsg, point] of [
      [3067, projectedPoint(500000, 6700000)],
      [3067, projectedPoint(610000, 7400000)],
      [32633, projectedPoint(420000, 5300000)],
      [32733, projectedPoint(560000, 6200000)],
    ] as const) {
      const geographic = projectedToGeographic(point, epsg)!
      const back = geographicToProjected(geographic, epsg)!
      expect(Math.hypot(back[0] - point[0], back[1] - point[1])).toBeLessThan(0.001)
    }
  })

  it('picks ETRS-TM35FIN in Finland and the UTM zone elsewhere', () => {
    expect(projectedSystemFor({ longitudeDegrees: 25.5, latitudeDegrees: 61.5 })).toBe(3067)
    expect(projectedSystemFor({ longitudeDegrees: 15.2, latitudeDegrees: 59.3 })).toBe(32633)
    expect(projectedSystemFor({ longitudeDegrees: 18.4, latitudeDegrees: -33.9 })).toBe(32734)
  })
})
