import { describe, expect, it } from 'vitest'
import { seededRandom } from '../src/random'

describe('seededRandom', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = seededRandom(42)
    const b = seededRandom(42)
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(
      Array.from({ length: 5 }, () => b.next()),
    )
  })

  it('gives a different sequence for a different seed', () => {
    expect(seededRandom(1).next()).not.toBe(seededRandom(2).next())
  })

  it('stays within [0, 1)', () => {
    const random = seededRandom(7)
    for (let i = 0; i < 1000; i++) {
      const value = random.next()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})
