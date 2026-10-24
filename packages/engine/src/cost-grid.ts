import type { LocalExtent, LocalGeometry, LocalPoint, MapFeature } from '@ratamestari/core'
import {
  CLIMB_EQUIVALENT_FLAT_METERS,
  CROSSING_SLOWS_SPEED_FACTOR,
  FORBIDDEN_ALONG_SPEED_FACTOR,
  isomSymbolRule,
  RUNNABILITY,
  UNMAPPED_TERRAIN,
  type Movement,
} from '@ratamestari/rules'
import { segmentIntersection } from './polyline'
import { cellIndexOf, fillPolygon, traceLine, type GridFrame } from './raster'

export const BLOCKED = 0

export interface CostGrid extends GridFrame {
  readonly speed: Float32Array
  readonly maxSpeed: number
  readonly contours?: ContourCells
}

export interface ContourCells {
  // CONTOUR_SLOTS_PER_CELL contour line ids per cell, NO_CONTOUR in empty slots.
  readonly lineIds: Int32Array
  readonly intervalMeters: number
}

export const CONTOUR_SLOTS_PER_CELL = 3
const NO_CONTOUR = -1

// Costs stay symmetric, so a time tree grown from the finish gives times to it. Charging half the
// climb cost for each metre up or down picks the same routes as charging all of it for climbing
// only: between two given points, metres up minus metres down is the same on every route. So the
// direction of a contour does not matter, and neither does whether it is known.
export const FLAT_METERS_PER_METER_OF_HEIGHT_CHANGE = CLIMB_EQUIVALENT_FLAT_METERS.value / 2

export function contourCellsOf(
  frame: GridFrame,
  lines: readonly (readonly LocalPoint[])[],
  intervalMeters: number,
): ContourCells {
  const lineIds = new Int32Array(frame.columns * frame.rows * CONTOUR_SLOTS_PER_CELL).fill(
    NO_CONTOUR,
  )
  const mark = (cell: number, id: number) => {
    for (
      let slot = cell * CONTOUR_SLOTS_PER_CELL;
      slot < (cell + 1) * CONTOUR_SLOTS_PER_CELL;
      slot++
    ) {
      if (lineIds[slot] === id) return
      if (lineIds[slot] === NO_CONTOUR) {
        lineIds[slot] = id
        return
      }
    }
  }
  lines.forEach((points, id) => {
    let previous: number | null = null
    traceLine(frame, points, cell => {
      // A diagonal step in the line would leave a gap that a diagonal route step slips through.
      if (previous !== null && previous % frame.columns !== cell % frame.columns) {
        const previousRow = Math.floor(previous / frame.columns)
        if (previousRow !== Math.floor(cell / frame.columns)) {
          mark(previousRow * frame.columns + (cell % frame.columns), id)
        }
      }
      mark(cell, id)
      previous = cell
    })
  })
  return { lineIds, intervalMeters }
}

// A step onto a contour line and the step off it on the other side each count half a crossing,
// so does a step from one line straight onto the next. Running along a line costs nothing.
export function heightChangeMeters(grid: CostGrid, from: number, to: number): number {
  if (!grid.contours) return 0
  const { lineIds, intervalMeters } = grid.contours
  const fromSlot = from * CONTOUR_SLOTS_PER_CELL
  const toSlot = to * CONTOUR_SLOTS_PER_CELL
  if (lineIds[fromSlot] === NO_CONTOUR && lineIds[toSlot] === NO_CONTOUR) return 0
  const linesOnlyIn = (cellSlot: number, otherSlot: number) => {
    let count = 0
    for (let i = 0; i < CONTOUR_SLOTS_PER_CELL; i++) {
      const id = lineIds[cellSlot + i]!
      if (id === NO_CONTOUR) break
      let isShared = false
      for (let j = 0; j < CONTOUR_SLOTS_PER_CELL; j++) isShared ||= lineIds[otherSlot + j] === id
      if (!isShared) count++
    }
    return count
  }
  return ((linesOnlyIn(fromSlot, toSlot) + linesOnlyIn(toSlot, fromSlot)) / 2) * intervalMeters
}

export interface CostGridOptions {
  readonly cellSizeMeters?: number
}

const DEFAULT_CELL_SIZE_METERS = 5

interface ClassifiedFeature {
  readonly movement: Movement
  readonly geometry: LocalGeometry
}

const forestSpeed = RUNNABILITY[UNMAPPED_TERRAIN.runnabilityClass].speedFactor

export function buildCostGrid(
  features: readonly MapFeature[],
  extent: LocalExtent,
  { cellSizeMeters = DEFAULT_CELL_SIZE_METERS }: CostGridOptions = {},
): CostGrid {
  const [minX, minY, maxX, maxY] = extent
  const frame: GridFrame = {
    minX,
    minY,
    cellSizeMeters,
    columns: Math.max(1, Math.ceil((maxX - minX) / cellSizeMeters)),
    rows: Math.max(1, Math.ceil((maxY - minY) / cellSizeMeters)),
  }
  const cellCount = frame.columns * frame.rows
  const classified = classify(features)
  const ofKind = (kind: Movement['kind']) => classified.filter(f => f.movement.kind === kind)

  const cover = new Float32Array(cellCount).fill(Number.POSITIVE_INFINITY)
  const groundMultiplier = new Float32Array(cellCount).fill(1)
  for (const { movement, geometry } of ofKind('runnability')) {
    if (movement.kind !== 'runnability' || geometry.type !== 'Polygon') continue
    const factor = RUNNABILITY[movement.runnabilityClass].speedFactor
    if (movement.layer === 'cover') {
      fillPolygon(frame, geometry.coordinates, i => (cover[i] = Math.min(cover[i]!, factor)))
    } else if (movement.layer === 'ground') {
      fillPolygon(frame, geometry.coordinates, i => (groundMultiplier[i]! *= factor / forestSpeed))
    }
  }

  const speed = new Float32Array(cellCount)
  for (let i = 0; i < cellCount; i++) {
    const coverSpeed = cover[i] === Number.POSITIVE_INFINITY ? forestSpeed : cover[i]!
    speed[i] = coverSpeed * groundMultiplier[i]!
  }

  for (const { movement, geometry } of ofKind('runnability')) {
    if (movement.kind !== 'runnability' || movement.layer !== 'path') continue
    const factor = RUNNABILITY[movement.runnabilityClass].speedFactor
    visitLinework(frame, geometry, i => (speed[i] = Math.max(speed[i]!, factor)))
  }

  for (const { geometry } of ofKind('crossingSlows')) {
    visitLinework(frame, geometry, i => (speed[i]! *= CROSSING_SLOWS_SPEED_FACTOR.value))
  }
  for (const { geometry } of ofKind('forbiddenAlong')) {
    visitLinework(frame, geometry, i => (speed[i]! *= FORBIDDEN_ALONG_SPEED_FACTOR.value))
  }

  const speedBeforeBarriers = speed.slice()
  const railways = ofKind('forbiddenExceptLevelCrossings')
  for (const { geometry } of [...ofKind('impassable'), ...ofKind('forbidden'), ...railways]) {
    const block = (i: number) => (speed[i] = BLOCKED)
    if (geometry.type === 'Polygon') fillPolygon(frame, geometry.coordinates, block)
    visitLinework(frame, geometry, block)
  }

  const reopen = (i: number) => (speed[i] = Math.max(speedBeforeBarriers[i]!, forestSpeed))
  for (const { geometry } of ofKind('crossingPoint')) {
    if (geometry.type === 'Point') visitNeighbourhood(frame, geometry.coordinates, reopen)
    else visitLinework(frame, geometry, reopen)
  }
  const paths = ofKind('runnability').filter(
    f => f.movement.kind === 'runnability' && f.movement.layer === 'path',
  )
  for (const crossing of levelCrossings(railways, paths)) {
    visitNeighbourhood(frame, crossing, reopen)
  }

  return { ...frame, speed, maxSpeed: maxOf(speed) }
}

function maxOf(values: Float32Array): number {
  let max = 0
  for (const value of values) if (value > max) max = value
  return max
}

function classify(features: readonly MapFeature[]): ClassifiedFeature[] {
  return features.flatMap(({ isomCode, geometry }) => {
    const rule = isomCode === null ? undefined : isomSymbolRule(isomCode)
    return rule ? [{ movement: rule.movement, geometry }] : []
  })
}

function visitLinework(frame: GridFrame, geometry: LocalGeometry, visit: (i: number) => void) {
  switch (geometry.type) {
    case 'Point': {
      const index = cellIndexOf(frame, geometry.coordinates)
      if (index !== null) visit(index)
      return
    }
    case 'LineString':
      return traceLine(frame, geometry.coordinates, visit)
    case 'Polygon':
      return geometry.coordinates.forEach(ring => traceLine(frame, closeRing(ring), visit))
  }
}

const closeRing = (ring: readonly LocalPoint[]): readonly LocalPoint[] =>
  ring.length > 0 ? [...ring, ring[0]!] : ring

function visitNeighbourhood(frame: GridFrame, center: LocalPoint, visit: (i: number) => void) {
  const centerIndex = cellIndexOf(frame, center)
  if (centerIndex === null) return
  const column = centerIndex % frame.columns
  const row = Math.floor(centerIndex / frame.columns)
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = row + dr
      const c = column + dc
      if (r >= 0 && c >= 0 && r < frame.rows && c < frame.columns) visit(r * frame.columns + c)
    }
  }
}

function levelCrossings(
  railways: readonly ClassifiedFeature[],
  paths: readonly ClassifiedFeature[],
): LocalPoint[] {
  const linesOf = ({ geometry }: ClassifiedFeature): (readonly LocalPoint[])[] =>
    geometry.type === 'LineString' ? [geometry.coordinates] : []
  const railwayLines = railways.flatMap(linesOf)
  const crossings: LocalPoint[] = []
  for (const path of paths.flatMap(linesOf)) {
    for (let i = 1; i < path.length; i++) {
      for (const railway of railwayLines) {
        for (let j = 1; j < railway.length; j++) {
          const crossing = segmentIntersection(path[i - 1]!, path[i]!, railway[j - 1]!, railway[j]!)
          if (crossing) crossings.push(crossing)
        }
      }
    }
  }
  return crossings
}

const ROUTABLE_WITHIN_METERS = 10

// A control drawn on a cliff foot or a building corner can fall on a blocked cell; the runner
// reaches it from the nearest open ground.
export function routableCellOf(grid: CostGrid, point: LocalPoint): number | null {
  const center = cellIndexOf(grid, point)
  if (center === null || grid.speed[center] !== BLOCKED) return center
  const column = center % grid.columns
  const row = Math.floor(center / grid.columns)
  const reach = Math.ceil(ROUTABLE_WITHIN_METERS / grid.cellSizeMeters)
  let best: { index: number; distance: number } | null = null
  for (let dr = -reach; dr <= reach; dr++) {
    for (let dc = -reach; dc <= reach; dc++) {
      const c = column + dc
      const r = row + dr
      if (c < 0 || r < 0 || c >= grid.columns || r >= grid.rows) continue
      const index = r * grid.columns + c
      const distance = Math.hypot(dc, dr) * grid.cellSizeMeters
      if (grid.speed[index] === BLOCKED || distance > ROUTABLE_WITHIN_METERS) continue
      if (!best || distance < best.distance) best = { index, distance }
    }
  }
  return best?.index ?? null
}
