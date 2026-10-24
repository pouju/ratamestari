import { describe, expect, it } from 'vitest'
import { localExtent, localPoint, type MapAnnotation } from '@ratamestari/core'
import { PERIPHERAL_INFORMATION } from '@ratamestari/rules'
import { findPeripheralInformation, isInPeripheralBlock, peripheralLayout } from '../src/peripheral'
import { buildTerrain } from '../src/terrain'
import { SQUARE_KILOMETRE } from './fixtures'

const MAP_SCALE = 10000

const mappedWestHalf = buildTerrain([], SQUARE_KILOMETRE, { restrictToMappedArea: false })
mappedWestHalf.mappedArea.forEach((_, i) => {
  const column = i % mappedWestHalf.grid.columns
  mappedWestHalf.mappedArea[i] = column * mappedWestHalf.grid.cellSizeMeters < 600 ? 1 : 0
})

let nextIndex = 0
const annotation = (
  text: string | null,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): MapAnnotation => ({
  objectIndex: nextIndex++,
  symbolNumber: 0,
  hasTerrainMeaning: false,
  text,
  extent: localExtent(minX, minY, maxX, maxY),
})

const logoLines = [
  annotation(null, 800, 800, 900, 900),
  annotation(null, 820, 810, 880, 890),
  annotation('Vehkalahden Veikot', 790, 770, 910, 790),
]
const logoLeaves = { ...annotation(null, 830, 830, 870, 870), hasTerrainMeaning: true }
const copyright = annotation('Kopiointi kielletty.\nKartalla järjestettävästä', 700, 100, 980, 160)
const title = annotation('Leirikangas', 700, 500, 950, 560)
const contours = annotation('Käyräväli 5 m', 700, 420, 850, 450)
const placeName = annotation('Lähdesuo', 200, 200, 300, 230)
const roadInMap = { ...annotation(null, 100, 100, 400, 110), hasTerrainMeaning: true }

describe('findPeripheralInformation', () => {
  const found = findPeripheralInformation(
    [...logoLines, logoLeaves, copyright, title, contours, placeName, roadInMap],
    mappedWestHalf,
    MAP_SCALE,
  )

  it('finds the logo with its caption, borrowed map symbols and the copyright notice', () => {
    expect(found.blocks.map(block => block.kind)).toEqual(['logo', 'copyright'])
    expect([...found.blocks[0]!.objectIndices].sort()).toEqual(
      [...logoLines, logoLeaves].map(a => a.objectIndex).sort(),
    )
    expect(found.blocks[1]!.objectIndices).toEqual([copyright.objectIndex])
  })

  it('measures blocks at their size on the map paper, with padding and room for wider fonts', () => {
    const { paddingMillimetres, textSlackShare } = PERIPHERAL_INFORMATION
    const padding = 2 * paddingMillimetres
    expect(found.blocks[0]!.widthMillimetres).toBeCloseTo(12 * (1 + textSlackShare) + padding)
    expect(found.blocks[0]!.heightMillimetres).toBeCloseTo(13 + padding)
  })

  it('leaves out titles and texts inside the mapped terrain', () => {
    const used = found.blocks.flatMap(block => block.objectIndices)
    for (const left of [title, placeName, roadInMap]) expect(used).not.toContain(left.objectIndex)
  })

  it('marks the whole margin, titles too, for leaving out of the printed map', () => {
    for (const inMargin of [...logoLines, copyright, title, contours])
      expect(found.marginObjectIndices.has(inMargin.objectIndex)).toBe(true)
    for (const inMap of [placeName, roadInMap])
      expect(found.marginObjectIndices.has(inMap.objectIndex)).toBe(false)
  })

  it('tells which points lie in the logo, so its symbols give no control sites', () => {
    expect(isInPeripheralBlock(found, localPoint(850, 850))).toBe(true)
    expect(isInPeripheralBlock(found, localPoint(300, 300))).toBe(false)
  })

  it('reads the contour interval from the map texts', () => {
    expect(found.contourIntervalMetres).toBe(5)
  })
})

describe('peripheralLayout', () => {
  it('stacks the blocks above the scale line', () => {
    const { blocks } = findPeripheralInformation(
      [...logoLines, copyright],
      mappedWestHalf,
      MAP_SCALE,
    )
    const layout = peripheralLayout(blocks)
    const { gapMillimetres, scaleLineMillimetres } = PERIPHERAL_INFORMATION
    expect(layout.blockOffsetsMillimetres[1]![1]).toBeCloseTo(
      blocks[0]!.heightMillimetres + gapMillimetres,
    )
    expect(layout.heightMillimetres).toBeCloseTo(
      layout.scaleLineTopMillimetres + scaleLineMillimetres,
    )
    expect(layout.widthMillimetres).toBeGreaterThanOrEqual(blocks[1]!.widthMillimetres)
  })
})
