import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import {
  localPoint,
  localToProjected,
  projectedToGeographic,
  type LocalExtent,
  type LocalPoint,
} from '@ratamestari/core'
import {
  buildTerrain,
  convexHullArea,
  findControlSites,
  fitPrintAreaToCourse,
  legLengths,
  mappedAreaWithin,
  measureCourseShape,
  findRoute,
  routeDoglegOverlaps,
  setCourseOnPaper,
  signedTurns,
  type Terrain,
} from '@ratamestari/engine'
import { describeControl, readCourseData, type ImportedCourseData } from '@ratamestari/iof'
import { loadOcadMap, type OcadMap } from '@ratamestari/map-ocad'
import {
  COURSE_SHAPE,
  courseTargetFor,
  FORMAT_QUALITY,
  printScaleFor,
  type Format,
} from '@ratamestari/rules'

const MAPS_FOLDER = 'maps'
const COURSES_SUFFIX = '.Courses.xml'
const DEFAULT_OUT = join(MAPS_FOLDER, 'renders', 'benchmark.md')
const PACE_SECONDS_PER_KM = 300
const MATCH_TOLERANCE_DEGREES = 0.001
const METRES_PER_DEGREE = 111_000
const MIN_STOPS = 3

const { values } = parseArgs({
  options: {
    seeds: { type: 'string', default: '3' },
    formats: { type: 'string', default: 'long,middle' },
    out: { type: 'string', default: DEFAULT_OUT },
    only: { type: 'string' },
  },
})
const seeds = Array.from({ length: Number(values.seeds) }, (_, i) => i + 1)
const formats = values.formats.split(',') as Format[]

interface Row {
  readonly source: string
  readonly controls: number
  readonly stops: readonly LocalPoint[]
  readonly printExtent: LocalExtent | null
  readonly timeErrorPercent: number | null
  readonly findings: number | null
  readonly searchSeconds: number | null
}

const lines: string[] = []
const mapFiles = readdirSync(MAPS_FOLDER).filter(name => name.endsWith('.ocd'))
const courseFiles = readdirSync(MAPS_FOLDER).filter(
  name => name.endsWith(COURSES_SUFFIX) && (!values.only || name.includes(values.only)),
)
const loaded = new Map<string, OcadMap>()
const loadMap = async (file: string) => {
  const cached = loaded.get(file)
  if (cached) return cached
  const map = await loadOcadMap(new Uint8Array(readFileSync(join(MAPS_FOLDER, file))))
  loaded.set(file, map)
  return map
}

for (const courseFile of courseFiles) {
  const data = readCourseData(readFileSync(join(MAPS_FOLDER, courseFile), 'utf8'))
  const scale = data.mapScale ?? 15000
  const toLocal = (id: string) => {
    const position = data.controls.get(id)?.mapPositionMillimetres
    return position ? localPoint((position[0] * scale) / 1000, (position[1] * scale) / 1000) : null
  }
  const references = data.courses
    .map(course => ({
      name: course.name,
      stops: course.controlIds.map(toLocal).filter((stop): stop is LocalPoint => stop !== null),
    }))
    .filter(reference => reference.stops.length >= MIN_STOPS)
  const firstStops = references[0]?.stops ?? []
  const mapFile = await mapContaining(data, scale)
  if (!mapFile) continue
  const map = await loadMap(mapFile)
  const terrain = buildTerrain(map.features(), map.info.extent)
  const sites = findControlSites(map.features(), terrain).filter(s => describeControl(s) !== null)
  const centre = firstStops[firstStops.length - 1]!

  const rows: Row[] = references.map(reference => ({
    source: `reference ${reference.name}`,
    controls: reference.stops.length - 2,
    stops: reference.stops,
    printExtent:
      fitPrintAreaToCourse(terrain, reference.stops, {
        papers: ['A4', 'A3'],
        printScale: scale,
        descriptionRows: reference.stops.length + 2,
      })?.extent ?? null,
    timeErrorPercent: null,
    findings: null,
    searchSeconds: null,
  }))
  for (const format of formats) {
    const target = courseTargetFor({
      eventLevel: 'finnishChampionship',
      format,
      sex: 'H',
      ageClass: 21,
      skillLetter: 'A',
    })!
    for (const seed of seeds) {
      const started = performance.now()
      const course = setCourseOnPaper(
        terrain,
        sites,
        {
          target,
          format,
          printScale: printScaleFor('auto', format),
          competitionCentre: centre,
          seed,
          paceSecondsPerKm: PACE_SECONDS_PER_KM,
        },
        'auto',
      )
      if (!course) continue
      const stops = [course.start.position, ...course.controls.map(s => s.position), course.finish]
      rows.push({
        source: `${format} seed ${seed}`,
        controls: course.controls.length,
        stops,
        printExtent: course.printArea?.extent ?? null,
        timeErrorPercent:
          (100 * (course.estimatedSeconds - course.targetSeconds)) / course.targetSeconds,
        findings: course.findings.length,
        searchSeconds: (performance.now() - started) / 1000,
      })
    }
  }
  lines.push(
    `## ${courseFile.replace(COURSES_SUFFIX, '')} (${data.courses.length} reference courses)`,
    '',
  )
  lines.push(table(rows, terrain))
  lines.push('')
  console.log(lines.slice(-3).join('\n'))
}

mkdirSync(join(MAPS_FOLDER, 'renders'), { recursive: true })
writeFileSync(values.out, `# Course benchmark\n\n${legend()}\n\n${lines.join('\n')}\n`)
console.log(`Wrote ${values.out}`)

// Each OCAD file has its own paper coordinates, so match maps by where the controls land on the
// ground: the right map turns the course's map positions into the course's own longitudes and
// latitudes. Without georeferences, fall back to a map whose extent holds the course.
async function mapContaining(data: ImportedCourseData, scale: number): Promise<string | undefined> {
  const controls = [...data.controls.values()].filter(c => c.mapPositionMillimetres !== null)
  if (controls.length === 0) return undefined
  let best: { file: string; error: number } | undefined
  for (const file of mapFiles) {
    const { georef, extent } = (await loadMap(file)).info
    const errors = controls.map(control => {
      const [x, y] = control.mapPositionMillimetres!
      const local = localPoint((x * scale) / 1000, (y * scale) / 1000)
      if (georef && control.projected) {
        const [easting, northing] = localToProjected(local, georef)
        const metres = Math.hypot(easting - control.projected[0], northing - control.projected[1])
        return metres / METRES_PER_DEGREE
      }
      if (!georef || !control.longitudeLatitude) {
        const inside =
          local[0] >= extent[0] &&
          local[0] <= extent[2] &&
          local[1] >= extent[1] &&
          local[1] <= extent[3]
        return inside ? 0 : Number.POSITIVE_INFINITY
      }
      const ground = projectedToGeographic(localToProjected(local, georef), georef.epsg)
      if (!ground) return Number.POSITIVE_INFINITY
      const [longitude, latitude] = control.longitudeLatitude
      return Math.hypot(ground.longitudeDegrees - longitude, ground.latitudeDegrees - latitude)
    })
    const error = errors.reduce((sum, e) => sum + e, 0) / Math.max(1, errors.length)
    if (!best || error < best.error) best = { file, error }
  }
  return best && best.error < MATCH_TOLERANCE_DEGREES ? best.file : undefined
}

function table(rows: readonly Row[], terrain: Terrain): string {
  const header = [
    'course',
    'ctrl',
    'median leg m',
    'leg mix (bins)',
    'turn >60°',
    'same-way turning',
    'reversals',
    'monotonous',
    'spread',
    'doglegs',
    'long fit',
    'middle fit',
    'time err',
    'findings',
    'search s',
  ]
  const body = rows.map(row => {
    const legs = legLengths(row.stops)
    const turns = signedTurns(row.stops)
    const metricsFor = (format: Format) =>
      measureCourseShape(terrain, row.stops, format, row.printExtent)
    const long = metricsFor('long')
    const usable = mappedAreaWithin(terrain, row.printExtent)
    return [
      row.source,
      String(row.controls),
      String(Math.round(median(legs))),
      histogram(legs).join('/'),
      percent(
        turns.filter(t => Math.abs(t) > COURSE_SHAPE.directionChangeDegrees).length / turns.length,
      ),
      long.ring.note.split('%')[0] + '%',
      long.reversals.value.toFixed(2),
      percent(long.alternation.value),
      percent(usable > 0 ? convexHullArea(row.stops) / usable : 0),
      doglegs(row.stops, terrain),
      long.legLengths.value.toFixed(2),
      metricsFor('middle').legLengths.value.toFixed(2),
      row.timeErrorPercent === null ? '' : `${row.timeErrorPercent.toFixed(1)}%`,
      row.findings === null ? '' : String(row.findings),
      row.searchSeconds === null ? '' : row.searchSeconds.toFixed(1),
    ]
  })
  return [header, header.map(() => '---'), ...body]
    .map(cells => `| ${cells.join(' | ')} |`)
    .join('\n')
}

function doglegs(stops: readonly LocalPoint[], terrain: Terrain): string {
  const routes = stops
    .slice(1)
    .map((stop, i) => findRoute(terrain.grid, stops[i]!, stop)?.points ?? [stops[i]!, stop])
  const overlaps = routeDoglegOverlaps(routes)
  const hard = overlaps.filter(overlap => overlap > COURSE_SHAPE.doglegHardOverlap).length
  return `${hard} (max ${percent(Math.max(0, ...overlaps))})`
}

function legend(): string {
  const edges = FORMAT_QUALITY.long.legLengths.binEdgesMetres
  return [
    `Leg mix: number of legs per straight-length bin, edges ${edges.join(', ')} m.`,
    'Same-way turning: share of turning in one direction (100% is a ring).',
    `Reversals: turns over ${COURSE_SHAPE.reversalDegrees}°, weighted by the shorter leg.`,
    'Monotonous: share of legs in runs of similar length. Spread: course hull / mapped area on the paper.',
    `Doglegs: controls where the next route runs back along the incoming one by more than ${COURSE_SHAPE.doglegHardOverlap * 100}% (worst overlap in brackets).`,
    'Long/middle fit: distance from the leg-length target of that format (0 is a perfect match).',
  ].join('\n')
}

function histogram(legs: readonly number[]): number[] {
  const edges = FORMAT_QUALITY.long.legLengths.binEdgesMetres
  const counts = new Array<number>(edges.length - 1).fill(0)
  for (const leg of legs) {
    const bin = edges.findIndex((edge, i) => i > 0 && leg < edge) - 1
    counts[bin < 0 ? counts.length - 1 : bin]!++
  }
  return counts
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

function percent(share: number): string {
  return `${Math.round(share * 100)}%`
}
