import { useState } from 'react'
import { isomEffect } from '@ratamestari/agent'
import {
  formatOcadSymbolNumber,
  isomCodeForOcadSymbol,
  type MapSymbol,
} from '@ratamestari/map-ocad'
import { ISOM_SYMBOL_RULES, isomSymbolRule, type IsomCode } from '@ratamestari/rules'
import type { SymbolCorrections } from './symbol-corrections'

const AUTOMATIC = 'auto'
const IGNORED = 'none'

interface Props {
  symbols: readonly MapSymbol[]
  corrections: SymbolCorrections
  isApplying: boolean
  onCorrect: (symbolNumber: number, isomCode: IsomCode | null | undefined) => void
}

const isomLabel = (code: IsomCode | null) =>
  code === null ? 'ignored' : `${code} ${isomSymbolRule(code)?.name ?? ''}`.trim()

export function SymbolPanel({ symbols, corrections, isApplying, onCorrect }: Props) {
  const [editing, setEditing] = useState<number | null>(null)
  return (
    <details className="symbols">
      <summary>
        Map symbols ({symbols.length}, {corrections.size} corrected)
      </summary>
      <p className="note">
        How each OCAD symbol is read. Correct a symbol if the club uses it for something else, e.g.
        a motorway drawn with a road symbol. Corrections are saved for this map in this browser.
      </p>
      <table>
        <tbody>
          {symbols.map(symbol => {
            const isCorrected = corrections.has(symbol.number)
            const code = isCorrected
              ? corrections.get(symbol.number)!
              : isomCodeForOcadSymbol(symbol.number)
            return (
              <tr key={symbol.number} className={isCorrected ? 'corrected' : undefined}>
                <td>{formatOcadSymbolNumber(symbol.number)}</td>
                <td>
                  {symbol.name || '–'}
                  <span className="note"> ×{symbol.objectCount}</span>
                  <br />
                  {editing === symbol.number ? (
                    <select
                      autoFocus
                      disabled={isApplying}
                      value={isCorrected ? (code ?? IGNORED) : AUTOMATIC}
                      onBlur={() => setEditing(null)}
                      onChange={e => {
                        const value = e.target.value
                        onCorrect(
                          symbol.number,
                          value === AUTOMATIC ? undefined : value === IGNORED ? null : value,
                        )
                        setEditing(null)
                      }}
                    >
                      <option value={AUTOMATIC}>
                        Automatic: {isomLabel(isomCodeForOcadSymbol(symbol.number))}
                      </option>
                      <option value={IGNORED}>Ignore this symbol</option>
                      {ISOM_SYMBOL_RULES.map(rule => (
                        <option key={rule.code} value={rule.code}>
                          {rule.code} {rule.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <button
                      type="button"
                      className="link"
                      onClick={() => setEditing(symbol.number)}
                    >
                      {isomLabel(code)}
                    </button>
                  )}
                  <span className="note"> {isomEffect(code)}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </details>
  )
}
