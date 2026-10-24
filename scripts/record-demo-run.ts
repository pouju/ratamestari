import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { Resvg } from '@resvg/resvg-js'
import { DOMImplementation, XMLSerializer } from 'xmldom'
import type { LocalPoint } from '@ratamestari/core'
import {
  buildTerrain,
  cellCenterOf,
  findControlSites,
  findPeripheralInformation,
  isInPeripheralBlock,
  isUsableInPrintArea,
  peripheralLayout,
  placeDescriptionBox,
  setCourseOnPaper,
} from '@ratamestari/engine'
import { describeControl, descriptionSheet, renderDescriptionSheet } from '@ratamestari/iof'
import { loadOcadMap } from '@ratamestari/map-ocad'
import { printPageSvg } from '@ratamestari/print'
import { courseTargetFor, PAPER, printScaleFor, type CourseRequest } from '@ratamestari/rules'

// Records a real engine run on the sample map for the landing page's hero: the course and a
// spread of candidate sites in page units, and the print page without the course as background.

const { values } = parseArgs({
  options: {
    map: { type: 'string', default: 'apps/web/public/sample/leirikangas-sample.ocd' },
    out: { type: 'string', default: 'apps/web/src/landing/sample-run.json' },
    background: { type: 'string', default: 'apps/web/src/landing/sample-page.png' },
    seed: { type: 'string', default: '1' },
  },
})

const REQUEST: CourseRequest = {
  eventLevel: 'national',
  format: 'middle',
  sex: 'D',
  ageClass: 10,
  skillLetter: 'A',
}
const PACE_SECONDS_PER_KM = 300
const PAGE_UNITS_PER_MILLIMETRE = 600 / 210
const SHOWN_SITES = 60
const BACKGROUND_WIDTH_PIXELS = 1200
const CROP_PADDING_MILLIMETRES = 4

const map = await loadOcadMap(new Uint8Array(readFileSync(values.map)))
const features = map.features()
const terrain = buildTerrain(features, map.info.extent)
const peripheral = findPeripheralInformation(map.annotations(), terrain, map.info.scale)
const sites = findControlSites(features, terrain).filter(
  site => describeControl(site) !== null && !isInPeripheralBlock(peripheral, site.position),
)
const mapped = [...terrain.mappedArea.keys()].filter(i => terrain.mappedArea[i])
const centre = cellCenterOf(terrain.grid, mapped[Math.floor(mapped.length / 2)]!)

const course = setCourseOnPaper(
  terrain,
  sites,
  {
    target: courseTargetFor(REQUEST)!,
    format: REQUEST.format,
    printScale: printScaleFor('auto', REQUEST.format),
    competitionCentre: centre,
    seed: Number(values.seed),
    paceSecondsPerKm: PACE_SECONDS_PER_KM,
    peripheralSize: peripheralLayout(peripheral.blocks),
  },
  'auto',
)
const area = course?.printArea
if (!course || !area) throw new Error('No course found on the sample map')

const sheet = descriptionSheet(course, { title: '', courseName: '' })
const margin = PAPER.printMarginMillimetres
const [minX, , , maxY] = area.extent
const toPageMillimetres = ([x, y]: LocalPoint): [number, number] => [
  margin + ((x - minX) * 1000) / area.scale,
  margin + ((maxY - y) * 1000) / area.scale,
]

// The sample fills only part of the paper, so the hero shows the box around what it draws: the
// candidate sites, the course and the description box. Nothing moves; the page is only cropped.
const onPage = sites.filter(site => isUsableInPrintArea(site.position, area))
const described = renderDescriptionSheet(sheet)
const metresPerMillimetre = area.scale / 1000
const [boxLeft, boxBottom, boxRight, boxTop] = placeDescriptionBox(
  area,
  described.widthMillimetres * metresPerMillimetre,
  described.heightMillimetres * metresPerMillimetre,
)
const descriptionCorners = [
  toPageMillimetres([boxLeft, boxTop] as unknown as LocalPoint),
  toPageMillimetres([boxRight, boxBottom] as unknown as LocalPoint),
]
const drawn = [
  ...onPage.map(site => toPageMillimetres(site.position)),
  toPageMillimetres(course.start.position),
  ...course.controls.map(site => toPageMillimetres(site.position)),
  toPageMillimetres(course.finish),
  ...descriptionCorners,
]
const [shortSide, longSide] = PAPER.sizesMillimetres[area.paper]
const [pageWidth, pageHeight] =
  area.orientation === 'portrait' ? [shortSide, longSide] : [longSide, shortSide]
const crop = {
  left: Math.max(0, Math.min(...drawn.map(([x]) => x)) - CROP_PADDING_MILLIMETRES),
  top: Math.max(0, Math.min(...drawn.map(([, y]) => y)) - CROP_PADDING_MILLIMETRES),
  right: Math.min(pageWidth, Math.max(...drawn.map(([x]) => x)) + CROP_PADDING_MILLIMETRES),
  bottom: Math.min(pageHeight, Math.max(...drawn.map(([, y]) => y)) + CROP_PADDING_MILLIMETRES),
}
const toPage = (point: LocalPoint) => {
  const [x, y] = toPageMillimetres(point)
  return [
    round((x - crop.left) * PAGE_UNITS_PER_MILLIMETRE),
    round((y - crop.top) * PAGE_UNITS_PER_MILLIMETRE),
  ] as const
}

const every = Math.max(1, Math.floor(onPage.length / SHOWN_SITES))
const [descriptionTopLeft, descriptionBottomRight] = descriptionCorners as [
  [number, number],
  [number, number],
]
const run = {
  page: [crop.right - crop.left, crop.bottom - crop.top].map(side =>
    round(side * PAGE_UNITS_PER_MILLIMETRE),
  ),
  centre: toPage(course.finish),
  sites: onPage.filter((_, i) => i % every === 0).map(site => toPage(site.position)),
  start: toPage(course.start.position),
  controls: course.controls.map(site => toPage(site.position)),
  finish: toPage(course.finish),
  descriptionBox: [
    round((descriptionTopLeft[0] - crop.left) * PAGE_UNITS_PER_MILLIMETRE),
    round((descriptionTopLeft[1] - crop.top) * PAGE_UNITS_PER_MILLIMETRE),
    round((descriptionBottomRight[0] - descriptionTopLeft[0]) * PAGE_UNITS_PER_MILLIMETRE),
    round((descriptionBottomRight[1] - descriptionTopLeft[1]) * PAGE_UNITS_PER_MILLIMETRE),
  ],
  siteCount: onPage.length,
  lengthMeters: Math.round(course.lengthMeters ?? 0),
  climbMeters: Math.round(course.climbMeters ?? 0),
}
writeFileSync(values.out, `${JSON.stringify(run, null, 2)}\n`)

const document = new DOMImplementation().createDocument(null, 'svg', null) as unknown as Document
const svgOf = (includesObject: (objectIndex: number) => boolean) =>
  new XMLSerializer().serializeToString(map.renderSvg(document, includesObject) as unknown as Node)
const page = printPageSvg({
  mapSvg: svgOf(i => !peripheral.marginObjectIndices.has(i)),
  mapScale: map.info.scale,
  course,
  sheet,
  peripheral: {
    blocks: peripheral.blocks.map(block => ({
      block,
      svg: svgOf(i => block.objectIndices.includes(i)),
    })),
    scaleLine:
      `1:${area.scale.toLocaleString('en')}` +
      (peripheral.contourIntervalMetres === null
        ? ''
        : ` · contour interval ${peripheral.contourIntervalMetres} m`),
  },
  withoutCourse: true,
})!
const cropWidth = crop.right - crop.left
const cropHeight = crop.bottom - crop.top
const croppedSvg = page.svg.replace(
  /width="[\d.]+mm" height="[\d.]+mm" viewBox="[^"]*"/,
  `width="${cropWidth}mm" height="${cropHeight}mm"` +
    ` viewBox="${crop.left} ${crop.top} ${cropWidth} ${cropHeight}"`,
)
writeFileSync(
  values.background,
  new Resvg(croppedSvg, {
    fitTo: { mode: 'width', value: BACKGROUND_WIDTH_PIXELS },
    background: 'white',
    font: { loadSystemFonts: true },
  })
    .render()
    .asPng(),
)
console.log(
  `Wrote ${values.out} and ${values.background}: ${run.controls.length} controls, ` +
    `${(run.lengthMeters / 1000).toFixed(1)} km, ${run.siteCount} sites on the page`,
)

function round(value: number) {
  return Math.round(value * 10) / 10
}
