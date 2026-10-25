import type { PaperPoint } from '@ratamestari/core'
import { inkOf } from './inks'
import type { PdfPageContent } from './pdf-paths'

export interface PaperRectangle {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

const PAPER_UNITS_PER_MM = 100
// Interpretation: the control description table (IOF Control Descriptions 2024, p. 3: black or
// purple boxes 5–7 mm a side, eight columns) shows as rows of horizontal lines with the same ends,
// crossed by column lines.
const MIN_RULE_MM = 2
const AXIS_SINE = 0.01
const SAME_END_MM = 0.5
const MIN_ROWS = 4
const MIN_COLUMNS = 3

interface Segment {
  readonly from: PaperPoint
  readonly to: PaperPoint
}

export function findDescriptionBox(page: PdfPageContent): PaperRectangle | null {
  const segments = page.paths.flatMap(path => {
    const ink = inkOf(path.stroke)
    if (ink !== 'black' && ink !== 'purple') return []
    return path.subpaths.flatMap(({ points, closed }) => {
      const ring = closed ? [...points, points[0]!] : points
      return ring.slice(1).map((to, i) => ({ from: ring[i]!, to }))
    })
  })
  const horizontal = segments.filter(segment => isAxisAligned(segment, 'x'))
  const vertical = segments.filter(segment => isAxisAligned(segment, 'y'))

  const rows = new Map<string, Segment[]>()
  for (const segment of horizontal) {
    const [left, right] = [segment.from[0], segment.to[0]].sort((a, b) => a - b) as [number, number]
    const key = `${Math.round(left / (SAME_END_MM * PAPER_UNITS_PER_MM))},${Math.round(right / (SAME_END_MM * PAPER_UNITS_PER_MM))}`
    rows.set(key, [...(rows.get(key) ?? []), segment])
  }

  let best: PaperRectangle | null = null
  for (const group of rows.values()) {
    const ys = [...new Set(group.map(segment => Math.round(segment.from[1])))]
    if (ys.length < MIN_ROWS) continue
    const xs = group.flatMap(segment => [segment.from[0], segment.to[0]])
    const box = {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    }
    const margin = SAME_END_MM * PAPER_UNITS_PER_MM
    const columns = new Set(
      vertical
        .filter(({ from, to }) =>
          [from, to].every(
            ([x, y]) =>
              x >= box.minX - margin &&
              x <= box.maxX + margin &&
              y >= box.minY - margin &&
              y <= box.maxY + margin,
          ),
        )
        .map(({ from }) => Math.round(from[0] / margin)),
    )
    if (columns.size < MIN_COLUMNS) continue
    if (!best || area(box) > area(best)) best = box
  }
  return best
}

export function pathsInside(page: PdfPageContent, box: PaperRectangle): number[] {
  const margin = SAME_END_MM * PAPER_UNITS_PER_MM
  return page.paths.flatMap((path, index) => {
    const points = path.subpaths.flatMap(subpath => subpath.points)
    const inside =
      points.length > 0 &&
      points.every(
        ([x, y]) =>
          x >= box.minX - margin &&
          x <= box.maxX + margin &&
          y >= box.minY - margin &&
          y <= box.maxY + margin,
      )
    return inside ? [index] : []
  })
}

function isAxisAligned({ from, to }: Segment, axis: 'x' | 'y'): boolean {
  const [dx, dy] = [to[0] - from[0], to[1] - from[1]]
  const length = Math.hypot(dx, dy)
  if (length < MIN_RULE_MM * PAPER_UNITS_PER_MM) return false
  return Math.abs(axis === 'x' ? dy : dx) / length <= AXIS_SINE
}

const area = (box: PaperRectangle) => (box.maxX - box.minX) * (box.maxY - box.minY)
