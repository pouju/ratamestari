import type { LocalPoint } from '@ratamestari/core'

export interface GridFrame {
  readonly minX: number
  readonly minY: number
  readonly cellSizeMeters: number
  readonly columns: number
  readonly rows: number
}

type VisitCell = (index: number) => void

const LINE_SAMPLES_PER_CELL = 3

export const cellIndexOf = (frame: GridFrame, [x, y]: LocalPoint): number | null => {
  const column = Math.floor((x - frame.minX) / frame.cellSizeMeters)
  const row = Math.floor((y - frame.minY) / frame.cellSizeMeters)
  if (column < 0 || row < 0 || column >= frame.columns || row >= frame.rows) return null
  return row * frame.columns + column
}

export const cellCenterOf = (frame: GridFrame, index: number): LocalPoint => {
  const column = index % frame.columns
  const row = Math.floor(index / frame.columns)
  return [
    frame.minX + (column + 0.5) * frame.cellSizeMeters,
    frame.minY + (row + 0.5) * frame.cellSizeMeters,
  ] as const as LocalPoint
}

export function traceLine(frame: GridFrame, points: readonly LocalPoint[], visit: VisitCell) {
  const step = frame.cellSizeMeters / LINE_SAMPLES_PER_CELL
  let previousIndex: number | null = null
  const visitPoint = (point: LocalPoint) => {
    const index = cellIndexOf(frame, point)
    if (index !== null && index !== previousIndex) visit(index)
    previousIndex = index
  }
  points.forEach((end, i) => {
    const start = points[i - 1]
    if (!start) return visitPoint(end)
    const samples = Math.max(1, Math.ceil(Math.hypot(end[0] - start[0], end[1] - start[1]) / step))
    for (let s = 1; s <= samples; s++) {
      const t = s / samples
      visitPoint([
        start[0] + (end[0] - start[0]) * t,
        start[1] + (end[1] - start[1]) * t,
      ] as const as LocalPoint)
    }
  })
}

export function fillPolygon(
  frame: GridFrame,
  rings: readonly (readonly LocalPoint[])[],
  visit: VisitCell,
) {
  const allPoints = rings.flat()
  if (allPoints.length === 0) return
  const ys = allPoints.map(([, y]) => y)
  const firstRow = Math.max(0, Math.floor((Math.min(...ys) - frame.minY) / frame.cellSizeMeters))
  const lastRow = Math.min(
    frame.rows - 1,
    Math.floor((Math.max(...ys) - frame.minY) / frame.cellSizeMeters),
  )

  for (let row = firstRow; row <= lastRow; row++) {
    const y = frame.minY + (row + 0.5) * frame.cellSizeMeters
    const crossings: number[] = []
    for (const ring of rings) {
      ring.forEach((a, i) => {
        const b = ring[(i + 1) % ring.length]!
        if (a[1] <= y === b[1] <= y) return
        crossings.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]))
      })
    }
    crossings.sort((p, q) => p - q)
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const firstColumn = Math.max(
        0,
        Math.ceil((crossings[i]! - frame.minX) / frame.cellSizeMeters - 0.5),
      )
      const lastColumn = Math.min(
        frame.columns - 1,
        Math.floor((crossings[i + 1]! - frame.minX) / frame.cellSizeMeters - 0.5),
      )
      for (let column = firstColumn; column <= lastColumn; column++) {
        visit(row * frame.columns + column)
      }
    }
  }
}
