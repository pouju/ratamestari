import { describe, expect, it } from 'vitest'
import { RUNNABILITY, runnabilityRuleSchema, type RunnabilityClass } from '../src/runnability'

const classes: RunnabilityClass[] = [1, 2, 3, 4, 5]

describe('runnability classes', () => {
  it('match the schema', () => {
    for (const c of classes) expect(() => runnabilityRuleSchema.parse(RUNNABILITY[c])).not.toThrow()
  })

  it('use a speed factor inside the ISOM speed range of the class', () => {
    for (const c of classes) {
      const rule = RUNNABILITY[c]
      expect(rule.speedFactor).toBeGreaterThanOrEqual(rule.minSpeedFraction)
      if (rule.maxSpeedFraction !== null) {
        expect(rule.speedFactor).toBeLessThanOrEqual(rule.maxSpeedFraction)
      }
    }
  })

  it('get slower from class 1 to class 5', () => {
    const factors = classes.map(c => RUNNABILITY[c].speedFactor)
    expect(factors).toEqual([...factors].sort((a, b) => b - a))
  })
})
