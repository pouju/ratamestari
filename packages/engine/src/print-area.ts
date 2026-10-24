import { localExtent, localPoint, type LocalExtent, type LocalPoint } from '@ratamestari/core'
import { CONTROL_CIRCLE, DESCRIPTION_BOX, PAPER, type PaperSize } from '@ratamestari/rules'
import type { ControlSiteCandidate } from './control-sites'
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
}

export interface PrintAreaRequest {
  readonly paper: PaperSize
  readonly printScale: number
  readonly competitionCentre: LocalPoint
  readonly descriptionRows: number
}

const QUALITY_CELL_METERS = 25
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

export function isUsableInPrintArea(position: LocalPoint, area: PrintArea): boolean {
  return (
    contains(area.extent, position, CIRCLE_RADIUS_METERS) &&
    !contains(area.descriptionBox, position, -CIRCLE_RADIUS_METERS)
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
          if (contains(descriptionBox, request.competitionCentre, -FINISH_CLEARANCE_METERS))
            continue
          const score = usable - quality.sum(shrunk(descriptionBox, -CIRCLE_RADIUS_METERS))
          if (!best || score > best.score) {
            best = {
              area: {
                paper: request.paper,
                scale: request.printScale,
                orientation,
                extent,
                descriptionBox,
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

function summedQuality(terrain: Terrain, sites: readonly ControlSiteCandidate[]) {
  const { minX, minY, columns: gridColumns, rows: gridRows, cellSizeMeters } = terrain.grid
  const columns = Math.ceil((gridColumns * cellSizeMeters) / QUALITY_CELL_METERS)
  const rows = Math.ceil((gridRows * cellSizeMeters) / QUALITY_CELL_METERS)
  const table = new Float64Array((columns + 1) * (rows + 1))
  const at = (column: number, row: number) => row * (columns + 1) + column
  const weights = siteAreaQuality(sites)
  sites.forEach((site, i) => {
    const column = Math.floor((site.position[0] - minX) / QUALITY_CELL_METERS)
    const row = Math.floor((site.position[1] - minY) / QUALITY_CELL_METERS)
    if (column < 0 || row < 0 || column >= columns || row >= rows) return
    table[at(column + 1, row + 1)]! += weights[i]!
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
    Math.min(columns, Math.max(0, Math.round((x - minX) / QUALITY_CELL_METERS)))
  const clampRow = (y: number) =>
    Math.min(rows, Math.max(0, Math.round((y - minY) / QUALITY_CELL_METERS)))
  return {
    sum([x0, y0, x1, y1]: LocalExtent): number {
      const c0 = clampColumn(x0)
      const c1 = clampColumn(x1)
      const r0 = clampRow(y0)
      const r1 = clampRow(y1)
      if (c1 <= c0 || r1 <= r0) return 0
      return table[at(c1, r1)]! - table[at(c0, r1)]! - table[at(c1, r0)]! + table[at(c0, r0)]!
    },
  }
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
