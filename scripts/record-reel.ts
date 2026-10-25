import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { crc32, deflateSync } from 'node:zlib'
import { Resvg } from '@resvg/resvg-js'
import { DOMImplementation, XMLSerializer } from 'xmldom'
import { localExtent, localPoint, type LocalExtent, type LocalPoint } from '@ratamestari/core'
import {
  buildTerrain,
  cellCenterOf,
  findControlSites,
  findPeripheralInformation,
  findRoute,
  isInPeripheralBlock,
  layOutOverprint,
  overprintDetailOf,
  peripheralLayout,
  secondsFrom,
  seededRandom,
  setCourseOnPaper,
  type Course,
  type OverprintLayout,
} from '@ratamestari/engine'
import { describeControl, descriptionSheet, renderDescriptionSheet } from '@ratamestari/iof'
import { loadOcadMap } from '@ratamestari/map-ocad'
import { mapWindow, printPageSvg } from '@ratamestari/print'
import {
  COURSE_OVERPRINT,
  courseTargetFor,
  overprintGroundMetres,
  PAPER,
  printScaleFor,
  REFERENCE_PACE_SECONDS_PER_KM,
  type CourseRequest,
} from '@ratamestari/rules'

// Renders a vertical video (Instagram reel) of real engine runs: the candidate sites, the cost
// map, a time tree, courses from several seeds, a runner along the routes and the print page.
// Writes PNG frames, and the MP4 too when ffmpeg is installed.

const { values } = parseArgs({
  options: {
    map: { type: 'string', default: 'apps/web/public/sample/leirikangas-sample.ocd' },
    out: { type: 'string', default: 'maps/renders/reel' },
    seeds: { type: 'string', default: '10' },
    // Every nth frame only, for a quick look.
    every: { type: 'string', default: '1' },
    // A TTF or OTF of the app font; without it the text falls back to an installed sans.
    font: { type: 'string' },
  },
})

const REQUEST: CourseRequest = {
  eventLevel: 'national',
  format: 'middle',
  sex: 'H',
  ageClass: 21,
  skillLetter: 'E',
}
const COURSE_TITLE = 'Middle distance'
const MAP_CREDIT = 'Map © Vehkalahden Veikot'
const SITE_URL = 'pouju.github.io/ratamestari'

const [WIDTH, HEIGHT] = [1080, 1920]
const FRAMES_PER_SECOND = 30
// Cuts fall on beats of a 120 BPM track.
const BEAT = 15
const FONT = 'Atkinson Hyperlegible Next, DejaVu Sans, sans-serif'
const COLOURS = {
  night: '#111111',
  paper: '#eceeea',
  ink: '#000000',
  inkSoft: '#4d4d4d',
  overprint: '#a3238e',
  courseOnScreen: COURSE_OVERPRINT.colour,
  yellow: '#ffba36',
  white: '#ffffff',
}

const RUNNABILITY_GRADIENT: readonly (readonly [number, number, number, number])[] = [
  [0, 40, 10, 70],
  [0.4, 120, 25, 110],
  [0.65, 190, 30, 180],
  [0.85, 255, 120, 60],
  [1, 255, 236, 140],
]
const FLOOD_GRADIENT: readonly (readonly [number, number, number, number])[] = [
  [0, 255, 236, 140],
  [0.4, 255, 150, 40],
  [0.75, 190, 30, 180],
  [1, 70, 20, 120],
]

const MAP_METRES_PER_PIXEL = 1
const MAPPED_AREA_PADDING_METRES = 60
const OVERVIEW_WIDTH_SHARE = 1.25
const BACKDROP_BLUR_PIXELS = 18
const BACKDROP_DIMMING = 0.55
const SLOT_LANDED_FRAMES = BEAT * 2
const PAGE_PIXELS_WIDE = 2400
const DESCRIPTIONS_PIXELS_WIDE = 700
const SITE_RADIUS_PIXELS = 7
const COURSE_LINE_BOOST = 1.6
const SLOT_LINE_BOOST = 2.6
const LABEL_SIZE = 56
const FLOOD_COVER_SHARE = 0.85
const FLOOD_MAX_SECONDS = 3600
const ISOCHRONE_SECONDS = 60
const FLOOD_FRONT_SECONDS = 20
const SLOT_FLASH_FRAMES = [5, 5, 4, 4, 4, 5, 6, 8, 11]
const SAFE_TOP = 300

const outDir = resolve(values.out)
const framesDir = join(outDir, 'frames')
rmSync(framesDir, { recursive: true, force: true })
mkdirSync(framesDir, { recursive: true })

const map = await loadOcadMap(new Uint8Array(readFileSync(values.map)))
const features = map.features()
const terrain = buildTerrain(features, map.info.extent)
const { grid } = terrain
const peripheral = findPeripheralInformation(map.annotations(), terrain, map.info.scale)
const sites = findControlSites(features, terrain).filter(
  site => describeControl(site) !== null && !isInPeripheralBlock(peripheral, site.position),
)
const mapped = [...terrain.mappedArea.keys()].filter(i => terrain.mappedArea[i])
const centre = cellCenterOf(grid, mapped[Math.floor(mapped.length / 2)]!)
const pace = REFERENCE_PACE_SECONDS_PER_KM.value

const spec = {
  target: courseTargetFor(REQUEST)!,
  format: REQUEST.format,
  printScale: printScaleFor('auto', REQUEST.format),
  competitionCentre: centre,
  seed: 1,
  paceSecondsPerKm: pace,
  peripheralSize: peripheralLayout(peripheral.blocks),
}
const searched = Array.from({ length: Number(values.seeds) }, (_, i) => {
  let compared = 0
  const startedAt = performance.now()
  const course = setCourseOnPaper(terrain, sites, { ...spec, seed: i + 1 }, 'auto', progress => {
    if (progress.done === 0 && (progress.phase === 'sections' || progress.phase === 'improving'))
      compared += progress.total
  })
  const seconds = (performance.now() - startedAt) / 1000
  console.log(`Seed ${i + 1}: ${seconds.toFixed(1)} s, ${course?.findings.length ?? '-'} findings`)
  return course?.printArea ? { course, seconds, compared } : null
}).filter(each => each !== null)
// The reel ends on the cleanest course; the others flash past as the search's alternatives.
const final = [...searched].sort(
  (a, b) => a.course.findings.length - b.course.findings.length || a.course.score - b.course.score,
)[0]
if (!final) throw new Error('No course found on the map')
const course = final.course
const area = course.printArea!
const alternatives = searched.filter(each => each !== final).map(each => each.course)
const comparedCourses = searched.reduce((sum, each) => sum + each.compared, 0)
const layout = layOutOverprint(course, overprintDetailOf(features))
const stops = [course.start.position, ...course.controls.map(c => c.position), course.finish]

const svgDocument = new DOMImplementation().createDocument(null, 'svg', null) as unknown as Document
const svgOf = (includesObject: (objectIndex: number) => boolean) =>
  new XMLSerializer().serializeToString(
    map.renderSvg(svgDocument, includesObject) as unknown as Node,
  )
const mapSvg = svgOf(i => !peripheral.marginObjectIndices.has(i))

const mappedExtent = extentOf(
  mapped.map(i => cellCenterOf(grid, i)),
  MAPPED_AREA_PADDING_METRES,
)
const mapPng = join(outDir, 'map.png')
writeFileSync(mapPng, groundPng(mappedExtent, MAP_METRES_PER_PIXEL))

const gridExtent = localExtent(
  grid.minX,
  grid.minY,
  grid.minX + grid.columns * grid.cellSizeMeters,
  grid.minY + grid.rows * grid.cellSizeMeters,
)
const heatPng = join(outDir, 'runnability.png')
writeFileSync(
  heatPng,
  gridPng(cell => runnabilityColour(cell)),
)

const flood = secondsFrom(grid, course.start.position, pace, FLOOD_MAX_SECONDS)
const reachedSeconds = mapped
  .map(i => flood[i]!)
  .filter(Number.isFinite)
  .sort((a, b) => a - b)
const floodSeconds = reachedSeconds[Math.floor(reachedSeconds.length * FLOOD_COVER_SHARE)] ?? 0

const runnerPath = stops
  .slice(1)
  .flatMap((to, i) => findRoute(grid, stops[i]!, to, { paceSecondsPerKm: pace })?.points ?? [])
const runnerLengths = runnerPath.reduce<number[]>(
  (lengths, point, i) => [
    ...lengths,
    i === 0 ? 0 : lengths[i - 1]! + distance(runnerPath[i - 1]!, point),
  ],
  [],
)

const sheet = descriptionSheet(course, {
  title: COURSE_TITLE,
  courseName: `${REQUEST.sex}${REQUEST.ageClass}${REQUEST.skillLetter}`,
})
const page = printPageSvg({
  mapSvg,
  mapScale: map.info.scale,
  course,
  overprintLayout: layout,
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
})!
const pagePng = join(outDir, 'page.png')
writeFileSync(pagePng, rasterised(page.svg, PAGE_PIXELS_WIDE))
const descriptions = renderDescriptionSheet(sheet)
const descriptionsPng = join(outDir, 'descriptions.png')
writeFileSync(descriptionsPng, rasterised(descriptions.svg, DESCRIPTIONS_PIXELS_WIDE))
const toPageMillimetres = ([x, y]: LocalPoint): [number, number] => [
  PAPER.printMarginMillimetres + ((x - area.extent[0]) * 1000) / area.scale,
  PAPER.printMarginMillimetres + ((area.extent[3] - y) * 1000) / area.scale,
]

interface Camera {
  readonly x: number
  readonly y: number
  readonly metresPerPixel: number
}
const cameraOn = ([minX, minY, maxX, maxY]: LocalExtent, widthShare: number): Camera => ({
  x: (minX + maxX) / 2,
  y: (minY + maxY) / 2,
  metresPerPixel: (maxX - minX) / (WIDTH * widthShare),
})
const overview = cameraOn(mappedExtent, OVERVIEW_WIDTH_SHARE)
const backdropPng = join(outDir, 'backdrop.png')
writeFileSync(backdropPng, backdrop())
const onAllCourses = cameraOn(
  extentOf(
    searched.flatMap(({ course: each }) => [
      each.start.position,
      ...each.controls.map(c => c.position),
    ]),
    150,
  ),
  0.95,
)
const onCourse = cameraOn(extentOf(stops, 150), 0.95)
const onStart: Camera = {
  x: course.start.position[0],
  y: course.start.position[1],
  metresPerPixel: overview.metresPerPixel * 0.45,
}
const between = (a: Camera, b: Camera, t: number): Camera => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  // Zooming evenly in log scale feels like a steady push.
  metresPerPixel: Math.exp(lerp(Math.log(a.metresPerPixel), Math.log(b.metresPerPixel), t)),
})
const pushed = (camera: Camera, share: number): Camera => ({
  ...camera,
  metresPerPixel: camera.metresPerPixel * share,
})

const siteOrder = (() => {
  const random = seededRandom(7)
  return sites
    .map(site => ({ site, key: distance(site.position, centre) + random.between(0, 250) }))
    .sort((a, b) => a.key - b.key)
    .map(({ site }) => site.position)
})()

type Shot = (frame: number, length: number) => string
const shots: [number, Shot][] = [
  [BEAT * 2.4, hook],
  [BEAT * 0.8, rewind],
  [BEAT * 4.8, siteCascade],
  [BEAT * 4, runnability],
  [BEAT * 5, timeFlood],
  [
    SLOT_FLASH_FRAMES.slice(0, alternatives.length).reduce((a, b) => a + b, 0) + SLOT_LANDED_FRAMES,
    slotMachine,
  ],
  [BEAT * 4, runner],
  [BEAT * 3.2, printedPage],
  [BEAT * 4, endCard],
]

const resvgOptions = {
  font: {
    loadSystemFonts: true,
    fontFiles: values.font ? [resolve(values.font)] : [],
    defaultFontFamily: 'DejaVu Sans',
  },
}
const every = Number(values.every)
let frameNumber = 0
for (const [length, shot] of shots) {
  for (let frame = 0; frame < Math.round(length); frame++, frameNumber++) {
    if (frameNumber % every !== 0) continue
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">` +
      `<rect width="${WIDTH}" height="${HEIGHT}" fill="${COLOURS.night}"/>` +
      shot(frame, Math.round(length)) +
      `</svg>`
    writeFileSync(
      join(framesDir, `${String(frameNumber).padStart(4, '0')}.png`),
      new Resvg(svg, resvgOptions).render().asPng(),
    )
  }
}

const video = join(outDir, 'reel.mp4')
const ffmpegArguments = [
  '-y',
  '-framerate',
  String(FRAMES_PER_SECOND),
  '-i',
  join(framesDir, '%04d.png'),
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  '-crf',
  '16',
  video,
]
console.log(
  `${course.controls.length} controls, ${(course.lengthMeters! / 1000).toFixed(1)} km, ` +
    `set in ${final.seconds.toFixed(1)} s; ${sites.length} sites, ${comparedCourses} courses ` +
    `compared; ${frameNumber} frames (${(frameNumber / FRAMES_PER_SECOND).toFixed(1)} s)`,
)
if (every === 1) {
  try {
    execFileSync('ffmpeg', ffmpegArguments, { stdio: 'ignore' })
    console.log(`Wrote ${video}`)
  } catch {
    console.log(`Frames in ${framesDir}. To make the video:\nffmpeg ${ffmpegArguments.join(' ')}`)
  }
}

function hook(frame: number, length: number) {
  const searchSeconds = Math.max(1, Math.round(final!.seconds))
  return (
    pageFullBleed(lerp(1.3, 1.12, easeOutCubic(frame / length))) +
    sticker('A computer set', SAFE_TOP, progress(frame, 1, 6), { size: 84 }) +
    sticker('this course', SAFE_TOP + 130, progress(frame, 4, 6), { size: 84 }) +
    sticker(`in ${searchSeconds} seconds`, SAFE_TOP + 280, progress(frame, 13, 6), {
      fill: COLOURS.yellow,
      ink: COLOURS.ink,
      size: 84,
    })
  )
}

function rewind(frame: number, length: number) {
  const t = frame / length
  return (
    pageFullBleed(lerp(1.12, 0.7, easeInCubic(t)), -8 * easeInCubic(t)) +
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="${COLOURS.white}" opacity="${easeInCubic(t)}"/>`
  )
}

function siteCascade(frame: number, length: number) {
  const camera = pushed(overview, lerp(1, 0.94, frame / length))
  const shownBy = (i: number) => 4 + (length * 0.7 - 4) * (i / siteOrder.length) ** 0.8
  const shown = siteOrder.filter((_, i) => frame >= shownBy(i)).length
  return (
    mapImage(camera) +
    sitesSvg(camera, shownBy, frame, 1) +
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="${COLOURS.white}" opacity="${1 - progress(frame, 0, 5)}"/>` +
    counter(groupedDigits(shown), SAFE_TOP + 40, progress(frame, 0, 4)) +
    sticker('possible controls', SAFE_TOP + 170, progress(frame, 2, 5), { size: LABEL_SIZE }) +
    credit()
  )
}

function runnability(frame: number, length: number) {
  const camera = pushed(overview, lerp(0.94, 0.9, frame / length))
  const wipe = easeInOutCubic(progress(frame, 0, length * 0.55))
  const [left] = screenOf(camera)(localPoint(gridExtent[0], gridExtent[3]))
  const [right] = screenOf(camera)(localPoint(gridExtent[2], gridExtent[3]))
  const edge = lerp(left, right, wipe)
  return (
    mapImage(camera) +
    sitesSvg(camera, () => 0, frame, 1 - progress(frame, 0, 10)) +
    `<clipPath id="wipe"><rect width="${edge}" height="${HEIGHT}"/></clipPath>` +
    `<g clip-path="url(#wipe)">${imageOver(heatPng, gridExtent, camera, 'opacity="0.88"')}</g>` +
    (wipe > 0 && wipe < 1
      ? `<rect x="${edge - 3}" width="6" height="${HEIGHT}" fill="${COLOURS.white}"/>` +
        `<rect x="${edge - 30}" width="60" height="${HEIGHT}" fill="${COLOURS.white}" opacity="0.18"/>`
      : '') +
    sticker('Runnability rated', SAFE_TOP, progress(frame, 2, 6)) +
    sticker(`every ${grid.cellSizeMeters} m`, SAFE_TOP + 120, progress(frame, 10, 6), {
      fill: COLOURS.yellow,
      ink: COLOURS.ink,
    }) +
    credit()
  )
}

function timeFlood(frame: number, length: number) {
  const t = frame / length
  const camera = between(onStart, overview, easeInOutCubic(t))
  const seconds = floodSeconds * progress(frame, 3, length - 8) ** 1.4
  const floodPng = join(outDir, 'flood.png')
  writeFileSync(
    floodPng,
    gridPng(cell => floodColour(flood[cell]!, seconds)),
  )
  return (
    mapImage(camera) +
    imageOver(heatPng, gridExtent, camera, `opacity="${lerp(0.88, 0.2, progress(frame, 0, 10))}"`) +
    imageOver(floodPng, gridExtent, camera) +
    startTriangle(camera, course.start.position, stops[1]!, 1) +
    counter(minutesAndSeconds(seconds), SAFE_TOP + 40, 1) +
    sticker('running time to every spot', SAFE_TOP + 170, progress(frame, 2, 6), {
      size: LABEL_SIZE,
    }) +
    credit()
  )
}

function slotMachine(frame: number, length: number) {
  const flashes = SLOT_FLASH_FRAMES.slice(0, alternatives.length)
  const landsAt = flashes.reduce((sum, each) => sum + each, 0)
  let shown = course
  let flashedAt = landsAt
  for (let i = 0, at = 0; i < flashes.length; at += flashes[i]!, i++) {
    if (frame >= at && frame < at + flashes[i]!) {
      shown = alternatives[i]!
      flashedAt = at
    }
  }
  if (frame >= landsAt) flashedAt = landsAt
  const camera = pushed(onAllCourses, lerp(1.04, 0.98, frame / length))
  const flash = 1 - progress(frame, flashedAt, 3)
  const landed = frame >= landsAt
  const counted = Math.round(comparedCourses * easeOutCubic(progress(frame, 0, landsAt + 6)))
  return (
    mapImage(camera) +
    imageOver(
      join(outDir, 'flood.png'),
      gridExtent,
      camera,
      `opacity="${1 - progress(frame, 0, 8)}"`,
    ) +
    courseSvg(shown, layOutOverprint(shown), camera, {
      numbers: false,
      lineBoost: SLOT_LINE_BOOST,
    }) +
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="${landed ? COLOURS.yellow : COLOURS.white}" opacity="${flash * (landed ? 0.45 : 0.18)}"/>` +
    counter(groupedDigits(counted), SAFE_TOP + 40, 1) +
    sticker('courses compared', SAFE_TOP + 170, progress(frame, 1, 5), { size: LABEL_SIZE }) +
    (landed
      ? sticker('This one.', HEIGHT - 520, progress(frame, landsAt, 6), {
          fill: COLOURS.yellow,
          ink: COLOURS.ink,
          size: 84,
        })
      : '') +
    credit()
  )
}

function runner(frame: number, length: number) {
  const camera = between(onAllCourses, onCourse, easeInOutCubic(progress(frame, 0, 12)))
  const travelled = runnerLengths.at(-1)! * easeInOutCubic(progress(frame, 4, length * 0.75))
  const toScreen = screenOf(camera)
  const passed = runnerPath.filter((_, i) => runnerLengths[i]! <= travelled)
  const head = pointAlong(travelled)
  const trail = [...passed, head].map(toScreen).map(([x, y]) => `${round(x)},${round(y)}`)
  const [headX, headY] = toScreen(head)
  const checks = courseChecks()
  return (
    mapImage(camera) +
    courseSvg(course, layout, camera, { numbers: true }) +
    `<polyline points="${trail.join(' ')}" fill="none" stroke="${COLOURS.yellow}" stroke-width="16" stroke-opacity="0.35" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<polyline points="${trail.join(' ')}" fill="none" stroke="${COLOURS.yellow}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="${headX}" cy="${headY}" r="13" fill="${COLOURS.white}" stroke="${COLOURS.overprint}" stroke-width="5"/>` +
    checks
      .map((check, i) =>
        sticker(check, SAFE_TOP - 40 + i * 100, progress(frame, 8 + i * 7, 5), {
          size: 52,
          fill: i === 0 ? COLOURS.white : COLOURS.overprint,
          ink: i === 0 ? COLOURS.ink : COLOURS.white,
        }),
      )
      .join('') +
    credit()
  )
}

function printedPage(frame: number) {
  const drop = easeOutCubic(progress(frame, 0, 12))
  const pageWidth = 1000
  const pageHeight = (pageWidth * page.heightMillimetres) / page.widthMillimetres
  const descriptionsWidth = 300
  const descriptionsHeight =
    (descriptionsWidth * descriptions.heightMillimetres) / descriptions.widthMillimetres
  const slide = easeOutCubic(progress(frame, 14, 12))
  return (
    `<image width="${WIDTH}" height="${HEIGHT}" href="${backdropPng}"/>` +
    sheetOnTable(pagePng, WIDTH / 2, 860, pageWidth, pageHeight, {
      rotation: lerp(-16, -3, drop),
      scale: lerp(1.6, 1, drop),
      opacity: progress(frame, 0, 3),
    }) +
    (slide > 0
      ? sheetOnTable(
          descriptionsPng,
          lerp(1300, 760, slide),
          lerp(1700, 1230, slide),
          descriptionsWidth,
          descriptionsHeight,
          { rotation: lerp(25, 5, slide), scale: 1, opacity: 1 },
        )
      : '') +
    sticker('Print-ready PDF', SAFE_TOP, progress(frame, 3, 5)) +
    sticker('+ IOF control descriptions', SAFE_TOP + 110, progress(frame, 16, 5), {
      size: 52,
      fill: COLOURS.white,
      ink: COLOURS.ink,
    })
  )
}

function endCard(frame: number) {
  const draw = easeOutCubic(progress(frame, 0, 14))
  const symbol = (path: string, length: number) =>
    `<path d="${path}" fill="none" stroke="${COLOURS.overprint}" stroke-width="14" stroke-linejoin="round" stroke-dasharray="${length}" stroke-dashoffset="${length * (1 - draw)}"/>`
  return (
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="${COLOURS.paper}"/>` +
    `<g transform="translate(${WIDTH / 2 - 250} 520)">` +
    symbol('M0 120 L70 0 L140 120 Z', 420) +
    symbol('M290 70 m-55 0 a55 55 0 1 0 110 0 a55 55 0 1 0 -110 0', 346) +
    symbol('M450 70 m-55 0 a55 55 0 1 0 110 0 a55 55 0 1 0 -110 0', 346) +
    symbol('M450 70 m-34 0 a34 34 0 1 0 68 0 a34 34 0 1 0 -68 0', 214) +
    `</g>` +
    text('Ratamestari', WIDTH / 2, 860, 136, COLOURS.ink, progress(frame, 6, 6), 800) +
    text('Your orienteering course,', WIDTH / 2, 970, 52, COLOURS.inkSoft, progress(frame, 10, 6)) +
    text('set by the rules.', WIDTH / 2, 1036, 52, COLOURS.inkSoft, progress(frame, 10, 6)) +
    sticker('Try it free · link in bio', 1220, progress(frame, 16, 6), { size: 60 }) +
    text(SITE_URL, WIDTH / 2, 1340, 38, COLOURS.overprint, progress(frame, 20, 6), 700) +
    text(MAP_CREDIT, WIDTH / 2, 1440, 26, COLOURS.inkSoft, progress(frame, 20, 6))
  )
}

function pageFullBleed(zoom: number, rotation = 0) {
  const pixelsPerMillimetre = (HEIGHT * zoom) / page.heightMillimetres
  const [courseX, courseY] = toPageMillimetres(centreOf(stops))
  const width = page.widthMillimetres * pixelsPerMillimetre
  const height = page.heightMillimetres * pixelsPerMillimetre
  return (
    `<g transform="translate(${WIDTH / 2} ${HEIGHT / 2}) rotate(${rotation})">` +
    `<image x="${-courseX * pixelsPerMillimetre}" y="${-courseY * pixelsPerMillimetre}"` +
    ` width="${width}" height="${height}" href="${pagePng}" preserveAspectRatio="none"/></g>`
  )
}

function sheetOnTable(
  href: string,
  centreX: number,
  centreY: number,
  width: number,
  height: number,
  { rotation, scale, opacity }: { rotation: number; scale: number; opacity: number },
) {
  return (
    `<filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="18"/></filter>` +
    `<g transform="translate(${centreX} ${centreY}) rotate(${rotation}) scale(${scale})" opacity="${opacity}">` +
    `<rect x="${-width / 2}" y="${-height / 2 + 24}" width="${width}" height="${height}" fill="#000" opacity="0.55" filter="url(#shadow)"/>` +
    `<rect x="${-width / 2 - 2}" y="${-height / 2 - 2}" width="${width + 4}" height="${height + 4}" fill="${COLOURS.white}"/>` +
    `<image x="${-width / 2}" y="${-height / 2}" width="${width}" height="${height}" href="${href}" preserveAspectRatio="none"/>` +
    `</g>`
  )
}

function courseChecks() {
  const { problems } = course
  return [
    `${course.controls.length} controls · ${(course.lengthMeters! / 1000).toFixed(1)} km`,
    ...(problems.spacing === 0 && problems.overlappingCircles === 0
      ? ['✓ IOF control spacing']
      : []),
    ...(problems.courseLineCrossings === 0 ? ['✓ No crossing legs'] : []),
    ...(problems.winningTimeOutsideRange
      ? []
      : [`✓ Winning time ${Math.round(course.estimatedSeconds / 60)} min`]),
    ...(problems.stopsOutsidePrintArea === 0 && problems.courseLinesOverDescriptions === 0
      ? [`✓ Fits on ${area.paper}`]
      : []),
  ]
}

function screenOf(camera: Camera) {
  return ([x, y]: LocalPoint): [number, number] => [
    WIDTH / 2 + (x - camera.x) / camera.metresPerPixel,
    HEIGHT / 2 - (y - camera.y) / camera.metresPerPixel,
  ]
}

function imageOver(
  href: string,
  [minX, minY, maxX, maxY]: LocalExtent,
  camera: Camera,
  attributes = '',
) {
  const [x, y] = screenOf(camera)(localPoint(minX, maxY))
  return (
    `<image x="${round(x)}" y="${round(y)}" width="${round((maxX - minX) / camera.metresPerPixel)}"` +
    ` height="${round((maxY - minY) / camera.metresPerPixel)}" href="${href}"` +
    ` preserveAspectRatio="none" ${attributes}/>`
  )
}

function mapImage(camera: Camera) {
  return (
    `<image width="${WIDTH}" height="${HEIGHT}" href="${backdropPng}"/>` +
    imageOver(mapPng, mappedExtent, camera)
  )
}

// The map blurred and dimmed behind the sharp one, so no frame shows empty bands around it.
function backdrop() {
  const [minX, minY, maxX, maxY] = mappedExtent
  const covering = {
    ...overview,
    metresPerPixel: Math.min((maxX - minX) / WIDTH, (maxY - minY) / HEIGHT),
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">` +
    `<filter id="blur"><feGaussianBlur stdDeviation="${BACKDROP_BLUR_PIXELS}"/></filter>` +
    `<g filter="url(#blur)">${imageOver(mapPng, mappedExtent, covering)}</g>` +
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="${COLOURS.night}" opacity="${BACKDROP_DIMMING}"/>` +
    `</svg>`
  return new Resvg(svg).render().asPng()
}

function sitesSvg(
  camera: Camera,
  shownBy: (order: number) => number,
  frame: number,
  opacity: number,
) {
  if (opacity <= 0) return ''
  const toScreen = screenOf(camera)
  const circles = siteOrder.flatMap((position, i) => {
    const pop = progress(frame, shownBy(i), 5)
    if (pop <= 0) return []
    const [x, y] = toScreen(position)
    return [
      `<circle cx="${round(x)}" cy="${round(y)}" r="${round(SITE_RADIUS_PIXELS * easeOutBack(pop))}"/>`,
    ]
  })
  return (
    `<g fill="none" stroke="${COLOURS.courseOnScreen}" stroke-width="2.5" opacity="${opacity}">` +
    circles.join('') +
    `</g>`
  )
}

function courseSvg(
  shown: Course,
  shownLayout: OverprintLayout,
  camera: Camera,
  { numbers, lineBoost = COURSE_LINE_BOOST }: { numbers: boolean; lineBoost?: number },
) {
  const toScreen = screenOf(camera)
  const pixels = (millimetres: number) => overprintGroundMetres(millimetres) / camera.metresPerPixel
  const lineWidth = pixels(COURSE_OVERPRINT.courseLineWidthMillimetres) * lineBoost
  const shownStops = [shown.start.position, ...shown.controls.map(c => c.position), shown.finish]
  const legs = shownLayout.legPieces.flat().map(([from, to]) => {
    const [x1, y1] = toScreen(from)
    const [x2, y2] = toScreen(to)
    return `<line x1="${round(x1)}" y1="${round(y1)}" x2="${round(x2)}" y2="${round(y2)}"/>`
  })
  const circles = shown.controls.map(control => {
    const [x, y] = toScreen(control.position)
    return `<circle cx="${round(x)}" cy="${round(y)}" r="${round(pixels(COURSE_OVERPRINT.controlCircleDiameterMillimetres) / 2)}"/>`
  })
  const [finishX, finishY] = toScreen(shown.finish)
  const finish = [
    COURSE_OVERPRINT.finishInnerDiameterMillimetres,
    COURSE_OVERPRINT.finishOuterDiameterMillimetres,
  ].map(d => `<circle cx="${round(finishX)}" cy="${round(finishY)}" r="${round(pixels(d) / 2)}"/>`)
  const numberSize = pixels(COURSE_OVERPRINT.controlNumberHeightMillimetres) * 1.2
  const numberText = numbers
    ? shownLayout.numberCentres
        .map((point, i) => {
          const [x, y] = toScreen(point)
          return `<text x="${round(x)}" y="${round(y + numberSize * 0.36)}">${i + 1}</text>`
        })
        .join('')
    : ''
  return (
    `<g fill="none" stroke="${COLOURS.courseOnScreen}" stroke-width="${round(lineWidth)}">` +
    legs.join('') +
    circles.join('') +
    finish.join('') +
    `</g>` +
    startTriangle(camera, shownStops[0]!, shownStops[1]!, lineBoost) +
    `<g font-family="${FONT}" font-size="${round(numberSize)}" font-weight="700" text-anchor="middle"` +
    ` fill="${COLOURS.courseOnScreen}" stroke="${COLOURS.white}" stroke-width="${round(numberSize * 0.18)}" paint-order="stroke">` +
    numberText +
    `</g>`
  )
}

function startTriangle(camera: Camera, start: LocalPoint, towards: LocalPoint, boost: number) {
  const toScreen = screenOf(camera)
  const [x, y] = toScreen(start)
  const [tx, ty] = toScreen(towards)
  const pixels = (millimetres: number) => overprintGroundMetres(millimetres) / camera.metresPerPixel
  const radius = pixels(COURSE_OVERPRINT.startTriangleSideMillimetres) / Math.sqrt(3)
  const angle = Math.atan2(ty - y, tx - x)
  const corners = [0, 1, 2].map(k => {
    const a = angle + (k * 2 * Math.PI) / 3
    return `${round(x + radius * Math.cos(a))},${round(y + radius * Math.sin(a))}`
  })
  return (
    `<polygon points="${corners.join(' ')}" fill="none" stroke="${COLOURS.courseOnScreen}"` +
    ` stroke-width="${round(pixels(COURSE_OVERPRINT.courseLineWidthMillimetres) * boost)}"/>`
  )
}

function sticker(
  label: string,
  y: number,
  appear: number,
  {
    size = 64,
    fill = COLOURS.overprint,
    ink = COLOURS.white,
  }: { size?: number; fill?: string; ink?: string } = {},
) {
  if (appear <= 0) return ''
  const width = label.length * size * 0.66 + size
  return (
    `<g transform="translate(${WIDTH / 2} ${y}) rotate(-2) scale(${round(easeOutBack(appear))})">` +
    `<rect x="${round(-width / 2)}" y="${round(-size * 0.8)}" width="${round(width)}" height="${round(size * 1.5)}"` +
    ` rx="${round(size * 0.22)}" fill="${fill}"/>` +
    `<text y="${round(size * 0.33)}" text-anchor="middle" font-family="${FONT}" font-size="${size}"` +
    ` font-weight="800" fill="${ink}">${escaped(label)}</text></g>`
  )
}

function counter(label: string, y: number, appear: number) {
  if (appear <= 0) return ''
  return (
    `<g transform="translate(${WIDTH / 2} ${y}) scale(${round(easeOutBack(appear))})">` +
    `<text text-anchor="middle" font-family="${FONT}" font-size="150" font-weight="800"` +
    ` fill="${COLOURS.white}" stroke="${COLOURS.ink}" stroke-width="14" stroke-linejoin="round"` +
    ` paint-order="stroke">${escaped(label)}</text></g>`
  )
}

function text(
  label: string,
  x: number,
  y: number,
  size: number,
  fill: string,
  appear: number,
  weight = 400,
) {
  if (appear <= 0) return ''
  return (
    `<text x="${x}" y="${round(y + 30 * (1 - easeOutCubic(appear)))}" opacity="${round(appear)}"` +
    ` text-anchor="middle" font-family="${FONT}" font-size="${size}" font-weight="${weight}"` +
    ` fill="${fill}">${escaped(label)}</text>`
  )
}

function credit() {
  return (
    `<text x="40" y="${HEIGHT - 440}" font-family="${FONT}" font-size="26" fill="${COLOURS.white}"` +
    ` opacity="0.75">${escaped(MAP_CREDIT)}</text>`
  )
}

function runnabilityColour(cell: number): readonly [number, number, number, number] {
  if (!terrain.mappedArea[cell]) return [0, 0, 0, 0]
  const speed = grid.speed[cell]!
  if (speed === 0) return [0, 0, 0, 230]
  return [...gradient(speed / grid.maxSpeed, RUNNABILITY_GRADIENT), 230]
}

function floodColour(seconds: number, front: number): readonly [number, number, number, number] {
  if (!Number.isFinite(seconds) || seconds > front) return [0, 0, 0, 0]
  if (front - seconds < FLOOD_FRONT_SECONDS) return [255, 255, 255, 255]
  const band = Math.floor(seconds / ISOCHRONE_SECONDS) % 2 === 0 ? 1 : 0.82
  const [r, g, b] = gradient(seconds / floodSeconds, FLOOD_GRADIENT)
  return [r * band, g * band, b * band, 190]
}

function gradient(
  value: number,
  stops: readonly (readonly [number, number, number, number])[],
): [number, number, number] {
  const at = Math.max(0, Math.min(1, value))
  const upper = stops.findIndex(([position]) => position >= at)
  const [p1, ...high] = stops[Math.max(0, upper)]!
  const [p0, ...low] = stops[Math.max(0, upper - 1)]!
  const t = p1 === p0 ? 0 : (at - p0) / (p1 - p0)
  return [0, 1, 2].map(i => lerp(low[i]!, high[i]!, t)) as [number, number, number]
}

// The grid's rows run south to north; the image's from the top.
function gridPng(colourOf: (cell: number) => readonly [number, number, number, number]) {
  const pixels = new Uint8Array(grid.columns * grid.rows * 4)
  for (let row = 0; row < grid.rows; row++) {
    for (let column = 0; column < grid.columns; column++) {
      const colour = colourOf((grid.rows - 1 - row) * grid.columns + column)
      pixels.set(colour, (row * grid.columns + column) * 4)
    }
  }
  return encodedPng(grid.columns, grid.rows, pixels)
}

function encodedPng(width: number, height: number, rgba: Uint8Array) {
  const rows = Buffer.alloc((width * 4 + 1) * height)
  for (let row = 0; row < height; row++) {
    rows[row * (width * 4 + 1)] = 0
    rows.set(rgba.subarray(row * width * 4, (row + 1) * width * 4), row * (width * 4 + 1) + 1)
  }
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const typed = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const checksum = Buffer.alloc(4)
    checksum.writeUInt32BE(crc32(typed))
    return Buffer.concat([length, typed, checksum])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 6, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function groundPng(extent: LocalExtent, metresPerPixel: number) {
  const [minX, minY, maxX, maxY] = extent
  const [width, height] = [maxX - minX, maxY - minY]
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" fill="white"/>` +
    mapWindow(mapSvg, map.info.scale, extent, [0, 0, width, height]) +
    `</svg>`
  return rasterised(svg, Math.round(width / metresPerPixel))
}

function rasterised(svg: string, widthPixels: number) {
  return new Resvg(svg, {
    fitTo: { mode: 'width', value: widthPixels },
    background: 'white',
    font: { loadSystemFonts: true },
  })
    .render()
    .asPng()
}

function pointAlong(metres: number): LocalPoint {
  const next = runnerLengths.findIndex(length => length >= metres)
  if (next <= 0) return runnerPath[next === 0 ? 0 : runnerPath.length - 1]!
  const [from, to] = [runnerPath[next - 1]!, runnerPath[next]!]
  const t = (metres - runnerLengths[next - 1]!) / (runnerLengths[next]! - runnerLengths[next - 1]!)
  return localPoint(lerp(from[0], to[0], t), lerp(from[1], to[1], t))
}

function extentOf(points: readonly LocalPoint[], padding: number): LocalExtent {
  const [minX, minY, maxX, maxY] = points.reduce(
    ([x0, y0, x1, y1], [x, y]) => [
      Math.min(x0, x),
      Math.min(y0, y),
      Math.max(x1, x),
      Math.max(y1, y),
    ],
    [Infinity, Infinity, -Infinity, -Infinity],
  )
  return localExtent(minX - padding, minY - padding, maxX + padding, maxY + padding)
}

function centreOf(points: readonly LocalPoint[]): LocalPoint {
  const [minX, minY, maxX, maxY] = extentOf(points, 0)
  return localPoint((minX + maxX) / 2, (minY + maxY) / 2)
}

function distance([x1, y1]: LocalPoint, [x2, y2]: LocalPoint) {
  return Math.hypot(x2 - x1, y2 - y1)
}

function minutesAndSeconds(seconds: number) {
  const whole = Math.round(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

function groupedDigits(value: number) {
  return value.toLocaleString('en').replace(/,/g, ' ')
}

function escaped(label: string) {
  return label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function progress(frame: number, from: number, length: number) {
  return Math.max(0, Math.min(1, (frame - from) / length))
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3
}

function easeInCubic(t: number) {
  return t ** 3
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2
}

function easeOutBack(t: number) {
  const overshoot = 1.70158
  return 1 + (overshoot + 1) * (t - 1) ** 3 + overshoot * (t - 1) ** 2
}

function round(value: number) {
  return Math.round(value * 10) / 10
}
