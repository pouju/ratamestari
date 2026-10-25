import { paperPoint, paperToLocal } from '@ratamestari/core'
import { courseStopsXml } from '@ratamestari/iof'
import type { OcadMap } from '@ratamestari/map-import-ocad'
import type { PdfMapPage } from '@ratamestari/map-import-pdf'

// What the workspace needs from an open map, whether OCAD or PDF.
export type LoadedMap = Pick<
  OcadMap,
  'info' | 'objectCount' | 'backgroundMapPaths' | 'symbols' | 'renderSvg'
>

// ISOM 2017-2 §2.9.1 map scales; a PDF's own scale is guessed from its symbol sizes.
export const PDF_PRINT_SCALES = [4000, 5000, 7500, 10000, 15000] as const
// Control codes aren't read from the page yet; numbering from 31 keeps them valid codes.
const FIRST_CONTROL_CODE = 31

export const isPdfFile = (file: File) => file.name.toLowerCase().endsWith('.pdf')

// pdf.js is large, so it loads only when a PDF is opened.
export async function readPdfMapFile(bytes: Uint8Array): Promise<PdfMapPage | null> {
  const [{ readPdfMap, setPdfWorkerUrl }, { default: workerUrl }] = await Promise.all([
    import('@ratamestari/map-import-pdf'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ])
  setPdfWorkerUrl(workerUrl)
  const pages = await readPdfMap(bytes)
  return (
    pages.find(page => page.course?.ordered) ??
    pages.reduce<PdfMapPage | null>(
      (best, page) =>
        !best || page.paperFeatures.length > best.paperFeatures.length ? page : best,
      null,
    )
  )
}

export async function pdfLoadedMap(page: PdfMapPage, printScale: number): Promise<LoadedMap> {
  const { renderPdfPageSvg } = await import('@ratamestari/map-import-pdf')
  return {
    info: page.info(printScale),
    objectCount: page.paperFeatures.length,
    backgroundMapPaths: [],
    symbols: () => [],
    renderSvg: document => renderPdfPageSvg(document, page.page, page.coursePaths),
  }
}

// The course printed on the page, as IOF XML for the course check.
export function printedCourseXml(
  page: PdfMapPage,
  printScale: number,
  names: { eventName: string; courseName: string },
): string | null {
  const course = page.course
  if (!course?.ordered || !course.start || !course.finish) return null
  const toLocal = ([x, y]: readonly [number, number]) => paperToLocal(paperPoint(x, y), printScale)
  return courseStopsXml({
    ...names,
    start: toLocal(course.start),
    controls: course.controls.map((position, i) => ({
      code: String(FIRST_CONTROL_CODE + i),
      position: toLocal(position),
    })),
    finish: toLocal(course.finish),
    map: page.info(printScale),
    createdAt: new Date(),
  })
}
