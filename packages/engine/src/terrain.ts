import type { LocalExtent, MapFeature } from '@ratamestari/core'
import { DEFAULT_CONTOUR_INTERVAL_METERS } from '@ratamestari/rules'
import { buildContourIndex, type ContourIndex } from './contours'
import { buildCostGrid, type CostGrid, type CostGridOptions } from './cost-grid'

export interface Terrain {
  readonly grid: CostGrid
  readonly contours: ContourIndex
  readonly contourIntervalMeters: number
}

export interface TerrainOptions extends CostGridOptions {
  readonly contourIntervalMeters?: number
}

export const buildTerrain = (
  features: readonly MapFeature[],
  extent: LocalExtent,
  {
    contourIntervalMeters = DEFAULT_CONTOUR_INTERVAL_METERS.value,
    ...gridOptions
  }: TerrainOptions = {},
): Terrain => ({
  grid: buildCostGrid(features, extent, gridOptions),
  contours: buildContourIndex(features),
  contourIntervalMeters,
})
