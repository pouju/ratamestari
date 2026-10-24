import { isomSymbolRule, type IsomCode } from '@ratamestari/rules'

const OCAD_SUBNUMBERS_PER_SYMBOL = 1000
const OCAD_SUBNUMBERS_PER_ISOM_DECIMAL = 100

const SPLIT_SYMBOL_DEFAULTS: ReadonlyMap<string, IsomCode> = new Map([
  ['105', '105.1'],
  ['203', '203.2'],
  ['513', '513.1'],
])

export type IsomCodeOverrides = ReadonlyMap<number, IsomCode | null>

export function isomCodeForOcadSymbol(
  ocadSymbolNumber: number,
  overrides: IsomCodeOverrides = new Map(),
): IsomCode | null {
  const override = overrides.get(ocadSymbolNumber)
  if (override !== undefined) return override

  const base = String(Math.floor(ocadSymbolNumber / OCAD_SUBNUMBERS_PER_SYMBOL))
  const subnumber = ocadSymbolNumber % OCAD_SUBNUMBERS_PER_SYMBOL
  const isIsomDecimal = subnumber > 0 && subnumber % OCAD_SUBNUMBERS_PER_ISOM_DECIMAL === 0
  if (isIsomDecimal) {
    const decimalCode = `${base}.${subnumber / OCAD_SUBNUMBERS_PER_ISOM_DECIMAL}`
    if (isomSymbolRule(decimalCode)) return decimalCode
  }

  if (isomSymbolRule(base)) return base
  return SPLIT_SYMBOL_DEFAULTS.get(base) ?? null
}

export function formatOcadSymbolNumber(ocadSymbolNumber: number): string {
  const base = Math.floor(ocadSymbolNumber / OCAD_SUBNUMBERS_PER_SYMBOL)
  const decimals = String(ocadSymbolNumber % OCAD_SUBNUMBERS_PER_SYMBOL)
    .padStart(3, '0')
    .replace(/0+$/, '')
  return `${base}.${decimals || '0'}`
}
