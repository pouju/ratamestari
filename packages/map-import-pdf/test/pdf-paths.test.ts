import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { readPdfPages, type PdfPath } from '../src'

const MM = 72 / 25.4

async function samplePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([100 * MM, 50 * MM])
  page.drawLine({
    start: { x: 10 * MM, y: 10 * MM },
    end: { x: 40 * MM, y: 10 * MM },
    thickness: 0.14 * MM,
    color: rgb(0.8, 0.4, 0),
  })
  page.drawCircle({
    x: 60 * MM,
    y: 25 * MM,
    size: 3 * MM,
    borderWidth: 0.35 * MM,
    borderColor: rgb(0.8, 0, 0.8),
  })
  page.drawRectangle({
    x: 70 * MM,
    y: 30 * MM,
    width: 20 * MM,
    height: 10 * MM,
    color: rgb(1, 0.8, 0.2),
  })
  page.drawText('12', {
    x: 5 * MM,
    y: 40 * MM,
    size: 4 * MM,
    font: await pdf.embedFont(StandardFonts.Helvetica),
  })
  return pdf.save()
}

const colorOf = (path: PdfPath, paint: 'fill' | 'stroke') => {
  const value = path[paint]
  return value?.kind === 'color' ? value.color : null
}

describe('readPdfPages', () => {
  it('reads paths and text in hundredths of millimetres, y up', async () => {
    const [page] = await readPdfPages(await samplePdf())

    expect(page!.width).toBeCloseTo(10000)
    expect(page!.height).toBeCloseTo(5000)

    const line = page!.paths.find(path => colorOf(path, 'stroke') === '#cc6600')!
    expect(line.fill).toBeNull()
    expect(line.lineWidth).toBeCloseTo(14)
    expect(line.subpaths[0]!.points[0]![0]).toBeCloseTo(1000)
    expect(line.subpaths[0]!.points[0]![1]).toBeCloseTo(1000)
    expect(line.subpaths[0]!.points.at(-1)![0]).toBeCloseTo(4000)

    const circle = page!.paths.find(path => colorOf(path, 'stroke') === '#cc00cc')!
    expect(circle.lineWidth).toBeCloseTo(35)
    expect(circle.subpaths[0]!.curved).toBe(true)
    const radii = circle.subpaths[0]!.points.map(([x, y]) => Math.hypot(x - 6000, y - 2500))
    for (const radius of radii) expect(radius).toBeCloseTo(300, -1)

    const area = page!.paths.find(path => colorOf(path, 'fill') === '#ffcc33')!
    expect(area.stroke).toBeNull()
    expect(area.subpaths[0]!.curved).toBe(false)

    const [text] = page!.texts
    expect(text!.text).toBe('12')
    expect(text!.origin[0]).toBeCloseTo(500)
    expect(text!.origin[1]).toBeCloseTo(4000)
    expect(text!.height).toBeCloseTo(400)
  })
})
