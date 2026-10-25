import type { Ink } from '@ratamestari/rules'
import { colourFamilyOf, type ColourFamily } from './colour-family'
import type { PdfPaint } from './pdf-paths'

// Interpretation: printed colours as ISOM inks (docs/rules/isom-drawing.md › Colours).
const INK_OF_FAMILY: Partial<Record<ColourFamily, Ink>> = {
  black: 'black',
  grey: 'black 35%',
  brown: 'brown',
  brownLight: 'brown 50%',
  blue: 'blue',
  blueMid: 'blue 70%',
  blueLight: 'blue 50%',
  green: 'green',
  greenMid: 'green 60%',
  greenLight: 'green 30%',
  yellow: 'yellow',
  yellowLight: 'yellow 50%',
  olive: 'olive',
  white: 'white',
  purple: 'purple',
}

export const inkOf = (paint: PdfPaint | null): Ink | null =>
  paint?.kind === 'color' ? (INK_OF_FAMILY[colourFamilyOf(paint.color)] ?? null) : null
