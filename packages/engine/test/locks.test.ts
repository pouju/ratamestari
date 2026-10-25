import { describe, expect, it } from 'vitest'
import { keepsLocks } from '../src/locks'

describe('keepsLocks', () => {
  const locked = { start: null, controls: [7, 9], keptLegs: [false, false, false] }

  it('needs every kept control, in order', () => {
    expect(keepsLocks(locked, [1, 7, 2, 9, 3])).toBe(true)
    expect(keepsLocks(locked, [1, 9, 2, 7])).toBe(false)
    expect(keepsLocks(locked, [1, 7, 2])).toBe(false)
  })

  it('keeps nothing between the ends of a kept leg', () => {
    const keptLeg = { ...locked, keptLegs: [false, true, false] }
    expect(keepsLocks(keptLeg, [1, 7, 9, 3])).toBe(true)
    expect(keepsLocks(keptLeg, [1, 7, 2, 9, 3])).toBe(false)
  })

  it('keeps the legs from the start and into the finish', () => {
    const ends = { start: 4, controls: [7, 9], keptLegs: [true, false, true] }
    expect(keepsLocks(ends, [7, 2, 9])).toBe(true)
    expect(keepsLocks(ends, [1, 7, 2, 9])).toBe(false)
    expect(keepsLocks(ends, [7, 2, 9, 3])).toBe(false)
  })

  it('ignores a kept first leg when the start is not kept', () => {
    expect(keepsLocks({ ...locked, keptLegs: [true, false, false] }, [1, 7, 9])).toBe(true)
  })
})
