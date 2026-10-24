import { describe, expect, it } from 'vitest'
import type { DescriptionSheet } from '../src/description-sheet'
import { renderDescriptionSheet } from '../src/description-svg'

const boulder = {
  whichOfSimilar: null,
  feature: 'boulder',
  appearance: null,
  location: null,
} as const

const sheet: DescriptionSheet = {
  title: 'Night & day <test>',
  courseName: 'D45',
  lengthKilometers: 4.2,
  climbMeters: 85,
  start: null,
  controls: [1, 2, 3, 4].map(number => ({
    number,
    code: 30 + number,
    description: { ...boulder, location: { kind: 'side', direction: 'east' } },
  })),
  finish: { distanceMeters: 120, route: 'notTaped' },
}

describe('renderDescriptionSheet', () => {
  it('sizes the sheet from 8 columns of boxes and one row per line', () => {
    const rendered = renderDescriptionSheet(sheet, { boxMillimetres: 6 })
    expect(rendered.widthMillimetres).toBe(48)
    expect(rendered.heightMillimetres).toBe((2 + 1 + 4 + 1) * 6)
    expect(rendered.svg).toMatch(/^<svg [^>]*width="48mm" height="48mm"/)
  })

  it('can size the image in pixels for sharp display', () => {
    const { svg } = renderDescriptionSheet(sheet, { boxMillimetres: 6, pixelsPerMillimetre: 10 })
    expect(svg).toMatch(/^<svg [^>]*width="480" height="480"/)
  })

  it('writes the heading and escapes the event title', () => {
    const { svg } = renderDescriptionSheet(sheet)
    expect(svg).toContain('Night &amp; day &lt;test&gt;')
    expect(svg).toContain('>4.2 km<')
    expect(svg).toContain('>85 m<')
    expect(svg).toContain('>120 m<')
  })

  it('turns directional symbols to their compass point', () => {
    expect(renderDescriptionSheet(sheet).svg).toContain('rotate(90 50 50)')
  })

  it('draws a thicker line after every third control', () => {
    const { svg } = renderDescriptionSheet(sheet, { boxMillimetres: 6 })
    const thickRowYs = [...svg.matchAll(/<line x1="0" y1="([\d.]+)"[^>]*stroke-width="0.45"/g)].map(
      match => Number(match[1]),
    )
    expect(thickRowYs).toEqual([12, 36, 42])
  })
})
