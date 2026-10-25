export type { PaperFeature, PaperGeometry } from './classify'
export type { PaperRectangle } from './description-box'
export type { GeoReference } from './geo-pdf'
export { detectPdfCourse } from './pdf-course'
export { readPdfMap, type PdfMap, type PdfMapPage } from './pdf-map'
export {
  readPdfPages,
  type PdfClip,
  type PdfPageContent,
  type PdfPaint,
  type PdfPath,
  type PdfSubpath,
  type PdfText,
} from './pdf-paths'
export { renderPdfPageSvg } from './render-svg'
export { setPdfWorkerUrl } from './pdf-paths'
