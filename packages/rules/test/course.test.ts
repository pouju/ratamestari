import { describe, expect, it } from 'vitest'
import {
  ACUTE_ANGLE,
  acuteAngleRuleSchema,
  CLIMB,
  climbRuleSchema,
  CONTROL_CODES,
  controlCodeRuleSchema,
  controlSpacingForScale,
  controlSpacingRuleSchema,
  FOREST_CONTROL_SPACING,
  isAllowedControlCode,
  SPRINT_CONTROL_SPACING,
} from '../src/course'

describe('course rules', () => {
  it('match their schemas', () => {
    expect(() => controlSpacingRuleSchema.parse(FOREST_CONTROL_SPACING)).not.toThrow()
    expect(() => controlSpacingRuleSchema.parse(SPRINT_CONTROL_SPACING)).not.toThrow()
    expect(() => controlCodeRuleSchema.parse(CONTROL_CODES)).not.toThrow()
    expect(() => acuteAngleRuleSchema.parse(ACUTE_ANGLE)).not.toThrow()
    expect(() => climbRuleSchema.parse(CLIMB)).not.toThrow()
  })
})

describe('controlSpacingForScale', () => {
  it('uses the forest rule for 1:15 000, 1:10 000 and 1:7 500', () => {
    for (const scale of [15000, 10000, 7500]) {
      expect(controlSpacingForScale(scale)).toBe(FOREST_CONTROL_SPACING)
    }
  })

  it('uses the sprint rule for 1:5 000 and larger scales', () => {
    for (const scale of [5000, 4000, 3000]) {
      expect(controlSpacingForScale(scale)).toBe(SPRINT_CONTROL_SPACING)
    }
  })
})

describe('isAllowedControlCode', () => {
  it('allows codes from 31 to 599', () => {
    expect(isAllowedControlCode(31)).toBe(true)
    expect(isAllowedControlCode(599)).toBe(true)
    expect(isAllowedControlCode(30)).toBe(false)
    expect(isAllowedControlCode(600)).toBe(false)
  })

  it('rejects the codes excluded by Lajisäännöt 11.46', () => {
    for (const code of [66, 68, 86, 89, 98, 99, 161, 191]) {
      expect(isAllowedControlCode(code)).toBe(false)
    }
  })

  it('rejects non-integers', () => {
    expect(isAllowedControlCode(45.5)).toBe(false)
  })
})
