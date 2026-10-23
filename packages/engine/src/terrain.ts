import type { LocalExtent, MapFeature } from '@ratamestari/core'
import { DEFAULT_CONTOUR_INTERVAL_METERS } from '@ratamestari/rules'
import { buildContourIndex, type ContourIndex } from './contours'
import { BLOCKED, buildCostGrid, type CostGrid, type CostGridOptions } from './cost-grid'
import { mappedAreaMask } from './mapped-area'

export interface Terrain {
  readonly grid: CostGrid
  readonly contours: ContourIndex
  readonly contourIntervalMeters: number
  readonly mappedArea: Uint8Array
}

export interface TerrainOptions extends CostGridOptions {
  readonly contourIntervalMeters?: number
  readonly restrictToMappedArea?: boolean
}

export function buildTerrain(
  features: readonly MapFeature[],
  extent: LocalExtent,
  {
    contourIntervalMeters = DEFAULT_CONTOUR_INTERVAL_METERS.value,
    restrictToMappedArea = true,
    ...gridOptions
  }: TerrainOptions = {},
): Terrain {
  const grid = buildCostGrid(features, extent, gridOptions)
  const mappedArea = restrictToMappedArea
    ? mappedAreaMask(features, grid)
    : new Uint8Array(grid.speed.length).fill(1)
  mappedArea.forEach((isMapped, i) => {
    if (!isMapped) grid.speed[i] = BLOCKED
  })
  return {
    grid,
    contours: buildContourIndex(features, extent),
    contourIntervalMeters,
    mappedArea,
  }
}
