import { localExtent, localPoint, type LocalExtent, type LocalPoint } from '@ratamestari/core'
import { CONTROL_CIRCLE, DESCRIPTION_BOX, PAPER, type PaperSize } from '@ratamestari/rules'
import type { ControlSiteCandidate } from './control-sites'
import { cellCenterOf } from './raster'
import { segmentsCross } from './polyline'
import { siteAreaQuality } from './site-quality'
import type { Terrain } from './terrain'

export type Orientation = 'portrait' | 'landscape'

export interface PrintArea {
  readonly paper: PaperSize
  readonly scale: number
  readonly orientation: Orientation
  readonly extent: LocalExtent
  readonly descriptionBox: LocalExtent
  readonly peripheralBox: LocalExtent | null
}

export interface PaperBoxSize {
  readonly widthMillimetres: number
  readonly heightMillimetres: number
}

export interface PrintAreaRequest {
  readonly paper: PaperSize
  readonly printScale: number
  readonly competitionCentre: LocalPoint
  readonly descriptionRows: number
  readonly peripheralSize?: PaperBoxSize | null
}

const QUALITY_CELL_METERS = 25
// Any print area with room for the peripheral information beats every one without it.
const MISSING_PERIPHERAL_PENALTY = 1e9
const POSITION_STEP_METERS = 50
const CIRCLE_RADIUS_METERS = CONTROL_CIRCLE.footprintMeters / 2
const FINISH_CLEARANCE_METERS = CONTROL_CIRCLE.footprintMeters

const paperToGround = (millimetres: number, scale: number) => (millimetres * scale) / 1000

export function descriptionBoxGroundSize(rows: number, printScale: number) {
  return {
    width: paperToGround(DESCRIPTION_BOX.columns * DESCRIPTION_BOX.boxMillimetres, printScale),
    height: paperToGround(rows * DESCRIPTION_BOX.boxMillimetres, printScale),
  }
}

export function printableGroundSize(
  paper: PaperSize,
  orientation: Orientation,
  printScale: number,
) {
  const [shortSide, longSide] = PAPER.sizesMillimetres[paper]
  const margins = 2 * PAPER.printMarginMillimetres
  const width = paperToGround(
    (orientation === 'portrait' ? shortSide : longSide) - margins,
    printScale,
  )
  const height = paperToGround(
    (orientation === 'portrait' ? longSide : shortSide) - margins,
    printScale,
  )
  return { width, height }
}

const contains = ([minX, minY, maxX, maxY]: LocalExtent, [x, y]: LocalPoint, inset = 0) =>
  x >= minX + inset && x <= maxX - inset && y >= minY + inset && y <= maxY - inset

export const reservedBoxesOf = (area: PrintArea): LocalExtent[] =>
  area.peripheralBox ? [area.descriptionBox, area.peripheralBox] : [area.descriptionBox]

export function isUsableInPrintArea(position: LocalPoint, area: PrintArea): boolean {
  return (
    contains(area.extent, position, CIRCLE_RADIUS_METERS) &&
    reservedBoxesOf(area).every(box => !contains(box, position, -CIRCLE_RADIUS_METERS))
  )
}

const overlaps = (a: LocalExtent, b: LocalExtent) =>
  a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]

const peripheralGroundSize = (size: PaperBoxSize, printScale: number) => ({
  width: paperToGround(size.widthMillimetres, printScale),
  height: paperToGround(size.heightMillimetres, printScale),
})

// The peripheral information takes the cheapest free corner left by the description box.
function placePeripheralBox(
  extent: LocalExtent,
  descriptionBox: LocalExtent,
  size: { width: number; height: number } | null,
  isAllowed: (box: LocalExtent) => boolean,
  cost: (box: LocalExtent) => number,
): LocalExtent | null {
  if (!size) return null
  return (
    cornerBoxes(extent, size.width, size.height)
      .filter(box => !overlaps(box, descriptionBox) && isAllowed(box))
      .sort((a, b) => cost(a) - cost(b))[0] ?? null
  )
}

export function lineCrossesExtent(from: LocalPoint, to: LocalPoint, extent: LocalExtent): boolean {
  if (contains(extent, from) || contains(extent, to)) return true
  const [minX, minY, maxX, maxY] = extent
  const corners = [
    localPoint(minX, minY),
    localPoint(maxX, minY),
    localPoint(maxX, maxY),
    localPoint(minX, maxY),
  ]
  return corners.some((corner, i) => segmentsCross(from, to, corner, corners[(i + 1) % 4]!))
}

export function planPrintArea(
  terrain: Terrain,
  sites: readonly ControlSiteCandidate[],
  request: PrintAreaRequest,
): PrintArea | null {
  const quality = summedQuality(terrain, sites)
  const box = descriptionBoxGroundSize(request.descriptionRows, request.printScale)
  const peripheral = request.peripheralSize
    ? peripheralGroundSize(request.peripheralSize, request.printScale)
    : null
  const clearOfCentre = (reserved: LocalExtent) =>
    !contains(reserved, request.competitionCentre, -FINISH_CLEARANCE_METERS)
  const reservedQuality = (reserved: LocalExtent) =>
    quality.sum(shrunk(reserved, -CIRCLE_RADIUS_METERS))
  const [cx, cy] = request.competitionCentre
  let best: { area: PrintArea; score: number } | null = null

  for (const orientation of ['portrait', 'landscape'] as const) {
    const { width, height } = printableGroundSize(request.paper, orientation, request.printScale)
    if (box.width > width || box.height > height) continue
    for (
      let left = cx - width + FINISH_CLEARANCE_METERS;
      left <= cx - FINISH_CLEARANCE_METERS;
      left += POSITION_STEP_METERS
    ) {
      for (
        let bottom = cy - height + FINISH_CLEARANCE_METERS;
        bottom <= cy - FINISH_CLEARANCE_METERS;
        bottom += POSITION_STEP_METERS
      ) {
        const extent = localExtent(left, bottom, left + width, bottom + height)
        const usable = quality.sum(shrunk(extent, CIRCLE_RADIUS_METERS))
        for (const descriptionBox of cornerBoxes(extent, box.width, box.height)) {
          if (!clearOfCentre(descriptionBox)) continue
          const peripheralBox = placePeripheralBox(
            extent,
            descriptionBox,
            peripheral,
            clearOfCentre,
            reservedQuality,
          )
          const score =
            usable -
            reservedQuality(descriptionBox) -
            (peripheralBox
              ? reservedQuality(peripheralBox)
              : peripheral
                ? MISSING_PERIPHERAL_PENALTY
                : 0)
          if (!best || score > best.score) {
            best = {
              area: {
                paper: request.paper,
                scale: request.printScale,
                orientation,
                extent,
                descriptionBox,
                peripheralBox,
              },
              score,
            }
          }
        }
      }
    }
  }
  return best?.area ?? null
}

const shrunk = ([minX, minY, maxX, maxY]: LocalExtent, by: number) =>
  localExtent(minX + by, minY + by, maxX - by, maxY - by)

function cornerBoxes([minX, minY, maxX, maxY]: LocalExtent, width: number, height: number) {
  return [
    localExtent(minX, maxY - height, minX + width, maxY),
    localExtent(maxX - width, maxY - height, maxX, maxY),
    localExtent(minX, minY, minX + width, minY + height),
    localExtent(maxX - width, minY, maxX, minY + height),
  ]
}

interface SummedArea {
  sum(extent: LocalExtent): number
}

function summedAreaTable(
  terrain: Terrain,
  cellMeters: number,
  addWeights: (add: (position: LocalPoint, weight: number) => void) => void,
): SummedArea {
  const { minX, minY, columns: gridColumns, rows: gridRows, cellSizeMeters } = terrain.grid
  const columns = Math.ceil((gridColumns * cellSizeMeters) / cellMeters)
  const rows = Math.ceil((gridRows * cellSizeMeters) / cellMeters)
  const table = new Float64Array((columns + 1) * (rows + 1))
  const at = (column: number, row: number) => row * (columns + 1) + column
  addWeights(([x, y], weight) => {
    const column = Math.floor((x - minX) / cellMeters)
    const row = Math.floor((y - minY) / cellMeters)
    if (column < 0 || row < 0 || column >= columns || row >= rows) return
    table[at(column + 1, row + 1)]! += weight
  })
  for (let row = 1; row <= rows; row++) {
    for (let column = 1; column <= columns; column++) {
      table[at(column, row)] =
        table[at(column, row)]! +
        table[at(column - 1, row)]! +
        table[at(column, row - 1)]! -
        table[at(column - 1, row - 1)]!
    }
  }
  const clampColumn = (x: number) =>
    Math.min(columns, Math.max(0, Math.round((x - minX) / cellMeters)))
  const clampRow = (y: number) => Math.min(rows, Math.max(0, Math.round((y - minY) / cellMeters)))
  return {
    sum([x0, y0, x1, y1]) {
      const c0 = clampColumn(x0)
      const c1 = clampColumn(x1)
      const r0 = clampRow(y0)
      const r1 = clampRow(y1)
      if (c1 <= c0 || r1 <= r0) return 0
      return table[at(c1, r1)]! - table[at(c0, r1)]! - table[at(c1, r0)]! + table[at(c0, r0)]!
    },
  }
}

function summedQuality(terrain: Terrain, sites: readonly ControlSiteCandidate[]): SummedArea {
  const weights = siteAreaQuality(sites)
  return summedAreaTable(terrain, QUALITY_CELL_METERS, add =>
    sites.forEach((site, i) => add(site.position, weights[i]!)),
  )
}

function summedMappedArea(terrain: Terrain): SummedArea {
  const { grid, mappedArea } = terrain
  return summedAreaTable(terrain, grid.cellSizeMeters, add => {
    mappedArea.forEach((isMapped, index) => {
      if (isMapped) add(cellCenterOf(grid, index), 1)
    })
  })
}

export interface CourseFitRequest {
  readonly papers: readonly PaperSize[]
  readonly printScale: number
  readonly descriptionRows: number
  readonly peripheralSize?: PaperBoxSize | null
}

const FIT_STEP_METERS = 25

export function fitPrintAreaToCourse(
  terrain: Terrain,
  stops: readonly LocalPoint[],
  request: CourseFitRequest,
): PrintArea | null {
  if (stops.length === 0) return null
  const mapped = summedMappedArea(terrain)
  const box = descriptionBoxGroundSize(request.descriptionRows, request.printScale)
  const peripheral = request.peripheralSize
    ? peripheralGroundSize(request.peripheralSize, request.printScale)
    : null
  const xs = stops.map(([x]) => x)
  const ys = stops.map(([, y]) => y)
  const needed = localExtent(
    Math.min(...xs) - CIRCLE_RADIUS_METERS,
    Math.min(...ys) - CIRCLE_RADIUS_METERS,
    Math.max(...xs) + CIRCLE_RADIUS_METERS,
    Math.max(...ys) + CIRCLE_RADIUS_METERS,
  )
  const courseCentreX = (needed[0] + needed[2]) / 2
  const courseCentreY = (needed[1] + needed[3]) / 2
  const cellArea = terrain.grid.cellSizeMeters ** 2
  const cellsPerFrame = (width: number, height: number) => (width * height) / cellArea
  const isClearOfCourse = (descriptionBox: LocalExtent) =>
    stops.every(stop => !contains(descriptionBox, stop, -CIRCLE_RADIUS_METERS)) &&
    stops.every((stop, i) => i === 0 || !lineCrossesExtent(stops[i - 1]!, stop, descriptionBox))

  for (const paper of request.papers) {
    let best: { area: PrintArea; score: number } | null = null
    for (const orientation of ['portrait', 'landscape'] as const) {
      const { width, height } = printableGroundSize(paper, orientation, request.printScale)
      for (let left = needed[2] - width; left <= needed[0]; left += FIT_STEP_METERS) {
        for (let bottom = needed[3] - height; bottom <= needed[1]; bottom += FIT_STEP_METERS) {
          const extent = localExtent(left, bottom, left + width, bottom + height)
          const coverageShare = mapped.sum(extent) / cellsPerFrame(width, height)
          const offCentreShare =
            Math.hypot(left + width / 2 - courseCentreX, bottom + height / 2 - courseCentreY) /
            Math.hypot(width / 2, height / 2)
          const placementScore = coverageShare - offCentreShare
          if (best && placementScore <= best.score) continue
          const descriptionBox = cornerBoxes(extent, box.width, box.height)
            .filter(isClearOfCourse)
            .sort((a, b) => mapped.sum(a) - mapped.sum(b))[0]
          if (!descriptionBox) continue
          const peripheralBox = placePeripheralBox(
            extent,
            descriptionBox,
            peripheral,
            isClearOfCourse,
            reserved => mapped.sum(reserved),
          )
          const score =
            placementScore - (peripheral && !peripheralBox ? MISSING_PERIPHERAL_PENALTY : 0)
          if (!best || score > best.score) {
            best = {
              area: {
                paper,
                scale: request.printScale,
                orientation,
                extent,
                descriptionBox,
                peripheralBox,
              },
              score,
            }
          }
        }
      }
    }
    if (best) return best.area
  }
  return null
}

export function placeDescriptionBox(area: PrintArea, width: number, height: number): LocalExtent {
  const [minX, minY, maxX, maxY] = area.extent
  const [boxMinX, boxMinY, boxMaxX, boxMaxY] = area.descriptionBox
  const isLeft = boxMinX - minX <= maxX - boxMaxX
  const isTop = maxY - boxMaxY <= boxMinY - minY
  const left = isLeft ? minX : maxX - width
  const bottom = isTop ? maxY - height : minY
  return localExtent(left, bottom, left + width, bottom + height)
}
