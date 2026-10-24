import { describe, expect, it } from 'vitest'
import { isomEffect } from '../src/map-symbols'

describe('isomEffect', () => {
  it('says how a symbol affects running and control sites', () => {
    expect(isomEffect('204')).toBe('no effect on running, control site')
    expect(isomEffect('520')).toMatch(/^forbidden to enter/)
    expect(isomEffect('408')).toMatch(/^walk \(runnability 4\)/)
  })

  it('describes ignored and unknown symbols', () => {
    expect(isomEffect(null)).toBe('ignored')
    expect(isomEffect('999')).toBe('unknown ISOM symbol')
  })
})
