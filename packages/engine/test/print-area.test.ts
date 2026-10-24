import { describe, expect, it } from 'vitest'
import { localExtent, localPoint } from '@ratamestari/core'
import type { ControlSiteCandidate } from '../src/control-sites'
import {
  isUsableInPrintArea,
  lineCrossesExtent,
  placeDescriptionBox,
  planPrintArea,
  printableGroundSize,
} from '../src/print-area'
import { buildTerrain } from '../src/terrain'
import { SQUARE_KILOMETRE } from './fixtures'

const site = (x: number, y: number, id: number): ControlSiteCandidate => ({
  id,
  position: localPoint(x, y),
  isomCode: '204',
  symbolNumber: 204000,
  placement: 'point',
  contourForm: null,
  distanceToLeadingFeatureMeters: 100,
  leadingFeatureDistance: 'far',
  inSlowTerrain: false,
  technicalDifficulty: 4,
  orientation: null,
  similarFeatureOffsets: [],
  flagSide: 'side',
})

const clusterAround = (cx: number, cy: number, firstId: number) =>
  Array.from({ length: 25 }, (_, i) =>
    site(cx + (i % 5) * 15 - 30, cy + Math.floor(i / 5) * 15 - 30, firstId + i),
  )

const terrain = buildTerrain([], SQUARE_KILOMETRE, { restrictToMappedArea: false })
const SMALL_SCALE_FOR_A_SMALL_MAP = 2000
const centre = localPoint(500, 500)

describe('planPrintArea', () => {
  it('frames the paper around the competition centre, towards the best terrain', () => {
    const sites = [...clusterAround(850, 500, 0), ...clusterAround(150, 900, 25).slice(0, 5)]
    const area = planPrintArea(terrain, sites, {
      paper: 'A4',
      printScale: SMALL_SCALE_FOR_A_SMALL_MAP,
      competitionCentre: centre,
      descriptionRows: 10,
    })!
    const [minX, minY, maxX, maxY] = area.extent
    const { width, height } = printableGroundSize(
      'A4',
      area.orientation,
      SMALL_SCALE_FOR_A_SMALL_MAP,
    )
    expect(maxX - minX).toBeCloseTo(width)
    expect(maxY - minY).toBeCloseTo(height)
    expect(isUsableInPrintArea(localPoint(850, 500), area)).toBe(true)
    expect(minX < 500 && maxX > 500 && minY < 500 && maxY > 500).toBe(true)
  })

  it('puts the description box in a corner away from the good sites and the finish', () => {
    const sites = clusterAround(800, 700, 0)
    const area = planPrintArea(terrain, sites, {
      paper: 'A4',
      printScale: SMALL_SCALE_FOR_A_SMALL_MAP,
      competitionCentre: centre,
      descriptionRows: 10,
    })!
    expect(sites.every(s => isUsableInPrintArea(s.position, area))).toBe(true)
    const [bx0, by0, bx1, by1] = area.descriptionBox
    expect(500 >= bx0 && 500 <= bx1 && 500 >= by0 && 500 <= by1).toBe(false)
  })
})

describe('lineCrossesExtent', () => {
  const box = localExtent(100, 100, 200, 200)
  it('finds lines that pass through or end in the box', () => {
    expect(lineCrossesExtent(localPoint(0, 150), localPoint(300, 150), box)).toBe(true)
    expect(lineCrossesExtent(localPoint(150, 150), localPoint(300, 300), box)).toBe(true)
    expect(lineCrossesExtent(localPoint(0, 0), localPoint(300, 0), box)).toBe(false)
  })
})

describe('placeDescriptionBox', () => {
  it('aligns the box to the paper corner of its reserved space', () => {
    const area = {
      paper: 'A4',
      scale: 10000,
      orientation: 'portrait',
      extent: localExtent(0, 0, 400, 600),
      descriptionBox: localExtent(300, 0, 400, 300),
    } as const
    expect(placeDescriptionBox(area, 100, 200)).toEqual([300, 0, 400, 200])
  })
})
