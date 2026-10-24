import { describe, expect, it } from 'vitest'
import { formatOcadSymbolNumber, isomCodeForOcadSymbol } from '../src/isom-code'

describe('isomCodeForOcadSymbol', () => {
  it('uses the base number for plain symbols and mapper variants', () => {
    expect(isomCodeForOcadSymbol(406000)).toBe('406')
    expect(isomCodeForOcadSymbol(410003)).toBe('410')
    expect(isomCodeForOcadSymbol(520004)).toBe('520')
    expect(isomCodeForOcadSymbol(508010)).toBe('508')
  })

  it('reads ISOM decimal codes stored as hundreds', () => {
    expect(isomCodeForOcadSymbol(513100)).toBe('513.1')
    expect(isomCodeForOcadSymbol(513200)).toBe('513.2')
    expect(isomCodeForOcadSymbol(203100)).toBe('203.1')
  })

  it('maps split symbols without a decimal to a default', () => {
    expect(isomCodeForOcadSymbol(105000)).toBe('105.1')
    expect(isomCodeForOcadSymbol(105001)).toBe('105.1')
    expect(isomCodeForOcadSymbol(513000)).toBe('513.1')
  })

  it('treats an undivided pit as a dangerous pit, so no control is placed there', () => {
    expect(isomCodeForOcadSymbol(203000)).toBe('203.2')
  })

  it('falls back to the base number when the decimal is not an ISOM code', () => {
    expect(isomCodeForOcadSymbol(404100)).toBe('404')
  })

  it('returns null for symbols outside ISOM', () => {
    expect(isomCodeForOcadSymbol(768003)).toBeNull()
    expect(isomCodeForOcadSymbol(901002)).toBeNull()
  })

  it('lets per-map overrides win', () => {
    const forbiddenRailwayYard = 509001
    const overrides = new Map([[forbiddenRailwayYard, '520']])
    expect(isomCodeForOcadSymbol(forbiddenRailwayYard, overrides)).toBe('520')
    expect(isomCodeForOcadSymbol(509000, overrides)).toBe('509')
  })
})

describe('formatOcadSymbolNumber', () => {
  it('writes symbol numbers as OCAD shows them', () => {
    expect(formatOcadSymbolNumber(502000)).toBe('502.0')
    expect(formatOcadSymbolNumber(105100)).toBe('105.1')
    expect(formatOcadSymbolNumber(509001)).toBe('509.001')
  })
})
