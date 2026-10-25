import type { PaperPoint } from '@ratamestari/core'
import { MAP_APPEARANCES, type Ink } from '@ratamestari/rules'
import { centreOf } from './chains'
import { isInsideClips } from './clip'
import { MAX_DOT_MM, readDots, squareAround, SCATTERED_SQUARE_MM, type Dot } from './dots'
import { inkOf } from './inks'
import { readLines, type LinePiece } from './lines'
import { readPattern } from './patterns'
import type { PdfPageContent, PdfPath } from './pdf-paths'
import { filledPointSymbol, MAX_POINT_SYMBOL_MM, pointAt, strokedPointSymbol } from './points'
import { boxOf } from './shapes'

export type PaperGeometry =
  | { readonly type: 'Point'; readonly coordinates: PaperPoint }
  | { readonly type: 'LineString'; readonly coordinates: readonly PaperPoint[] }
  | { readonly type: 'Polygon'; readonly coordinates: readonly (readonly PaperPoint[])[] }

// A map object read from the page, in paper units of the page (hundredths of a millimetre).
export interface PaperFeature {
  readonly isomCode: string
  readonly geometry: PaperGeometry
}

const PAPER_UNITS_PER_MM = 100
// Area symbols drawn as many small shapes (boulder fields) are read as squares of their area.
const AREA_OF_SMALL_SHAPES = new Set(['208'])
const SAME_OUTLINE_MM = 0.05

const AREA_CODE_OF_INK = new Map<Ink, string>(
  MAP_APPEARANCES.flatMap(({ code, appearance }) =>
    appearance.draw === 'area' ? [[appearance.ink, code] as const] : [],
  ),
)

// Reads ISOM map objects from the paths of a page. `symbolScale` is how much the symbols are
// enlarged against ISOM's 1:15 000 sizes; `excluded` are paths drawn by the course overprint.
export function classifyPage(
  page: PdfPageContent,
  symbolScale: number,
  excluded: ReadonlySet<number>,
): PaperFeature[] {
  const toMm = (paperUnits: number) => paperUnits / PAPER_UNITS_PER_MM / symbolScale
  const visible = page.paths.flatMap((path, index) => {
    if (excluded.has(index)) return []
    const points = path.subpaths.flatMap(subpath => subpath.points)
    return points.length > 0 && isInsideClips(path, centreOf(points)) ? [path] : []
  })

  const outlineKey = (path: PdfPath) => {
    const box = boxOf(path.subpaths.flatMap(subpath => subpath.points))
    return [box.minX, box.minY, box.width, box.height]
      .map(value => Math.round(toMm(value) / SAME_OUTLINE_MM))
      .join(',')
  }
  const flatFills = new Map<string, { path: PdfPath; ink: Ink }[]>()
  for (const path of visible) {
    const ink = path.fill?.kind === 'color' ? inkOf(path.fill) : null
    if (!ink) continue
    const key = outlineKey(path)
    flatFills.set(key, [...(flatFills.get(key) ?? []), { path, ink }])
  }

  const features = new Map<PdfPath, PaperFeature>()
  const replacedBackgrounds = new Set<PdfPath>()
  const linePieces: LinePiece[] = []
  const dots: Dot[] = []

  for (const path of visible) {
    const rings = path.subpaths.map(subpath => subpath.points)
    if (path.fill?.kind === 'pattern') {
      const backgrounds = flatFills.get(outlineKey(path)) ?? []
      const reading = readPattern(path.fill, backgrounds[0]?.ink ?? null, toMm)
      if (reading) {
        features.set(path, {
          isomCode: reading.code,
          geometry: { type: 'Polygon', coordinates: rings },
        })
        if (reading.includesBackground) {
          for (const background of backgrounds) replacedBackgrounds.add(background.path)
        }
      }
    } else if (path.fill) {
      const ink = inkOf(path.fill)
      if (ink) {
        const box = boxOf(rings.flat())
        const sizeMm = toMm(Math.max(box.width, box.height))
        if (sizeMm <= MAX_DOT_MM) {
          dots.push({ ink, centre: centreOf(rings.flat()) })
        } else {
          const pointCode =
            sizeMm <= MAX_POINT_SYMBOL_MM ? filledPointSymbol(rings, ink, toMm) : null
          const areaCode = AREA_CODE_OF_INK.get(ink)
          if (pointCode && AREA_OF_SMALL_SHAPES.has(pointCode)) {
            features.set(path, {
              isomCode: pointCode,
              geometry: squareAround(pointAt(rings), SCATTERED_SQUARE_MM / toMm(1)),
            })
          } else if (pointCode) {
            features.set(path, {
              isomCode: pointCode,
              geometry: { type: 'Point', coordinates: pointAt(rings) },
            })
          } else if (areaCode) {
            features.set(path, {
              isomCode: areaCode,
              geometry: { type: 'Polygon', coordinates: rings },
            })
          }
        }
      }
    }

    const strokeInk = inkOf(path.stroke)
    if (strokeInk) {
      const widthMm = toMm(path.lineWidth)
      const pointCode = strokedPointSymbol(path, strokeInk, widthMm, toMm)
      if (pointCode) {
        features.set(path, {
          isomCode: pointCode,
          geometry: { type: 'Point', coordinates: pointAt(rings) },
        })
      } else {
        for (const points of rings) {
          linePieces.push({ ink: strokeInk, widthMm, pdfDash: path.dash.map(toMm), points })
        }
      }
    }
  }

  return [
    ...[...features].flatMap(([path, feature]) => (replacedBackgrounds.has(path) ? [] : [feature])),
    ...readLines(linePieces, toMm),
    ...readDots(dots, toMm),
  ]
}
