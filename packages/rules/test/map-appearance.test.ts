import { describe, expect, it } from 'vitest'
import { isomSymbolRule, MAP_APPEARANCES, mapAppearanceSchema } from '../src'

describe('MAP_APPEARANCES', () => {
  it('matches its schema and only names ISOM symbols the rules know', () => {
    for (const entry of MAP_APPEARANCES) {
      expect(() => mapAppearanceSchema.parse(entry)).not.toThrow()
      expect(isomSymbolRule(entry.code), entry.code).toBeDefined()
    }
  })

  it('cites the symbol definition for every appearance', () => {
    for (const { code, sources } of MAP_APPEARANCES) {
      expect(sources.map(source => source.section)).toContain(`sym. ${code}`)
    }
  })
})
