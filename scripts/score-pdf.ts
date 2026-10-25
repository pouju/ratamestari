import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { localPoint, paperPoint, type MapFeature, type PaperPoint } from '@ratamestari/core'
import { readCourseData } from '@ratamestari/iof'
import { loadOcadMap } from '@ratamestari/map-import-ocad'
import { readPdfMap, type PaperGeometry } from '@ratamestari/map-import-pdf'
import { rasteriseByCode, scoreFeatures } from '../packages/map-import-pdf/test/feature-score'
import { fitSimilarity, type Point } from '../packages/map-import-pdf/test/similarity'

// Scores PDF map import against the OCAD file the PDF was printed from: precision and recall per
// ISOM code on a 2 m grid. The course printed on the page, matched to the IOF XML, aligns the two.

const { values } = parseArgs({
  options: {
    pdf: { type: 'string' },
    ocd: { type: 'string' },
    xml: { type: 'string' },
    page: { type: 'string' },
    // Codes to explain: what was read where the OCAD file has the code, and vice versa.
    confuse: { type: 'string' },
    min: { type: 'string', default: '20' },
  },
})
if (!values.pdf || !values.ocd || !values.xml) {
  throw new Error(
    'Usage: score-pdf --pdf map.pdf --ocd map.ocd --xml courses.xml [--page 2] [--confuse 101,202]',
  )
}

const MILLIMETRES_PER_PAPER_UNIT = 0.01
const started = performance.now()
const pages = await readPdfMap(new Uint8Array(readFileSync(values.pdf)))
const readSeconds = (performance.now() - started) / 1000
const data = readCourseData(readFileSync(values.xml, 'utf8'))
const map = await loadOcadMap(new Uint8Array(readFileSync(values.ocd)))

const pageIndex = values.page
  ? Number(values.page) - 1
  : pages.findIndex(page => page.course?.ordered && page.course.start && page.course.finish)
const page = pages[pageIndex]
const course = page?.course
if (!page || !course?.ordered || !course.start || !course.finish) {
  throw new Error('No page with a course in order (start, controls and finish) to align with')
}

const found: Point[] = [course.start, ...course.controls, course.finish].map(([x, y]) => [
  x * MILLIMETRES_PER_PAPER_UNIT,
  y * MILLIMETRES_PER_PAPER_UNIT,
])
const fits = data.courses.flatMap(candidate => {
  const truth = candidate.controlIds.map(id => data.controls.get(id)?.mapPositionMillimetres)
  if (truth.length !== found.length || truth.some(point => !point)) return []
  return [{ name: candidate.name, fit: fitSimilarity(found, truth as Point[]) }]
})
const best = fits.sort((a, b) => a.fit.rms - b.fit.rms)[0]
if (!best) throw new Error('No course in the XML has as many controls as the page')

const toLocal = (point: PaperPoint) => {
  const [x, y] = best.fit.apply([
    point[0] * MILLIMETRES_PER_PAPER_UNIT,
    point[1] * MILLIMETRES_PER_PAPER_UNIT,
  ])
  return localPoint((x * map.info.scale) / 1000, (y * map.info.scale) / 1000)
}
const predicted: MapFeature[] = page.paperFeatures.map(feature => ({
  isomCode: feature.isomCode,
  symbolNumber: 0,
  symbolRotationDegreesCounterClockwise: 0,
  geometry: inLocal(feature.geometry),
}))
const corners = [
  [0, 0],
  [page.page.width, 0],
  [page.page.width, page.page.height],
  [0, page.page.height],
].map(([x, y]) => toLocal(paperPoint(x!, y!)))
const visible = [
  Math.min(...corners.map(([x]) => x)),
  Math.min(...corners.map(([, y]) => y)),
  Math.max(...corners.map(([x]) => x)),
  Math.max(...corners.map(([, y]) => y)),
] as const
const truth = map.features()
const scores = scoreFeatures(predicted, truth, visible)

console.log(
  `page ${pageIndex + 1}: aligned on course ${best.name} (${(best.fit.rms * MILLIMETRES_PER_PAPER_UNIT * 100).toFixed(2)} mm), ` +
    `symbol scale ${page.symbolScale.toFixed(3)}, suggested 1:${page.suggestedPrintScale}, ` +
    `${page.paperFeatures.length} features read in ${readSeconds.toFixed(1)} s`,
)
let total = { overlap: 0, predicted: 0, truth: 0 }
for (const [code, score] of scores) {
  total = {
    overlap: total.overlap + score.overlap,
    predicted: total.predicted + score.predictedCells,
    truth: total.truth + score.truthCells,
  }
  if (score.truthCells + score.predictedCells < Number(values.min)) continue
  const share = (part: number, whole: number) => (whole === 0 ? '   -' : (part / whole).toFixed(2))
  console.log(
    `${code.padEnd(6)} truth ${String(score.truthCells).padStart(7)}  read ${String(score.predictedCells).padStart(7)}` +
      `  precision ${share(score.overlap, score.predictedCells)}  recall ${share(score.overlap, score.truthCells)}`,
  )
}
console.log(
  `overall precision ${(total.overlap / total.predicted).toFixed(2)}, recall ${(total.overlap / total.truth).toFixed(2)}`,
)

if (values.confuse) {
  const readCells = rasteriseByCode(predicted, visible)
  const truthCells = rasteriseByCode(truth, visible)
  for (const code of values.confuse.split(',')) {
    console.log(`OCAD ${code} was read as: ${breakdown(truthCells.get(code), readCells)}`)
    console.log(`read ${code} is in OCAD: ${breakdown(readCells.get(code), truthCells)}`)
  }
}

function breakdown(
  cells: ReadonlySet<number> | undefined,
  other: ReadonlyMap<string, ReadonlySet<number>>,
) {
  if (!cells || cells.size === 0) return 'nothing'
  const counts = new Map<string, number>()
  for (const cell of cells) {
    const codes = [...other].filter(([, set]) => set.has(cell)).map(([code]) => code)
    const key = codes.length > 0 ? codes.sort().join('+') : 'none'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([key, count]) => `${key} ${Math.round((count / cells.size) * 100)}%`)
    .join(', ')
}

function inLocal(geometry: PaperGeometry): MapFeature['geometry'] {
  switch (geometry.type) {
    case 'Point':
      return { type: 'Point', coordinates: toLocal(geometry.coordinates) }
    case 'LineString':
      return { type: 'LineString', coordinates: geometry.coordinates.map(toLocal) }
    case 'Polygon':
      return { type: 'Polygon', coordinates: geometry.coordinates.map(ring => ring.map(toLocal)) }
  }
}
