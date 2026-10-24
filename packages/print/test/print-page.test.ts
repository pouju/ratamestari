import { describe, expect, it } from 'vitest'
import { localExtent, localPoint } from '@ratamestari/core'
import type { ControlSiteCandidate, Course } from '@ratamestari/engine'
import { descriptionSheet } from '@ratamestari/iof'
import { printPageSvg } from '../src/print-page'

const site = (x: number, y: number): ControlSiteCandidate => ({
  id: 0,
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
  flagSide: null,
})

const course: Course = {
  seed: 1,
  start: site(500, 500),
  controls: [site(1000, 1500), site(1500, 800)],
  finish: localPoint(600, 450),
  controlDifficulties: [4, 4],
  flagSides: [null, null],
  legSeconds: [100, 100, 100],
  estimatedSeconds: 300,
  targetSeconds: 300,
  lengthMeters: 2500,
  climbMeters: 20,
  problems: {
    spacing: 0,
    acuteAngleWarnings: 0,
    acuteAngleNotes: 0,
    difficultyOutsideRange: 0,
    courseLineCrossings: 0,
    courseLinesThroughControls: 0,
    courseLinesOutsideMap: 0,
    courseLinesOverDescriptions: 0,
    overlappingCircles: 0,
    finalLegTooLong: false,
    winningTimeOutsideRange: false,
    controlsWithoutFeature: 0,
  },
  printArea: {
    paper: 'A4',
    scale: 10000,
    orientation: 'portrait',
    extent: localExtent(0, 0, 2000, 2870),
    descriptionBox: localExtent(1520, 0, 2000, 1560),
    peripheralBox: null,
  },
  findings: [],
  breakdown: { total: 0, terms: {} } as unknown as Course['breakdown'],
  score: 0,
}

const MAP_SVG =
  '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 -40000 30000 40000"><path d="M0 0"/></svg>'

const page = printPageSvg({
  mapSvg: MAP_SVG,
  mapScale: 15000,
  course,
  sheet: descriptionSheet(course, { title: 'Middle distance', courseName: 'H21' }),
})!

describe('printPageSvg', () => {
  it('makes a page the size of the paper', () => {
    expect(page.widthMillimetres).toBe(210)
    expect(page.heightMillimetres).toBe(297)
    expect(page.svg).toMatch(/^<svg [^>]*width="210mm" height="297mm" viewBox="0 0 210 297"/)
  })

  it('places the map inside the margins, showing only the print area at the print scale', () => {
    expect(page.svg).toContain(
      '<svg xmlns="http://www.w3.org/2000/svg" x="5" y="5" width="200" height="287" viewBox="0 -59133.333 13333.333 19133.333" preserveAspectRatio="none">',
    )
    expect(page.svg).not.toContain('<?xml')
  })

  it('draws ISOM course symbols enlarged for 1:10 000', () => {
    expect(page.svg).toContain('stroke-width="0.525"')
    expect(page.svg).toMatch(/<circle cx="105" cy="142" r="3.75"/)
    expect(page.svg).toContain('>1</text>')
    expect(page.svg).toContain('>2</text>')
  })

  it('puts the description box in its corner of the paper', () => {
    expect(page.svg).toMatch(
      /<svg xmlns="http:\/\/www.w3.org\/2000\/svg" x="157" y="[\d.]+" width="48"/,
    )
  })
})

describe('printPageSvg with peripheral information', () => {
  const block = {
    kind: 'logo' as const,
    objectIndices: [0],
    extent: localExtent(0, 0, 300, 150),
    widthMillimetres: 20,
    heightMillimetres: 10,
  }
  const withPeripheral = printPageSvg({
    mapSvg: MAP_SVG,
    mapScale: 15000,
    course: {
      ...course,
      printArea: { ...course.printArea!, peripheralBox: localExtent(0, 0, 450, 160) },
    },
    sheet: descriptionSheet(course, { title: 'Middle distance', courseName: 'H21' }),
    peripheral: { blocks: [{ block, svg: MAP_SVG }], scaleLine: '1:10 000 · contour interval 5 m' },
  })!

  it('draws the logo at its size on the map paper in the reserved corner', () => {
    expect(withPeripheral.svg).toContain(
      'x="5" y="276" width="20" height="10" viewBox="0 -41000 2000 1000"',
    )
  })

  it('writes the scale line under it', () => {
    expect(withPeripheral.svg).toMatch(
      /<text x="5" y="[\d.]+"[^>]*>1:10 000 · contour interval 5 m</,
    )
  })
})
