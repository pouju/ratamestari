import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { readPdfMap } from '../src'

// A 1 × 1 grey PNG.
const PIXEL_PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==',
  ),
  character => character.charCodeAt(0),
)

describe('readPdfMap', () => {
  it('tells a scanned map, which is only a picture, from a map drawing', async () => {
    const pdf = await PDFDocument.create()
    const page = pdf.addPage([400, 300])
    page.drawImage(await pdf.embedPng(PIXEL_PNG), { x: 0, y: 0, width: 400, height: 300 })

    const map = await readPdfMap(await pdf.save())

    expect(map.pages).toHaveLength(0)
    expect(map.isPicture).toBe(true)
  })
})
