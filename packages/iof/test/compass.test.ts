import { describe, expect, it } from 'vitest'
import { compassPointOf } from '../src/compass'

describe('compassPointOf', () => {
  it('rounds an angle from east, counter-clockwise, to the nearest compass point', () => {
    expect(compassPointOf(Math.PI / 2)).toBe('north')
    expect(compassPointOf(0)).toBe('east')
    expect(compassPointOf(Math.PI)).toBe('west')
    expect(compassPointOf(-Math.PI / 2)).toBe('south')
    expect(compassPointOf((-3 * Math.PI) / 4)).toBe('southWest')
    expect(compassPointOf(Math.PI / 4 + 0.3)).toBe('northEast')
  })
})
