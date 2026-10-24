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
  placeDescriptionBox,
  setCourseOnPaper,
  type PaperChoice,
  type Course,
} from '@ratamestari/engine'
import {
  courseDataXml,
  describeControl,
  descriptionSheet,
  descriptionText,
  renderDescriptionSheet,
} from '@ratamestari/iof'
import { loadOcadMap } from '@ratamestari/map-ocad'
import { courseRequestSchema, courseTargetFor, type CourseRequest } from '@ratamestari/rules'

const MAPS_FOLDER = 'maps'
const RENDERS_FOLDER = join(MAPS_FOLDER, 'renders')
const ISOM_COURSE_SYMBOL_SCALE = 15000
const HUNDREDTHS_MM_PER_METER = 100 * 1000
const PURPLE = 'rgb(190, 30, 180)'
const IMAGE_WIDTH_PIXELS = 1800
const CROP_MARGIN_METERS = 300

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
const sites = findControlSites(features, terrain).filter(site => describeControl(site) !== null)
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
    mapScale: map.info.scale,
    competitionCentre: centre,
    seed,
    paceSecondsPerKm,
  },
  values.paper as PaperChoice,
)
if (!course) throw new Error('No course found')
const searchSeconds = (performance.now() - started) / 1000

printSummary(course, searchSeconds)
if (course.printArea) {
  console.log(`paper: ${course.printArea.paper} ${course.printArea.orientation}`)
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
  const svg = map.renderSvg(doc)
  const [, viewMinY = 0, , viewHeight = 0] = (svg.getAttribute('viewBox') ?? '')
    .split(/[ ,]+/)
    .map(Number)
  const flipOffset = viewMinY + (viewMinY + viewHeight)
  const toSvg = ([x, y]: LocalPoint): [number, number] => {
    const paperX = (x * HUNDREDTHS_MM_PER_METER) / map.info.scale
    const paperY = (y * HUNDREDTHS_MM_PER_METER) / map.info.scale
    return [paperX, flipOffset - paperY]
  }
  const mm = (value: number) => (value * 100 * ISOM_COURSE_SYMBOL_SCALE) / map.info.scale
  const stops = [c.start.position, ...c.controls.map(s => s.position), c.finish]

  const overlay: string[] = []
  const lineWidth = mm(0.35)
  const circle = (p: LocalPoint, diameterMm: number) => {
    const [cx, cy] = toSvg(p)
    overlay.push(
      `<circle cx="${cx}" cy="${cy}" r="${mm(diameterMm) / 2}" fill="none" stroke="${PURPLE}" stroke-width="${lineWidth}"/>`,
    )
  }
  const [sx, sy] = toSvg(stops[0]!)
  const [fx, fy] = toSvg(stops[1]!)
  const heading = Math.atan2(fy - sy, fx - sx)
  const triangleRadius = mm(6) / Math.sqrt(3)
  const corners = [0, 120, 240]
    .map(d => heading + (d * Math.PI) / 180)
    .map(a => `${sx + triangleRadius * Math.cos(a)},${sy + triangleRadius * Math.sin(a)}`)
  overlay.push(
    `<polygon points="${corners.join(' ')}" fill="none" stroke="${PURPLE}" stroke-width="${lineWidth}"/>`,
  )
  c.controls.forEach((site, i) => {
    circle(site.position, 5)
    const [cx, cy] = toSvg(site.position)
    overlay.push(
      `<text x="${cx + mm(3)}" y="${cy - mm(2.5)}" font-family="sans-serif" font-size="${mm(4)}" fill="${PURPLE}" stroke="white" stroke-width="${mm(0.4)}" paint-order="stroke">${i + 1}</text>`,
    )
  })
  circle(c.finish, 4)
  circle(c.finish, 6)
  for (let i = 1; i < stops.length; i++) {
    const [ax, ay] = toSvg(stops[i - 1]!)
    const [bx, by] = toSvg(stops[i]!)
    const length = Math.hypot(bx - ax, by - ay)
    const trimStart = i === 1 ? triangleRadius + mm(0.5) : mm(3)
    const trimEnd = i === stops.length - 1 ? mm(3.5) : mm(3)
    if (length <= trimStart + trimEnd) continue
    const ux = (bx - ax) / length
    const uy = (by - ay) / length
    overlay.push(
      `<line x1="${ax + ux * trimStart}" y1="${ay + uy * trimStart}" x2="${bx - ux * trimEnd}" y2="${by - uy * trimEnd}" stroke="${PURPLE}" stroke-width="${lineWidth}"/>`,
    )
  }

  const area = c.printArea
  const cropCorners = area
    ? [localPoint(area.extent[0], area.extent[1]), localPoint(area.extent[2], area.extent[3])]
    : stops
  const points = cropCorners.map(toSvg)
  const margin = ((area ? 0 : CROP_MARGIN_METERS) * HUNDREDTHS_MM_PER_METER) / map.info.scale
  const cropMinX = Math.min(...points.map(p => p[0])) - margin
  const cropMinY = Math.min(...points.map(p => p[1])) - margin
  const cropWidth = Math.max(...points.map(p => p[0])) + margin - cropMinX
  const cropHeight = Math.max(...points.map(p => p[1])) + margin - cropMinY

  const rendered = renderDescriptionSheet(sheet)
  const metresPerMm = map.info.scale / 1000
  const box = area
    ? placeDescriptionBox(
        area,
        rendered.widthMillimetres * metresPerMm,
        rendered.heightMillimetres * metresPerMm,
      )
    : null
  const [boxX, boxY] = box ? toSvg(localPoint(box[0], box[3])) : [cropMinX, cropMinY]
  const paperUnitsPerMm = 100
  overlay.push(
    rendered.svg.replace(
      /width="[\d.]+mm" height="[\d.]+mm"/,
      `x="${boxX}" y="${boxY}" ` +
        `width="${rendered.widthMillimetres * paperUnitsPerMm}" height="${rendered.heightMillimetres * paperUnitsPerMm}"`,
    ),
  )
  if (area) {
    overlay.push(
      `<rect x="${cropMinX}" y="${cropMinY}" width="${cropWidth}" height="${cropHeight}" fill="none" stroke="black" stroke-width="${mm(0.5)}"/>`,
    )
  }

  const mapMarkup = new XMLSerializer().serializeToString(svg as unknown as Node)
  const withOverlay = mapMarkup
    .replace(/viewBox="[^"]*"/, `viewBox="${cropMinX} ${cropMinY} ${cropWidth} ${cropHeight}"`)
    .replace(/<\/svg>\s*$/, `<g>${overlay.join('')}</g></svg>`)
  return new Resvg(withOverlay, {
    fitTo: { mode: 'width', value: IMAGE_WIDTH_PIXELS },
    background: 'white',
    font: { loadSystemFonts: true },
  })
    .render()
    .asPng()
}
