import type { IsomCode } from '@ratamestari/rules'

export type SymbolCorrections = ReadonlyMap<number, IsomCode | null>

const STORAGE_PREFIX = 'ratamestari.symbolCorrections.'

export async function mapKeyOf(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer)
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export function loadCorrections(mapKey: string): SymbolCorrections {
  try {
    const stored = localStorage.getItem(STORAGE_PREFIX + mapKey)
    if (!stored) return new Map()
    const entries = Object.entries(JSON.parse(stored) as Record<string, IsomCode | null>)
    return new Map(entries.map(([symbol, code]) => [Number(symbol), code]))
  } catch {
    return new Map()
  }
}

export function saveCorrections(mapKey: string, corrections: SymbolCorrections) {
  try {
    if (corrections.size === 0) localStorage.removeItem(STORAGE_PREFIX + mapKey)
    else
      localStorage.setItem(STORAGE_PREFIX + mapKey, JSON.stringify(Object.fromEntries(corrections)))
  } catch {
    // Without storage the corrections last until the page is reloaded.
  }
}
