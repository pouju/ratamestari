import type { PaperPoint } from '@ratamestari/core'
import { MAP_APPEARANCES, type Appearance, type Ink } from '@ratamestari/rules'
import { centreOf } from './chains'
import type { PdfPath } from './pdf-paths'
import { boxOf, cornersOf, pathLength, signedArea } from './shapes'

type PointSymbol = Extract<Appearance, { draw: 'point' }> & { code: string }
type Shape = PointSymbol['shape']

const POINTS: readonly PointSymbol[] = MAP_APPEARANCES.flatMap(({ code, appearance }) =>
  appearance.draw === 'point' ? [{ ...appearance, code }] : [],
)

// Interpretation: shape tests for point symbols.
export const MAX_POINT_SYMBOL_MM = 1.3
const SIZE_TOLERANCE = 0.4
const LINE_WIDTH_TOLERANCE = 0.25
const ELONGATED_ASPECT = 1.5
const OPEN_SHAPE_FILL_SHARE = 0.6
const SOLID_TRIANGLE_FILL_SHARE = 0.6
const EQUAL_SIDES_RATIO = 1.25
const CORNER_TOLERANCE_SHARE = 0.1
const CLOSED_GAP_SHARE = 0.1
const MIN_OUTLINE_LENGTH_SHARE = 1.2

export function filledPointSymbol(
  rings: readonly (readonly PaperPoint[])[],
  ink: Ink,
  toMm: (paperUnits: number) => number,
): string | null {
  const box = boxOf(rings.flat())
  const longSide = Math.max(box.width, box.height)
  const shortSide = Math.min(box.width, box.height)
  const fillShare =
    Math.abs(rings.reduce((sum, ring) => sum + signedArea(ring), 0)) / (box.width * box.height)
  const corners = rings.length === 1 ? cornersOf(rings[0]!, longSide * CORNER_TOLERANCE_SHARE) : []
  const shape: Shape =
    corners.length === 3 && fillShare < SOLID_TRIANGLE_FILL_SHARE
      ? hasEqualSides(corners)
        ? 'triangle'
        : 'unevenTriangle'
      : fillShare < OPEN_SHAPE_FILL_SHARE
        ? 'v'
        : longSide / shortSide >= ELONGATED_ASPECT
          ? 'ellipse'
          : 'dot'
  return nearestBySize(ink, shape, toMm(longSide), null)
}

export function strokedPointSymbol(
  path: PdfPath,
  ink: Ink,
  widthMm: number,
  toMm: (paperUnits: number) => number,
): string | null {
  const [only, ...others] = path.subpaths
  if (!only || others.length > 0) return null
  const box = boxOf(only.points)
  const sizeMm = toMm(Math.max(box.width, box.height)) + widthMm
  if (sizeMm > MAX_POINT_SYMBOL_MM) return null
  if (toMm(pathLength(only.points)) < sizeMm * MIN_OUTLINE_LENGTH_SHARE) return null
  const [first, last] = [only.points[0]!, only.points[only.points.length - 1]!]
  const closed =
    only.closed ||
    Math.hypot(last[0] - first[0], last[1] - first[1]) <=
      Math.max(box.width, box.height) * CLOSED_GAP_SHARE
  const corners = cornersOf(only.points, Math.max(box.width, box.height) * CORNER_TOLERANCE_SHARE)
  const shape: Shape = closed
    ? only.curved
      ? 'ring'
      : 'square'
    : only.curved
      ? 'halfCircle'
      : corners.length <= 3
        ? 'v'
        : 'square'
  return nearestBySize(ink, shape, sizeMm, widthMm)
}

export const pointAt = (rings: readonly (readonly PaperPoint[])[]) => centreOf(rings.flat())

function nearestBySize(ink: Ink, shape: Shape, sizeMm: number, lineWidthMm: number | null) {
  let best: { code: string; error: number } | null = null
  for (const candidate of POINTS) {
    if (candidate.ink !== ink || candidate.shape !== shape) continue
    // A filled shape may be an outline symbol that the producer turned into a fill.
    if (lineWidthMm !== null && candidate.lineWidthMm === undefined) continue
    if (
      lineWidthMm !== null &&
      candidate.lineWidthMm !== undefined &&
      Math.abs(lineWidthMm - candidate.lineWidthMm) > candidate.lineWidthMm * LINE_WIDTH_TOLERANCE
    ) {
      continue
    }
    const error = Math.abs(sizeMm - candidate.sizeMm) / candidate.sizeMm
    if (error > SIZE_TOLERANCE) continue
    if (!best || error < best.error) best = { code: candidate.code, error }
  }
  return best?.code ?? null
}

function hasEqualSides(corners: readonly PaperPoint[]): boolean {
  const sides = corners.map((corner, i) => {
    const next = corners[(i + 1) % corners.length]!
    return Math.hypot(next[0] - corner[0], next[1] - corner[1])
  })
  return Math.max(...sides) / Math.min(...sides) <= EQUAL_SIDES_RATIO
}
