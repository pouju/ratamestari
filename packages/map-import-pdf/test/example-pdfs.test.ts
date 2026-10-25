import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  localPoint,
  localToProjected,
  paperPoint,
  paperToLocal,
  projectedToGeographic,
  type LocalPoint,
  type MapFeature,
  type PaperPoint,
} from '@ratamestari/core'
import { readCourseData, type ImportedCourseData } from '@ratamestari/iof'
import { loadOcadMap } from '@ratamestari/map-import-ocad'
import { describe, expect, it } from 'vitest'
import { readPdfMap, type PaperGeometry, type PdfMapPage } from '../src'
import { scoreFeatures } from './feature-score'
import { fitSimilarity, type Point, type Similarity } from './similarity'

// Real event PDFs in the git-ignored maps/ folder, with the OCAD map and the IOF XML of the
// courses printed on them.
const mapsFolder = fileURLToPath(new URL('../../../maps/', import.meta.url))
const examples = [
  {
    pdf: 'map-a-course-c.pdf',
    producer: 'OCAD 2020',
    ocd: 'map-a.ocd',
    xml: 'map-a.Courses.xml',
    printScale: 7500,
    // The description table runs off the page after control 5, so only some codes are there.
    pages: [{ course: 'C', controls: 10, allCodes: false }],
  },
  {
    pdf: 'map-b-forked.pdf',
    producer: 'Condes',
    ocd: 'map-b.ocd',
    xml: 'map-b-forked-courses.xml',
    printScale: 10000,
    pages: [
      null,
      { course: 'A (a)', controls: 12, allCodes: true },
      { course: 'A (b)', controls: 12, allCodes: true },
    ],
  },
]
const MAX_COURSE_ERROR_METRES = 3
const METRES_PER_DEGREE_LATITUDE = 111_320
const MIN_FEATURE_PRECISION = 0.9
const MIN_FEATURE_RECALL = 0.85
const MILLIMETRES_PER_PAPER_UNIT = 0.01
const TIMEOUT_MS = 60_000

describe.each(examples)('$pdf ($producer)', example => {
  const available = [example.pdf, example.ocd, example.xml].every(file =>
    existsSync(mapsFolder + file),
  )
  const read = async () => ({
    pages: (await readPdfMap(new Uint8Array(readFileSync(mapsFolder + example.pdf)))).pages,
    data: readCourseData(readFileSync(mapsFolder + example.xml, 'utf8')),
  })

  it.skipIf(!available)('has its course read in order, where the XML puts it', async () => {
    const { pages, data } = await read()
    example.pages.forEach((expected, index) => {
      const course = pages[index]!.course!
      if (expected === null) {
        expect(course.ordered).toBe(false)
        return
      }
      expect(course.ordered).toBe(true)
      expect(course.controls).toHaveLength(expected.controls)
      const errorMetres =
        (courseFit(pages[index]!, data, expected.course).rms * data.mapScale!) / 1000
      expect(errorMetres).toBeLessThan(MAX_COURSE_ERROR_METRES)
    })
  })

  it.skipIf(!available)('has its control codes read, and none read wrong', async () => {
    const { pages, data } = await read()
    example.pages.forEach((expected, index) => {
      if (expected === null) return
      const xmlCourse = data.courses.find(candidate => candidate.name === expected.course)!
      const truth = xmlCourse.controlIds.filter(id => data.controls.get(id)!.type === 'Control')
      const codes = pages[index]!.controlCodes
      codes.forEach((code, i) => {
        if (code !== null) expect(code).toBe(truth[i])
      })
      if (expected.allCodes) expect(codes).toEqual(truth)
      else expect(codes.some(code => code !== null)).toBe(true)
    })
  })

  it.skipIf(!available)('is georeferenced so the course lies where the XML says', async () => {
    const { pages, data } = await read()
    example.pages.forEach((expected, index) => {
      if (expected === null) return
      const page = pages[index]!
      const georef = page.info(page.suggestedPrintScale).georef!
      const course = page.course!
      const ids = data.courses.find(candidate => candidate.name === expected.course)!.controlIds
      ;[course.start!, ...course.controls, course.finish!].forEach((stop, i) => {
        const local = paperToLocal(stop, page.suggestedPrintScale)
        const place = projectedToGeographic(localToProjected(local, georef), georef.epsg)!
        const [longitude, latitude] = data.controls.get(ids[i]!)!.longitudeLatitude!
        const northMetres = (place.latitudeDegrees - latitude) * METRES_PER_DEGREE_LATITUDE
        const eastMetres =
          (place.longitudeDegrees - longitude) *
          METRES_PER_DEGREE_LATITUDE *
          Math.cos((latitude * Math.PI) / 180)
        expect(Math.hypot(northMetres, eastMetres)).toBeLessThan(MAX_COURSE_ERROR_METRES)
      })
    })
  })

  it.skipIf(!available)(
    'suggests the print scale and reads the map like the OCAD file has it',
    async () => {
      const { pages, data } = await read()
      const map = await loadOcadMap(new Uint8Array(readFileSync(mapsFolder + example.ocd)))
      const index = example.pages.findIndex(expected => expected !== null)
      const page = pages[index]!
      expect(page.suggestedPrintScale).toBe(example.printScale)

      const fit = courseFit(page, data, example.pages[index]!.course)
      const toLocal = (point: PaperPoint) => {
        const [x, y] = fit.apply([
          point[0] * MILLIMETRES_PER_PAPER_UNIT,
          point[1] * MILLIMETRES_PER_PAPER_UNIT,
        ])
        return localPoint((x * map.info.scale) / 1000, (y * map.info.scale) / 1000)
      }
      const predicted: MapFeature[] = page.paperFeatures.map(feature => ({
        isomCode: feature.isomCode,
        symbolNumber: 0,
        symbolRotationDegreesCounterClockwise: 0,
        geometry: inLocal(feature.geometry, toLocal),
      }))
      const corners = [
        [0, 0],
        [page.page.width, 0],
        [page.page.width, page.page.height],
        [0, page.page.height],
      ].map(([x, y]) => toLocal(paperPoint(x!, y!)))
      const scores = scoreFeatures(predicted, map.features(), [
        Math.min(...corners.map(([x]) => x)),
        Math.min(...corners.map(([, y]) => y)),
        Math.max(...corners.map(([x]) => x)),
        Math.max(...corners.map(([, y]) => y)),
      ])
      const total = [...scores.values()].reduce(
        (sum, score) => ({
          overlap: sum.overlap + score.overlap,
          predicted: sum.predicted + score.predictedCells,
          truth: sum.truth + score.truthCells,
        }),
        { overlap: 0, predicted: 0, truth: 0 },
      )
      expect(total.overlap / total.predicted).toBeGreaterThan(MIN_FEATURE_PRECISION)
      expect(total.overlap / total.truth).toBeGreaterThan(MIN_FEATURE_RECALL)
    },
    TIMEOUT_MS,
  )
})

// The PDF's page position and print scale are unknown, so the course fixes them: a fit from the
// page (millimetres) onto OCAD paper millimetres.
function courseFit(page: PdfMapPage, data: ImportedCourseData, courseName: string): Similarity {
  const course = page.course!
  const xmlCourse = data.courses.find(candidate => candidate.name === courseName)!
  const truth = xmlCourse.controlIds.map(id => data.controls.get(id)!.mapPositionMillimetres!)
  const found = [course.start!, ...course.controls, course.finish!].map(([x, y]): Point => [
    x * MILLIMETRES_PER_PAPER_UNIT,
    y * MILLIMETRES_PER_PAPER_UNIT,
  ])
  return fitSimilarity(found, truth)
}

function inLocal(
  geometry: PaperGeometry,
  toLocal: (point: PaperPoint) => LocalPoint,
): MapFeature['geometry'] {
  switch (geometry.type) {
    case 'Point':
      return { type: 'Point', coordinates: toLocal(geometry.coordinates) }
    case 'LineString':
      return { type: 'LineString', coordinates: geometry.coordinates.map(toLocal) }
    case 'Polygon':
      return { type: 'Polygon', coordinates: geometry.coordinates.map(ring => ring.map(toLocal)) }
  }
}
