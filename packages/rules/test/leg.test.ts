import { describe, expect, it } from 'vitest'
import { DEFAULT_CONTOUR_INTERVAL_METERS, ROUTE_CHOICE, routeChoiceRuleSchema } from '../src/leg'

describe('leg rules', () => {
  it('match their schemas', () => {
    expect(() => routeChoiceRuleSchema.parse(ROUTE_CHOICE)).not.toThrow()
  })

  it('count only nearly equal alternatives as route choice', () => {
    expect(ROUTE_CHOICE.maxExtraTimeShare).toBeGreaterThan(0)
    expect(ROUTE_CHOICE.maxExtraTimeShare).toBeLessThan(0.25)
  })

  it('use the ISOM standard contour interval', () => {
    expect(DEFAULT_CONTOUR_INTERVAL_METERS.value).toBe(5)
  })
})
