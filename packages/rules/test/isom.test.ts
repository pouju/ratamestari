import { describe, expect, it } from 'vitest'
import { ISOM_SYMBOL_RULES, isomSymbolRule, isomSymbolRuleSchema } from '../src/isom'

describe('ISOM symbol rules', () => {
  it('match the schema', () => {
    for (const rule of ISOM_SYMBOL_RULES)
      expect(() => isomSymbolRuleSchema.parse(rule)).not.toThrow()
  })

  it('have unique codes', () => {
    const codes = ISOM_SYMBOL_RULES.map(rule => rule.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('cite the ISOM definition of their own symbol first', () => {
    for (const rule of ISOM_SYMBOL_RULES) {
      expect(rule.sources[0]).toEqual({ document: 'ISOM 2017-2', section: `sym. ${rule.code}` })
    }
  })

  it('classify vegetation by the ISOM runnability classes', () => {
    expect(isomSymbolRule('405')?.movement).toEqual({
      kind: 'runnability',
      runnabilityClass: 2,
      layer: 'cover',
    })
    expect(isomSymbolRule('406')?.movement).toEqual({
      kind: 'runnability',
      runnabilityClass: 3,
      layer: 'cover',
    })
    expect(isomSymbolRule('408')?.movement).toEqual({
      kind: 'runnability',
      runnabilityClass: 4,
      layer: 'cover',
    })
    expect(isomSymbolRule('410')?.movement).toEqual({
      kind: 'runnability',
      runnabilityClass: 5,
      layer: 'cover',
    })
  })

  it('combine vegetation cover with ground modifiers and paths', () => {
    const layerOf = (code: string) => {
      const movement = isomSymbolRule(code)?.movement
      return movement?.kind === 'runnability' ? movement.layer : undefined
    }
    expect(layerOf('406')).toBe('cover')
    expect(layerOf('210')).toBe('ground')
    expect(layerOf('308')).toBe('ground')
    expect(layerOf('505')).toBe('path')
  })

  it('treat barriers and out-of-bounds areas as blocking', () => {
    expect(isomSymbolRule('201')?.movement.kind).toBe('impassable')
    expect(isomSymbolRule('521')?.movement.kind).toBe('impassable')
    expect(isomSymbolRule('520')?.movement.kind).toBe('forbidden')
    expect(isomSymbolRule('709')?.movement.kind).toBe('forbidden')
  })

  it('keep controls off dangerous pits and out of cultivated land', () => {
    expect(isomSymbolRule('203.2')?.controlSite).toBe('no')
    expect(isomSymbolRule('412')?.controlSite).toBe('avoid')
  })

  it('return undefined for symbols ISOM does not define', () => {
    expect(isomSymbolRule('411')).toBeUndefined()
    expect(isomSymbolRule('714')).toBeUndefined()
  })
})
