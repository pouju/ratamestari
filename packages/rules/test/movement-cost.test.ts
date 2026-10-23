import { describe, expect, it } from 'vitest'
import {
  citedNumberSchema,
  CROSSING_SLOWS_SPEED_FACTOR,
  FORBIDDEN_ALONG_SPEED_FACTOR,
  REFERENCE_PACE_SECONDS_PER_KM,
  UNMAPPED_TERRAIN,
  unmappedTerrainRuleSchema,
} from '../src/movement-cost'

describe('movement cost rules', () => {
  it('match their schemas', () => {
    for (const rule of [
      REFERENCE_PACE_SECONDS_PER_KM,
      CROSSING_SLOWS_SPEED_FACTOR,
      FORBIDDEN_ALONG_SPEED_FACTOR,
    ]) {
      expect(() => citedNumberSchema.parse(rule)).not.toThrow()
    }
    expect(() => unmappedTerrainRuleSchema.parse(UNMAPPED_TERRAIN)).not.toThrow()
  })

  it('slow movement without blocking it', () => {
    expect(CROSSING_SLOWS_SPEED_FACTOR.value).toBeLessThan(1)
    expect(FORBIDDEN_ALONG_SPEED_FACTOR.value).toBeLessThan(CROSSING_SLOWS_SPEED_FACTOR.value)
  })

  it('treat white areas as typical open forest', () => {
    expect(UNMAPPED_TERRAIN.runnabilityClass).toBe(2)
  })
})
