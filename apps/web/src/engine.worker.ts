import * as Comlink from 'comlink'
import type { LocalPoint } from '@ratamestari/core'
import { buildCostGrid, findRoute, type CostGrid, type Route } from '@ratamestari/engine'
import { loadOcadMap } from '@ratamestari/map-ocad'
import type { CostGridSnapshot } from './cost-map-image'

let grid: CostGrid | null = null

const engine = {
  async loadMap(bytes: Uint8Array): Promise<void> {
    const map = await loadOcadMap(bytes)
    grid = buildCostGrid(map.features(), map.info.extent)
  },

  route(from: LocalPoint, to: LocalPoint): Route | null {
    if (!grid) throw new Error('No map loaded in the engine')
    return findRoute(grid, from, to)
  },

  costGrid(): CostGridSnapshot {
    if (!grid) throw new Error('No map loaded in the engine')
    const { minX, minY, cellSizeMeters, columns, rows } = grid
    return { frame: { minX, minY, cellSizeMeters, columns, rows }, speed: grid.speed }
  },
}

export type EngineApi = typeof engine

Comlink.expose(engine)
