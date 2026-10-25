import { PDFDocument } from 'pdf-lib'
import type { Course, OverprintLayout, PeripheralInformation } from '@ratamestari/engine'
import type { DescriptionSheet } from '@ratamestari/iof'
import { printPageSvg } from '@ratamestari/print'
import type { LoadedMap } from './pdf-map'
import { saveFile } from './save-file'

const TARGET_DOTS_PER_INCH = 400
const SAFARI_MAX_CANVAS_PIXELS = 16_000_000
const MILLIMETRES_PER_INCH = 25.4
const POINTS_PER_INCH = 72

export async function savePrintPdf(
  map: LoadedMap,
  course: Course,
  overprintLayout: OverprintLayout | null,
  sheet: DescriptionSheet,
  fileName: string,
  peripheral: PeripheralInformation,
  scaleLine: string,
) {
  const svgOf = (includesObject: (objectIndex: number) => boolean) =>
    new XMLSerializer().serializeToString(map.renderSvg(document, includesObject))
  const mapSvg = svgOf(i => !peripheral.marginObjectIndices.has(i))
  const blocks = peripheral.blocks.map(block => ({
    block,
    svg: svgOf(i => block.objectIndices.includes(i)),
  }))
  const page = printPageSvg({
    mapSvg,
    mapScale: map.info.scale,
    course,
    ...(overprintLayout && { overprintLayout }),
    sheet,
    peripheral: { blocks, scaleLine },
  })
  if (!page) throw new Error('The course has no print area')

  const widthInches = page.widthMillimetres / MILLIMETRES_PER_INCH
  const heightInches = page.heightMillimetres / MILLIMETRES_PER_INCH
  const dotsPerInch = Math.min(
    TARGET_DOTS_PER_INCH,
    Math.sqrt(SAFARI_MAX_CANVAS_PIXELS / (widthInches * heightInches)),
  )
  const png = await rasterize(
    page.svg,
    Math.floor(widthInches * dotsPerInch),
    Math.floor(heightInches * dotsPerInch),
  )

  const pdf = await PDFDocument.create()
  pdf.setTitle(`${sheet.title}, ${sheet.courseName}`)
  pdf.setCreator('Ratamestari')
  const image = await pdf.embedPng(png)
  const pdfPage = pdf.addPage([widthInches * POINTS_PER_INCH, heightInches * POINTS_PER_INCH])
  pdfPage.drawImage(image, { x: 0, y: 0, width: pdfPage.getWidth(), height: pdfPage.getHeight() })
  const bytes = await pdf.save()
  saveFile(new Blob([bytes.slice().buffer], { type: 'application/pdf' }), fileName)
}

async function rasterize(svg: string, width: number, height: number): Promise<ArrayBuffer> {
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const image = new Image()
    image.src = svgUrl
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas 2D is not available')
    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'),
    )
    return await blob.arrayBuffer()
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}
