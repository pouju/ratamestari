import {
  localExtent,
  paperPoint,
  paperToLocal,
  projectedPoint,
  type LocalPoint,
  type MapFeature,
  type MapInfo,
  type PaperPoint,
} from '@ratamestari/core'
import type { DetectedCourse } from '@ratamestari/course-detect'
import { MAP_APPEARANCES } from '@ratamestari/rules'
import { classifyPage, type PaperFeature, type PaperGeometry } from './classify'
import { findDescriptionBox, pathsInside, type PaperRectangle } from './description-box'
import { readGeoReferences, type GeoReference } from './geo-pdf'
import { detectPdfCourse } from './pdf-course'
import { readPdfPages, type PdfPageContent } from './pdf-paths'
import { symbolScaleOf } from './symbol-scale'
import { findTextRuns, type TextRun } from './text-runs'

export interface PdfMapPage {
  readonly page: PdfPageContent
  readonly course: DetectedCourse | null
  readonly descriptionBox: PaperRectangle | null
  // How much larger than ISOM's 1:15 000 sizes the symbols are printed.
  readonly symbolScale: number
  // The print scale: exact from the page's georeference, otherwise the one ISOM's enlargement
  // rule suggests, for the user to confirm.
  readonly suggestedPrintScale: number
  readonly geoReference: GeoReference | null
  readonly paperFeatures: readonly PaperFeature[]
  // Paths that belong to the course and its description box, left out of the map.
  readonly coursePaths: ReadonlySet<number>
  // Lines of text (titles, notices, labels), left out of the map too.
  readonly textRuns: readonly TextRun[]
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
const PAPER_UNITS_PER_METRE = 100 * 1000
// A georeferenced page's scale is exact; it is rounded to a usual scale when that close to one.
const SAME_SCALE_SHARE = 0.005

export interface PdfMap {
  readonly pages: readonly PdfMapPage[]
  // The file has no map drawing to read, only pictures (a scan, or a print flattened to an image).
  readonly isPicture: boolean
}

// Interpretation: a page that is mostly one picture and gave no map symbols is a scan.
const PICTURE_PAGE_SHARE = 0.5

export async function readPdfMap(bytes: Uint8Array): Promise<PdfMap> {
  const pages = await readPdfPages(bytes)
  const geoReferences = await readGeoReferences(bytes).catch(() => [])
  const mapPages = pages.flatMap((page, index): PdfMapPage[] => {
    const geoReference = geoReferences[index] ?? null
    const geoScale = geoReference && geoReference.metresPerPaperUnit * PAPER_UNITS_PER_METRE
    const course = detectPdfCourse(page)
    const symbolScale = symbolScaleOf(page, course, CONTOUR_WIDTH_MM)
    if (symbolScale === null) return []
    const descriptionBox = findDescriptionBox(page)
    const excluded = new Set([
      ...(course?.coursePathIndices ?? []),
      ...(descriptionBox ? pathsInside(page, descriptionBox) : []),
    ])
    const textRuns = findTextRuns(page, excluded)
    const notMap = new Set([
      ...excluded,
      ...textRuns.flatMap(run => run.glyphs.map(glyph => glyph.pathIndex)),
    ])
    const paperFeatures = classifyPage(page, symbolScale, notMap)
    const toLocal = (printScale: number) => (point: PaperPoint) => paperToLocal(point, printScale)
    return [
      {
        page,
        course,
        descriptionBox,
        symbolScale,
        suggestedPrintScale: geoScale
          ? roundedScale(geoScale)
          : nearestUsualScale(ISOM_BASE_SCALE / symbolScale),
        geoReference,
        paperFeatures,
        coursePaths: excluded,
        textRuns,
        info: printScale => {
          const corner = paperToLocal(paperPoint(page.width, page.height), printScale)
          return {
            scale: printScale,
            extent: localExtent(0, 0, corner[0], corner[1]),
            georef:
              geoReference && geoScale && Math.abs(printScale / geoScale - 1) <= SAME_SCALE_SHARE
                ? {
                    epsg: geoReference.epsg,
                    originInProjected: projectedPoint(...geoReference.origin),
                    grivationRadians: -geoReference.rotationRadians,
                  }
                : null,
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
  const usable = mapPages.filter(page => page.paperFeatures.length > 0)
  return {
    pages: usable,
    isPicture: usable.length === 0 && pages.some(page => page.imageShare >= PICTURE_PAGE_SHARE),
  }
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

function roundedScale(scale: number): number {
  const usual = nearestUsualScale(scale)
  return Math.abs(scale / usual - 1) <= SAME_SCALE_SHARE ? usual : Math.round(scale)
}

const nearestUsualScale = (scale: number) =>
  USUAL_PRINT_SCALES.reduce((best, candidate) =>
    Math.abs(Math.log(candidate / scale)) < Math.abs(Math.log(best / scale)) ? candidate : best,
  )
