import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { PaperPoint } from '@ratamestari/core'
import { readCourseData } from '@ratamestari/iof'
import { describe, expect, it } from 'vitest'
import { detectPdfCourse, readPdfPages } from '../src'

// Real event PDFs in the git-ignored maps/ folder, with the IOF XML of the courses printed on them.
const mapsFolder = fileURLToPath(new URL('../../../maps/', import.meta.url))
const examples = [
  {
    pdf: 'map-a-course-c.pdf',
    producer: 'OCAD 2020',
    xml: 'map-a.Courses.xml',
    pages: [{ course: 'C', controls: 10 }],
  },
  {
    pdf: 'map-b-forked.pdf',
    producer: 'Condes',
    xml: 'map-b-forked-courses.xml',
    pages: [null, { course: 'A (a)', controls: 12 }, { course: 'A (b)', controls: 12 }],
  },
]
const MAX_ERROR_METRES = 3
const MILLIMETRES_PER_PAPER_UNIT = 0.01

describe.each(examples)('the course printed on $pdf ($producer)', example => {
  const available = existsSync(mapsFolder + example.pdf) && existsSync(mapsFolder + example.xml)

  it.skipIf(!available)('is read in order and lies on the course in the XML', async () => {
    const pages = await readPdfPages(new Uint8Array(readFileSync(mapsFolder + example.pdf)))
    const data = readCourseData(readFileSync(mapsFolder + example.xml, 'utf8'))

    example.pages.forEach((expected, index) => {
      const course = detectPdfCourse(pages[index]!)!
      if (expected === null) {
        expect(course.ordered).toBe(false)
        return
      }
      expect(course.ordered).toBe(true)
      expect(course.controls).toHaveLength(expected.controls)
      const xmlCourse = data.courses.find(candidate => candidate.name === expected.course)!
      const truth = xmlCourse.controlIds.map(id => data.controls.get(id)!.mapPositionMillimetres!)
      const found = [course.start!, ...course.controls, course.finish!].map(
        ([x, y]: PaperPoint) =>
          [x * MILLIMETRES_PER_PAPER_UNIT, y * MILLIMETRES_PER_PAPER_UNIT] as const,
      )
      const errorMetres = (rmsAfterSimilarity(found, truth) * data.mapScale!) / 1000
      expect(errorMetres).toBeLessThan(MAX_ERROR_METRES)
    })
  })
})

type Point = readonly [number, number]

// The PDF's page position and print scale are unknown, so fit scale, rotation and offset first.
function rmsAfterSimilarity(from: readonly Point[], to: readonly Point[]): number {
  const mean = (points: readonly Point[]) =>
    [0, 1].map(axis => points.reduce((sum, point) => sum + point[axis]!, 0) / points.length)
  const [fromX, fromY] = mean(from) as [number, number]
  const [toX, toY] = mean(to) as [number, number]
  let [real, imaginary, norm] = [0, 0, 0]
  from.forEach(([x, y], i) => {
    const [px, py] = [x - fromX, y - fromY]
    const [qx, qy] = [to[i]![0] - toX, to[i]![1] - toY]
    real += qx * px + qy * py
    imaginary += qy * px - qx * py
    norm += px * px + py * py
  })
  const [a, b] = [real / norm, imaginary / norm]
  const squaredErrors = from.map(([x, y], i) => {
    const [px, py] = [x - fromX, y - fromY]
    return (a * px - b * py + toX - to[i]![0]) ** 2 + (b * px + a * py + toY - to[i]![1]) ** 2
  })
  return Math.sqrt(squaredErrors.reduce((sum, error) => sum + error, 0) / squaredErrors.length)
}
