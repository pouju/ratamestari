import * as Comlink from 'comlink'
import type { LocalPoint } from '@ratamestari/core'
import { buildTerrain, evaluateLeg, type LegEvaluation, type Terrain } from '@ratamestari/engine'
import { loadOcadMap } from '@ratamestari/map-ocad'
import type { CostGridSnapshot } from './cost-map-image'

let terrain: Terrain | null = null

const engine = {
  async loadMap(bytes: Uint8Array): Promise<void> {
    const map = await loadOcadMap(bytes)
    terrain = buildTerrain(map.features(), map.info.extent)
  },

  evaluateLeg(from: LocalPoint, to: LocalPoint): LegEvaluation | null {
    if (!terrain) throw new Error('No map loaded in the engine')
    return evaluateLeg(terrain, from, to)
  },

  costGrid(): CostGridSnapshot {
    if (!terrain) throw new Error('No map loaded in the engine')
    const { minX, minY, cellSizeMeters, columns, rows, speed } = terrain.grid
    return { frame: { minX, minY, cellSizeMeters, columns, rows }, speed }
  },
}

export type EngineApi = typeof engine

Comlink.expose(engine)
