import {
  localExtent,
  paperPoint,
  paperToLocal,
  type LocalPoint,
  type MapFeature,
  type MapInfo,
  type PaperPoint,
} from '@ratamestari/core'
import type { DetectedCourse } from '@ratamestari/course-detect'
import { MAP_APPEARANCES } from '@ratamestari/rules'
import { classifyPage, type PaperFeature, type PaperGeometry } from './classify'
import { findDescriptionBox, pathsInside, type PaperRectangle } from './description-box'
import { detectPdfCourse } from './pdf-course'
import { readPdfPages, type PdfPageContent } from './pdf-paths'
import { symbolScaleOf } from './symbol-scale'

export interface PdfMapPage {
  readonly page: PdfPageContent
  readonly course: DetectedCourse | null
  readonly descriptionBox: PaperRectangle | null
  // How much larger than ISOM's 1:15 000 sizes the symbols are printed.
  readonly symbolScale: number
  // The print scale that ISOM's enlargement rule suggests; the user confirms it.
  readonly suggestedPrintScale: number
  readonly paperFeatures: readonly PaperFeature[]
  // The page as a map at the given print scale: ground metres, origin at the page's corner.
  readonly info: (printScale: number) => MapInfo
  readonly features: (printScale: number) => MapFeature[]
}

const ISOM_BASE_SCALE = 15000
// ISOM 2017-2 §2.9.1: map scales other than 1:15 000, with symbols enlarged to match.
const USUAL_PRINT_SCALES = [4000, 5000, 7500, 10000, 15000]
const CONTOUR_WIDTH_MM = MAP_APPEARANCES.flatMap(({ code, appearance }) =>
  code === '101' && appearance.draw === 'line' ? [appearance.widthMm] : [],
)[0]!
const SYMBOL_NUMBER_PER_CODE = 1000

export async function readPdfMap(bytes: Uint8Array): Promise<PdfMapPage[]> {
  const pages = await readPdfPages(bytes)
  return pages.flatMap(page => {
    const course = detectPdfCourse(page)
    const symbolScale = symbolScaleOf(page, course, CONTOUR_WIDTH_MM)
    if (symbolScale === null) return []
    const descriptionBox = findDescriptionBox(page)
    const excluded = new Set([
      ...(course?.coursePathIndices ?? []),
      ...(descriptionBox ? pathsInside(page, descriptionBox) : []),
    ])
    const paperFeatures = classifyPage(page, symbolScale, excluded)
    const toLocal = (printScale: number) => (point: PaperPoint) => paperToLocal(point, printScale)
    return [
      {
        page,
        course,
        descriptionBox,
        symbolScale,
        suggestedPrintScale: nearestUsualScale(ISOM_BASE_SCALE / symbolScale),
        paperFeatures,
        info: printScale => {
          const corner = paperToLocal(paperPoint(page.width, page.height), printScale)
          return {
            scale: printScale,
            extent: localExtent(0, 0, corner[0], corner[1]),
            georef: null,
          }
        },
        features: printScale =>
          paperFeatures.map(feature => ({
            isomCode: feature.isomCode,
            symbolNumber: Math.round(parseFloat(feature.isomCode) * SYMBOL_NUMBER_PER_CODE),
            symbolRotationDegreesCounterClockwise: 0,
            geometry: localGeometry(feature.geometry, toLocal(printScale)),
          })),
      },
    ]
  })
}

function localGeometry(
  geometry: PaperGeometry,
  toLocal: (point: PaperPoint) => LocalPoint,
): MapFeature['geometry'] {
  switch (geometry.type) {
    case 'Point':
      return { type: 'Point', coordinates: toLocal(geometry.coordinates) }
    case 'LineString':
      return { type: 'LineString', coordinates: geometry.coordinates.map(toLocal) }
    case 'Polygon':
      return { type: 'Polygon', coordinates: geometry.coordinates.map(ring => ring.map(toLocal)) }
  }
}

const nearestUsualScale = (scale: number) =>
  USUAL_PRINT_SCALES.reduce((best, candidate) =>
    Math.abs(Math.log(candidate / scale)) < Math.abs(Math.log(best / scale)) ? candidate : best,
  )
