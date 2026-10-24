import { describe, expect, it } from 'vitest'
import { localPoint } from '@ratamestari/core'
import { FORMAT_QUALITY } from '@ratamestari/rules'
import type { ControlSiteCandidate } from '../src/control-sites'
import { seededRandom } from '../src/random'
import { planWaypoints } from '../src/waypoints'

const site = (x: number, y: number): ControlSiteCandidate => ({
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
})

const pool: ControlSiteCandidate[] = []
for (let x = 0; x <= 4000; x += 100) for (let y = 0; y <= 4000; y += 100) pool.push(site(x, y))
const finish = localPoint(2000, 0)
const quality = Float32Array.from(pool, s => (s.position[1] > 1000 ? 1 : 0.2))
const profile = FORMAT_QUALITY.long

describe('planWaypoints', () => {
  const zones = planWaypoints(pool, quality, finish, profile, seededRandom(1))

  it('picks zones in good terrain, apart from each other and from the finish', () => {
    expect(zones.length).toBeGreaterThanOrEqual(profile.waypoints.count[0])
    expect(zones.length).toBeLessThanOrEqual(profile.waypoints.count[1])
    for (const [i, zone] of zones.entries()) {
      expect(zone[1]).toBeGreaterThan(1000)
      for (const other of zones.slice(i + 1)) {
        expect(Math.hypot(zone[0] - other[0], zone[1] - other[1])).toBeGreaterThanOrEqual(
          profile.waypoints.minSeparationMetres,
        )
      }
    }
  })

  it('orders the zones into a short tour from the finish and back', () => {
    const tourLength = (order: typeof zones) =>
      [finish, ...order, finish].reduce(
        (sum, point, i, tour) =>
          i === 0 ? 0 : sum + Math.hypot(point[0] - tour[i - 1]![0], point[1] - tour[i - 1]![1]),
        0,
      )
    const reversed = [...zones].reverse()
    expect(tourLength(zones)).toBeLessThanOrEqual(tourLength(reversed) + 1e-6)
  })

  it('gives the same zones for the same seed', () => {
    expect(planWaypoints(pool, quality, finish, profile, seededRandom(1))).toEqual(zones)
  })
})
