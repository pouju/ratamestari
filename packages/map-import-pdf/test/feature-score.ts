import type { LocalPoint, MapFeature } from '@ratamestari/core'

export interface CodeScore {
  readonly truthCells: number
  readonly predictedCells: number
  readonly overlap: number
}

const CELL_METRES = 2

const POINT_RADIUS_METRES = 3
const LINE_RADIUS_CELLS = 1

// Compares two feature sets per ISOM code on a grid: points as small disks, lines as narrow
// bands, areas filled. Precision is overlap / predicted cells, recall overlap / truth cells.
// `visible` is the part of the map the page shows, as [minX, minY, maxX, maxY] in metres.
export function scoreFeatures(
  predicted: readonly MapFeature[],
  truth: readonly MapFeature[],
  [minX, minY, maxX, maxY]: readonly [number, number, number, number],
): Map<string, CodeScore> {
  const columns = Math.ceil((maxX - minX) / CELL_METRES)
  const rows = Math.ceil((maxY - minY) / CELL_METRES)
  const frame = { minX, minY, columns, rows }

  const rasterise = (features: readonly MapFeature[]) => {
    const byCode = new Map<string, Set<number>>()
    for (const feature of features) {
      if (feature.isomCode === null) continue
      const cells = byCode.get(feature.isomCode) ?? new Set<number>()
      markFeature(feature, frame, cells)
      byCode.set(feature.isomCode, cells)
    }
    return byCode
  }
  const predictedCells = rasterise(predicted)
  const truthCells = rasterise(truth)
  const codes = new Set([...predictedCells.keys(), ...truthCells.keys()])
  return new Map(
    [...codes].sort().map(code => {
      const p = predictedCells.get(code) ?? new Set<number>()
      const t = truthCells.get(code) ?? new Set<number>()
      const overlap = [...p].filter(cell => t.has(cell)).length
      return [code, { truthCells: t.size, predictedCells: p.size, overlap }]
    }),
  )
}

interface Frame {
  readonly minX: number
  readonly minY: number
  readonly columns: number
  readonly rows: number
}

function markFeature(feature: MapFeature, frame: Frame, cells: Set<number>) {
  const { geometry } = feature
  if (geometry.type === 'Point')
    return markDisk(geometry.coordinates, POINT_RADIUS_METRES, frame, cells)
  if (geometry.type === 'LineString') return markLine(geometry.coordinates, frame, cells)
  fillRings(geometry.coordinates, frame, cells)
}

function markDisk([x, y]: LocalPoint, radius: number, frame: Frame, cells: Set<number>) {
  const span = Math.ceil(radius / CELL_METRES)
  const [column, row] = cellOf(x, y, frame)
  for (let dc = -span; dc <= span; dc++) {
    for (let dr = -span; dr <= span; dr++) {
      if (Math.hypot(dc, dr) * CELL_METRES <= radius) add(column + dc, row + dr, frame, cells)
    }
  }
}

function markLine(points: readonly LocalPoint[], frame: Frame, cells: Set<number>) {
  points.forEach((end, i) => {
    const start = points[i - 1] ?? end
    const steps = Math.max(1, Math.ceil(Math.hypot(end[0] - start[0], end[1] - start[1])))
    for (let s = 0; s <= steps; s++) {
      const [column, row] = cellOf(
        start[0] + ((end[0] - start[0]) * s) / steps,
        start[1] + ((end[1] - start[1]) * s) / steps,
        frame,
      )
      for (let dc = -LINE_RADIUS_CELLS; dc <= LINE_RADIUS_CELLS; dc++) {
        for (let dr = -LINE_RADIUS_CELLS; dr <= LINE_RADIUS_CELLS; dr++) {
          add(column + dc, row + dr, frame, cells)
        }
      }
    }
  })
}

function fillRings(rings: readonly (readonly LocalPoint[])[], frame: Frame, cells: Set<number>) {
  for (let row = 0; row < frame.rows; row++) {
    const y = frame.minY + (row + 0.5) * CELL_METRES
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
      const first = Math.ceil((crossings[i]! - frame.minX) / CELL_METRES - 0.5)
      const last = Math.floor((crossings[i + 1]! - frame.minX) / CELL_METRES - 0.5)
      for (let column = first; column <= last; column++) add(column, row, frame, cells)
    }
  }
}

const cellOf = (x: number, y: number, frame: Frame) =>
  [Math.floor((x - frame.minX) / CELL_METRES), Math.floor((y - frame.minY) / CELL_METRES)] as const

function add(column: number, row: number, frame: Frame, cells: Set<number>) {
  if (column >= 0 && row >= 0 && column < frame.columns && row < frame.rows) {
    cells.add(row * frame.columns + column)
  }
}
