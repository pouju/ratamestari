import { describe, expect, it } from 'vitest'
import {
  DESCRIPTION_FEATURES,
  ISOM_DESCRIPTIONS,
  isomDescription,
  isomDescriptionSchema,
} from '../src/control-description'
import { ISOM_SYMBOL_RULES } from '../src/isom'

describe('ISOM_DESCRIPTIONS', () => {
  it('is valid against its schema', () => {
    for (const mapping of Object.values(ISOM_DESCRIPTIONS)) {
      expect(isomDescriptionSchema.parse(mapping)).toEqual(mapping)
    }
  })

  it('describes every ISOM symbol that can carry a control', () => {
    const missing = ISOM_SYMBOL_RULES.filter(rule =>
      ['yes', 'edge', 'weak', 'contourShape'].includes(rule.controlSite),
    ).filter(rule => !isomDescription(rule.code))
    expect(missing.map(rule => rule.code)).toEqual([])
  })

  it('cites the IOF reference of its feature', () => {
    const boulder = isomDescription('205')!
    expect(boulder.feature).toBe('boulder')
    expect(boulder.sources).toEqual([
      { document: 'IOF Control Descriptions 2024', section: DESCRIPTION_FEATURES.boulder.ref },
    ])
  })

  it('falls back to the base symbol number', () => {
    expect(isomDescription('513.9')?.feature).toBe('wall')
  })
})
