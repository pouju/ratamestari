import type { DetectedCourse } from '@ratamestari/course-detect'
import { COURSE_OVERPRINT } from '@ratamestari/rules'
import { colourFamilyOf } from './colour-family'
import type { PdfPageContent } from './pdf-paths'

const PAPER_UNITS_PER_MM = 100
const MIN_CONTOUR_PIECE_MM = 3

// How much larger than ISOM's 1:15 000 dimensions the symbols are printed on this page, e.g.
// 1.5 for a 1:15 000 map printed at 1:10 000. The control circle is the best ruler; without a
// course, the most common width of long brown lines (the contours) is.
export function symbolScaleOf(
  page: PdfPageContent,
  course: DetectedCourse | null,
  contourWidthMm: number,
): number | null {
  if (course) {
    const circleDiameterMm = (2 * course.controlRadius) / PAPER_UNITS_PER_MM
    return circleDiameterMm / COURSE_OVERPRINT.controlCircleDiameterMillimetres
  }
  const widthVotes = new Map<number, number>()
  for (const path of page.paths) {
    if (path.stroke?.kind !== 'color' || colourFamilyOf(path.stroke.color) !== 'brown') continue
    const length = path.subpaths.reduce(
      (sum, { points }) =>
        sum +
        points.reduce(
          (inner, point, i) =>
            i === 0
              ? inner
              : inner + Math.hypot(point[0] - points[i - 1]![0], point[1] - points[i - 1]![1]),
          0,
        ),
      0,
    )
    if (length < MIN_CONTOUR_PIECE_MM * PAPER_UNITS_PER_MM) continue
    const width = Math.round(path.lineWidth)
    widthVotes.set(width, (widthVotes.get(width) ?? 0) + length)
  }
  const [mostCommon] = [...widthVotes].sort((a, b) => b[1] - a[1])
  return mostCommon ? mostCommon[0] / PAPER_UNITS_PER_MM / contourWidthMm : null
}
