import { describe, expect, it } from 'vitest'
import { loadOcadMap } from '@ratamestari/map-ocad'
import { BLOCKED, buildCostGrid } from '../src/cost-grid'
import { localMapExists, readLocalMap } from './local-map'

describe.skipIf(!localMapExists)('engine with git-ignored maps/example.ocd', () => {
  it('builds a cost grid with open terrain and barriers', async () => {
    const map = await loadOcadMap(readLocalMap())
    const grid = buildCostGrid(map.features(), map.info.extent)
    const blockedShare = grid.speed.filter(s => s === BLOCKED).length / grid.speed.length
    expect(blockedShare).toBeGreaterThan(0)
    expect(blockedShare).toBeLessThan(0.5)
  })
})
