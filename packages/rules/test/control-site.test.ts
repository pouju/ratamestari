import { describe, expect, it } from 'vitest'
import {
  CONTOUR_FEATURE_SITES,
  contourFeatureSiteRuleSchema,
  CONTROL_SITE_DIFFICULTY,
  controlSiteDifficultyRuleSchema,
  LEADING_FEATURES,
  leadingFeatureRuleSchema,
  LINE_FEATURE_SITES,
  lineFeatureSiteRuleSchema,
} from '../src/control-site'
import { isomSymbolRule } from '../src/isom'

describe('control site rules', () => {
  it('match their schemas', () => {
    expect(() => leadingFeatureRuleSchema.parse(LEADING_FEATURES)).not.toThrow()
    expect(() => controlSiteDifficultyRuleSchema.parse(CONTROL_SITE_DIFFICULTY)).not.toThrow()
    expect(() => lineFeatureSiteRuleSchema.parse(LINE_FEATURE_SITES)).not.toThrow()
    expect(() => contourFeatureSiteRuleSchema.parse(CONTOUR_FEATURE_SITES)).not.toThrow()
  })

  it('control line features along their length only where ISOM marks them as sites', () => {
    for (const code of LINE_FEATURE_SITES.controlledAlongLengthIsomCodes) {
      expect(isomSymbolRule(code)?.controlSite, code).toBe('yes')
    }
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
