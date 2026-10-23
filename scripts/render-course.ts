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
  searchCourse,
  type Course,
} from '@ratamestari/engine'
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
const sites = findControlSites(features, terrain)
const target = courseTargetFor(request)
if (!target) throw new Error('No winning time for this class and event')

const centre = values.centre ? parsePoint(values.centre) : middleOfMappedArea()
const started = performance.now()
const course = searchCourse(terrain, sites, {
  target,
  format: request.format,
  mapScale: map.info.scale,
  competitionCentre: centre,
  seed,
  paceSecondsPerKm,
})
if (!course) throw new Error('No course found')
const searchSeconds = (performance.now() - started) / 1000

printSummary(course, searchSeconds)
if (values.legs) printLegs(course)

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
  console.log(`difficulty: ${c.controls.map(s => s.technicalDifficulty).join('')}`)
  console.log(`problems: ${JSON.stringify(c.problems)}`)
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

  const points = stops.map(toSvg)
  const margin = (CROP_MARGIN_METERS * HUNDREDTHS_MM_PER_METER) / map.info.scale
  const cropMinX = Math.min(...points.map(p => p[0])) - margin
  const cropMinY = Math.min(...points.map(p => p[1])) - margin
  const cropWidth = Math.max(...points.map(p => p[0])) + margin - cropMinX
  const cropHeight = Math.max(...points.map(p => p[1])) + margin - cropMinY

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
