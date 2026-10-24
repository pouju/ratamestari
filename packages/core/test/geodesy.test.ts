import { describe, expect, it } from 'vitest'
import { projectedPoint } from '../src/geometry'
import { projectedToGeographic } from '../src/geodesy'

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
