import type { MapFeature } from '@ratamestari/core'
import { isomSymbolRule } from '@ratamestari/rules'
import { chamferDistance, fillPolygon, traceLine, type GridFrame } from './raster'

const TERRAIN_LINE_ISOM_CODES = new Set(['101', '102', '103'])
const CLOSING_RADIUS_METERS = 100
const OUTSIDE = 0
const INSIDE = 1

export function mappedAreaMask(features: readonly MapFeature[], frame: GridFrame): Uint8Array {
  const cellCount = frame.columns * frame.rows
  const distanceToTerrain = new Float32Array(cellCount).fill(Number.POSITIVE_INFINITY)
  let hasTerrain = false
  const markTerrain = (i: number) => {
    distanceToTerrain[i] = 0
    hasTerrain = true
  }
  for (const { isomCode, geometry } of features) {
    if (isomCode === null) continue
    if (TERRAIN_LINE_ISOM_CODES.has(isomCode) && geometry.type === 'LineString') {
      traceLine(frame, geometry.coordinates, markTerrain)
    } else if (isTerrainArea(isomCode) && geometry.type === 'Polygon') {
      fillPolygon(frame, geometry.coordinates, markTerrain)
      geometry.coordinates.forEach(ring => traceLine(frame, ring, markTerrain))
    }
  }
  if (!hasTerrain) return new Uint8Array(cellCount).fill(INSIDE)
  chamferDistance(distanceToTerrain, frame)

  const isNearTerrain = (i: number) => distanceToTerrain[i]! <= CLOSING_RADIUS_METERS
  const outside = reachableFromBorder(frame, i => !isNearTerrain(i))

  const distanceToOutside = new Float32Array(cellCount)
  for (let i = 0; i < cellCount; i++)
    distanceToOutside[i] = outside[i] ? 0 : Number.POSITIVE_INFINITY
  chamferDistance(distanceToOutside, frame)

  return Uint8Array.from(distanceToOutside, d => (d > CLOSING_RADIUS_METERS ? INSIDE : OUTSIDE))
}

function isTerrainArea(isomCode: string): boolean {
  const movement = isomSymbolRule(isomCode)?.movement
  return movement?.kind === 'runnability' && movement.layer === 'cover'
}

function reachableFromBorder(frame: GridFrame, isOpen: (i: number) => boolean): Uint8Array {
  const { columns, rows } = frame
  const reached = new Uint8Array(columns * rows)
  const stack: number[] = []
  const visit = (i: number) => {
    if (reached[i] || !isOpen(i)) return
    reached[i] = 1
    stack.push(i)
  }
  for (let c = 0; c < columns; c++) {
    visit(c)
    visit((rows - 1) * columns + c)
  }
  for (let r = 0; r < rows; r++) {
    visit(r * columns)
    visit(r * columns + columns - 1)
  }
  while (stack.length > 0) {
    const i = stack.pop()!
    const c = i % columns
    if (c > 0) visit(i - 1)
    if (c < columns - 1) visit(i + 1)
    if (i >= columns) visit(i - columns)
    if (i + columns < reached.length) visit(i + columns)
  }
  return reached
}
