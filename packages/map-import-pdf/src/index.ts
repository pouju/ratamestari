export type { PaperFeature, PaperGeometry } from './classify'
export type { PaperRectangle } from './description-box'
export { detectPdfCourse } from './pdf-course'
export { readPdfMap, type PdfMapPage } from './pdf-map'
export {
  readPdfPages,
  type PdfClip,
  type PdfPageContent,
  type PdfPaint,
  type PdfPath,
  type PdfSubpath,
  type PdfText,
} from './pdf-paths'
