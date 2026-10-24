import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { Resvg } from '@resvg/resvg-js'
import { DOMImplementation, XMLSerializer } from 'xmldom'
import { localPoint, type LocalPoint } from '@ratamestari/core'
import {
  buildTerrain,
  cellCenterOf,
  evaluateLeg,
  findControlSites,
  findPeripheralInformation,
  isInPeripheralBlock,
  peripheralLayout,
  setCourseOnPaper,
  type PaperChoice,
  type Course,
} from '@ratamestari/engine'
import { courseDataXml, describeControl, descriptionSheet, descriptionText } from '@ratamestari/iof'
import { loadOcadMap } from '@ratamestari/map-ocad'
import { printPageSvg } from '@ratamestari/print'
import {
  courseRequestSchema,
  courseTargetFor,
  printScaleFor,
  printScaleSchema,
  type CourseRequest,
} from '@ratamestari/rules'

const MAPS_FOLDER = 'maps'
const RENDERS_FOLDER = join(MAPS_FOLDER, 'renders')
const IMAGE_WIDTH_PIXELS = 1800

const { values } = parseArgs({
  options: {
    map: { type: 'string' },
    level: { type: 'string', default: 'finnishChampionship' },
    format: { type: 'string', default: 'long' },
    class: { type: 'string', default: 'H21' },
    letter: { type: 'string', default: 'A' },
    seed: { type: 'string', default: '1' },
    pace: { type: 'string', default: '5:00' },
    centre: { type: 'string' },
    out: { type: 'string' },
    legs: { type: 'boolean', default: false },
    xml: { type: 'string' },
    paper: { type: 'string', default: 'auto' },
    scale: { type: 'string', default: 'auto' },
  },
})

const mapPath = values.map ?? firstMapIn(MAPS_FOLDER)
const [, sex = 'H', age = '21'] = /^([HD])(\d+)$/.exec(values.class) ?? []
const request: CourseRequest = courseRequestSchema.parse({
  eventLevel: values.level,
  format: values.format,
  sex,
  ageClass: Number(age),
  skillLetter: values.letter,
})
const [paceMinutes = '5', paceSeconds = '00'] = values.pace.split(':')
const paceSecondsPerKm = Number(paceMinutes) * 60 + Number(paceSeconds)
const seed = Number(values.seed)

const map = await loadOcadMap(new Uint8Array(readFileSync(mapPath)))
const features = map.features()
const terrain = buildTerrain(features, map.info.extent)
const peripheral = findPeripheralInformation(map.annotations(), terrain, map.info.scale)
const sites = findControlSites(features, terrain).filter(
  site => describeControl(site) !== null && !isInPeripheralBlock(peripheral, site.position),
)
const target = courseTargetFor(request)
if (!target) throw new Error('No winning time for this class and event')

const centre = values.centre ? parsePoint(values.centre) : middleOfMappedArea()
const started = performance.now()
const course = setCourseOnPaper(
  terrain,
  sites,
  {
    target,
    format: request.format,
    printScale: printScaleFor(
      values.scale === 'auto' ? 'auto' : printScaleSchema.parse(Number(values.scale)),
      request.format,
    ),
    competitionCentre: centre,
    seed,
    paceSecondsPerKm,
    peripheralSize: peripheralLayout(peripheral.blocks),
  },
  values.paper as PaperChoice,
)
if (!course) throw new Error('No course found')
const searchSeconds = (performance.now() - started) / 1000

printSummary(course, searchSeconds)
if (course.printArea) {
  const { paper, orientation, scale } = course.printArea
  console.log(`paper: ${paper} ${orientation} 1:${scale}`)
}
if (values.legs) printLegs(course)
const sheet = descriptionSheet(course, {
  title: `${request.format} ${values.class}${values.letter}`,
  courseName: `${values.class}${values.letter}`,
})
printDescriptions()
if (values.xml) {
  const className = `${values.class}${values.letter === 'A' ? '' : values.letter}`
  writeFileSync(
    values.xml,
    courseDataXml({
      eventName: sheet.title,
      className,
      course,
      sheet,
      map: map.info,
      createdAt: new Date(),
    }),
  )
  console.log(`Wrote ${values.xml}`)
}

const outPath =
  values.out ??
  join(RENDERS_FOLDER, `${request.format}-${values.class}${values.letter}-seed${seed}.png`)
mkdirSync(RENDERS_FOLDER, { recursive: true })
writeFileSync(outPath, renderPng(course))
console.log(`Wrote ${outPath}`)

function firstMapIn(folder: string): string {
  const name = readdirSync(folder)
    .filter(n => n.toLowerCase().endsWith('.ocd'))
    .sort()[0]
  if (!name) throw new Error(`No .ocd map in ${folder}/`)
  return join(folder, name)
}

function parsePoint(text: string): LocalPoint {
  const [x = 0, y = 0] = text.split(',').map(Number)
  return localPoint(x, y)
}

function middleOfMappedArea(): LocalPoint {
  const mapped = [...terrain.mappedArea.keys()].filter(i => terrain.mappedArea[i])
  return cellCenterOf(terrain.grid, mapped[Math.floor(mapped.length / 2)]!)
}

function printSummary(c: Course, seconds: number) {
  const minutes = (s: number) => (s / 60).toFixed(1)
  console.log(
    `${request.format} ${values.class}${values.letter} seed ${seed}: ${c.controls.length} controls, ` +
      `${minutes(c.estimatedSeconds)}/${minutes(c.targetSeconds)} min, ` +
      `${((c.lengthMeters ?? 0) / 1000).toFixed(1)} km, search ${seconds.toFixed(1)} s`,
  )
  console.log(`legs (min): ${c.legSeconds.map(minutes).join(' ')}`)
  console.log(`difficulty: ${c.controlDifficulties.join('')}`)
  console.log(`problems: ${JSON.stringify(c.problems)}`)
  const terms = Object.entries(c.breakdown.terms)
    .filter(([, term]) => Math.abs(term.contribution) >= 0.5)
    .sort(([, a], [, b]) => b.contribution - a.contribution)
  for (const [name, term] of terms) {
    console.log(`  ${term.contribution.toFixed(1).padStart(7)}  ${name}: ${term.note}`)
  }
}

function printDescriptions() {
  const text = (d: Parameters<typeof descriptionText>[0] | null) => (d ? descriptionText(d) : '?')
  console.log(`climb: ${sheet.climbMeters} m`)
  console.log(`  S  ${text(sheet.start)}`)
  for (const row of sheet.controls)
    console.log(`  ${row.number}  ${row.code}  ${text(row.description)}`)
}

function printLegs(c: Course) {
  const stops = [c.start.position, ...c.controls.map(s => s.position), c.finish]
  let routeChoiceLegs = 0
  for (let i = 1; i < stops.length; i++) {
    const leg = evaluateLeg(terrain, stops[i - 1]!, stops[i]!, { paceSecondsPerKm })
    if (!leg) continue
    if (leg.hasRouteChoice) routeChoiceLegs++
    console.log(
      `  leg ${i}: ${Math.round(leg.straightMeters)} m, ratio ${leg.lengthRatio.toFixed(2)}, ` +
        `deviation ${Math.round(leg.maxDeviationMeters)} m, route choice ${leg.hasRouteChoice}`,
    )
  }
  console.log(`route-choice legs: ${routeChoiceLegs}/${stops.length - 1}`)
}

function renderPng(c: Course): Buffer {
  const doc = new DOMImplementation().createDocument(null, 'svg', null) as unknown as Document
  const mapSvg = new XMLSerializer().serializeToString(
    map.renderSvg(doc, i => !peripheral.marginObjectIndices.has(i)) as unknown as Node,
  )
  const blocks = peripheral.blocks.map(block => ({
    block,
    svg: new XMLSerializer().serializeToString(
      map.renderSvg(doc, i => block.objectIndices.includes(i)) as unknown as Node,
    ),
  }))
  const scale = c.printArea?.scale ?? map.info.scale
  const contours = peripheral.contourIntervalMetres
  const scaleLine =
    `1:${scale.toLocaleString('fi-FI')}` +
    (contours === null ? '' : ` · contour interval ${contours} m`)
  const page = printPageSvg({
    mapSvg,
    mapScale: map.info.scale,
    course: c,
    sheet,
    peripheral: { blocks, scaleLine },
  })
  if (!page) throw new Error('The course has no print area')
  return new Resvg(page.svg, {
    fitTo: { mode: 'width', value: IMAGE_WIDTH_PIXELS },
    background: 'white',
    font: { loadSystemFonts: true },
  })
    .render()
    .asPng()
}
