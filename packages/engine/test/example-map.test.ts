import { beforeAll, describe, expect, it } from 'vitest'
import { localPoint, type LocalPoint } from '@ratamestari/core'
import { loadOcadMap } from '@ratamestari/map-ocad'
import { BLOCKED, buildCostGrid, type CostGrid } from '../src/cost-grid'
import { cellCenterOf, cellIndexOf } from '../src/raster'
import { findRoute } from '../src/router'
import { localMapExists, readLocalMap } from './local-map'

const nearestOpenPoint = (grid: CostGrid, target: LocalPoint): LocalPoint => {
  const targetIndex = cellIndexOf(grid, target)!
  let best = targetIndex
  let bestDistance = Number.POSITIVE_INFINITY
  grid.speed.forEach((speed, index) => {
    if (speed === BLOCKED) return
    const [x, y] = cellCenterOf(grid, index)
    const distance = Math.hypot(x - target[0], y - target[1])
    if (distance < bestDistance) {
      bestDistance = distance
      best = index
    }
  })
  return cellCenterOf(grid, best)
}

describe.skipIf(!localMapExists)('engine with a local map from git-ignored maps/', () => {
  let grid: CostGrid
  let centerX: number
  let centerY: number

  beforeAll(async () => {
    const map = await loadOcadMap(readLocalMap())
    grid = buildCostGrid(map.features(), map.info.extent)
    const [minX, minY, maxX, maxY] = map.info.extent
    centerX = (minX + maxX) / 2
    centerY = (minY + maxY) / 2
  })

  it('builds a cost grid with open terrain and barriers', () => {
    const blockedShare = grid.speed.filter(s => s === BLOCKED).length / grid.speed.length
    expect(blockedShare).toBeGreaterThan(0)
    expect(blockedShare).toBeLessThan(0.5)
  })

  it('finds a route across the map', () => {
    const from = nearestOpenPoint(grid, localPoint(centerX - 700, centerY - 1000))
    const to = nearestOpenPoint(grid, localPoint(centerX + 700, centerY + 1000))
    const route = findRoute(grid, from, to)!
    const straight = Math.hypot(to[0] - from[0], to[1] - from[1])
    expect(route.lengthMeters).toBeGreaterThanOrEqual(straight)
    expect(route.timeSeconds).toBeGreaterThan(0)
  })
})
