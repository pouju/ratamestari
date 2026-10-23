import { describe, expect, it } from 'vitest'
import {
  CONTROL_SITE_DIFFICULTY,
  controlSiteDifficultyRuleSchema,
  LEADING_FEATURES,
  leadingFeatureRuleSchema,
} from '../src/control-site'
import { isomSymbolRule } from '../src/isom'

describe('control site rules', () => {
  it('match their schemas', () => {
    expect(() => leadingFeatureRuleSchema.parse(LEADING_FEATURES)).not.toThrow()
    expect(() => controlSiteDifficultyRuleSchema.parse(CONTROL_SITE_DIFFICULTY)).not.toThrow()
  })

  it('name only symbols that ISOM defines', () => {
    for (const code of [
      ...LEADING_FEATURES.lineIsomCodes,
      ...LEADING_FEATURES.areaOutlineIsomCodes,
    ]) {
      expect(isomSymbolRule(code), code).toBeDefined()
    }
  })

  it('order the distance bands', () => {
    expect(CONTROL_SITE_DIFFICULTY.onLeadingFeatureMaxMeters).toBeLessThan(
      CONTROL_SITE_DIFFICULTY.nearLeadingFeatureMaxMeters,
    )
  })
})
