import { detectCourse, isOverprintColor, type DetectedCourse } from '@ratamestari/course-detect'
import type { PdfPageContent, PdfPaint } from './pdf-paths'

const isOverprint = (paint: PdfPaint | null) =>
  paint?.kind === 'color' && isOverprintColor(paint.color)

// The course printed on a page; its path indices refer to `page.paths`.
export function detectPdfCourse(page: PdfPageContent): DetectedCourse | null {
  const pageIndices: number[] = []
  const overprint = page.paths.flatMap((path, index) => {
    const stroked = isOverprint(path.stroke)
    const filled = isOverprint(path.fill)
    if (!stroked && !filled) return []
    pageIndices.push(index)
    return [{ subpaths: path.subpaths, stroked, filled }]
  })
  const course = detectCourse(overprint)
  if (!course) return null
  return {
    ...course,
    coursePathIndices: new Set([...course.coursePathIndices].map(index => pageIndices[index]!)),
  }
}
