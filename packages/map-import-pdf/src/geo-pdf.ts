import {
  geographicToProjected,
  projectedSystemFor,
  type GeographicPoint,
  type PaperPoint,
} from '@ratamestari/core'
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFString,
  type PDFObject,
} from 'pdf-lib'

// Geospatial PDF (ISO 32000-2 §12.10, Adobe's geospatial extension): a page's viewports (/VP)
// carry a measure dictionary with geographic points (/GPTS, latitude then longitude) for points
// of the viewport's unit square (/LPTS).
export interface GeoReference {
  readonly epsg: number
  // Paper units of the page to projected metres: scale, rotation and offset.
  readonly metresPerPaperUnit: number
  readonly rotationRadians: number
  readonly origin: readonly [easting: number, northing: number]
  readonly rmsErrorMetres: number
}

const HUNDREDTHS_MM_PER_PDF_POINT = (25.4 / 72) * 100
const GEOGRAPHIC_EPSG = 4326

export async function readGeoReferences(bytes: Uint8Array): Promise<(GeoReference | null)[]> {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  return pdf.getPages().map(page => {
    const { x, y } = page.getCropBox()
    const viewports = page.node.lookup(PDFName.of('VP'))
    if (!(viewports instanceof PDFArray)) return null
    const references = viewports
      .asArray()
      .map(viewport => geoReferenceOf(pdf, viewport, [x, y]))
      .filter((reference): reference is GeoReference => reference !== null)
    return references[0] ?? null
  })
}

function geoReferenceOf(
  pdf: PDFDocument,
  viewportObject: PDFObject,
  [viewX, viewY]: readonly [number, number],
): GeoReference | null {
  const viewport = pdf.context.lookup(viewportObject)
  if (!(viewport instanceof PDFDict)) return null
  const measure = viewport.lookup(PDFName.of('Measure'))
  if (!(measure instanceof PDFDict)) return null
  if (measure.lookup(PDFName.of('Subtype'))?.toString() !== '/GEO') return null
  const box = numbers(viewport.lookup(PDFName.of('BBox')))
  const geographic = numbers(measure.lookup(PDFName.of('GPTS')))
  const unit = numbers(measure.lookup(PDFName.of('LPTS')))
  if (box.length !== 4 || geographic.length < 6 || unit.length !== geographic.length) return null

  const [x1, y1, x2, y2] = box as [number, number, number, number]
  const places = pairs(geographic).map(([latitudeDegrees, longitudeDegrees]): GeographicPoint => ({
    latitudeDegrees,
    longitudeDegrees,
  }))
  const epsg = projectedEpsgOf(measure) ?? projectedSystemFor(places[0]!)
  const projected = places.map(place => geographicToProjected(place, epsg))
  if (projected.some(point => point === null)) return null
  const paper = pairs(unit).map(
    ([u, v]) =>
      [
        (x1 + u * (x2 - x1) - viewX) * HUNDREDTHS_MM_PER_PDF_POINT,
        (y1 + v * (y2 - y1) - viewY) * HUNDREDTHS_MM_PER_PDF_POINT,
      ] as const,
  )
  return { epsg, ...similarity(paper, projected as unknown as (readonly [number, number])[]) }
}

function projectedEpsgOf(measure: PDFDict): number | null {
  for (const key of ['PCS', 'GCS']) {
    const system = measure.lookup(PDFName.of(key))
    if (!(system instanceof PDFDict)) continue
    const epsg = system.lookup(PDFName.of('EPSG'))
    if (epsg instanceof PDFNumber && epsg.asNumber() !== GEOGRAPHIC_EPSG) return epsg.asNumber()
    const wkt = system.lookup(PDFName.of('WKT'))
    const code =
      wkt instanceof PDFString ? /AUTHORITY\["EPSG","(\d+)"\]\]$/.exec(wkt.asString()) : null
    if (code && Number(code[1]) !== GEOGRAPHIC_EPSG) return Number(code[1])
  }
  return null
}

// Least-squares scale, rotation and offset from page paper units onto projected metres.
function similarity(
  from: readonly (readonly [number, number])[],
  to: readonly (readonly [number, number])[],
) {
  const mean = (points: readonly (readonly [number, number])[]) =>
    [0, 1].map(axis => points.reduce((sum, point) => sum + point[axis]!, 0) / points.length) as [
      number,
      number,
    ]
  const [fromX, fromY] = mean(from)
  const [toX, toY] = mean(to)
  let [real, imaginary, norm] = [0, 0, 0]
  from.forEach(([x, y], i) => {
    const [px, py] = [x - fromX, y - fromY]
    const [qx, qy] = [to[i]![0] - toX, to[i]![1] - toY]
    real += qx * px + qy * py
    imaginary += qy * px - qx * py
    norm += px * px + py * py
  })
  const [a, b] = [real / norm, imaginary / norm]
  const apply = ([x, y]: readonly [number, number]) =>
    [a * (x - fromX) - b * (y - fromY) + toX, b * (x - fromX) + a * (y - fromY) + toY] as const
  const squaredErrors = from.map((point, i) => {
    const [x, y] = apply(point)
    return (x - to[i]![0]) ** 2 + (y - to[i]![1]) ** 2
  })
  return {
    metresPerPaperUnit: Math.hypot(a, b),
    rotationRadians: Math.atan2(b, a),
    origin: apply([0, 0]),
    rmsErrorMetres: Math.sqrt(squaredErrors.reduce((sum, e) => sum + e, 0) / squaredErrors.length),
  }
}

export const projectedOf = (reference: GeoReference, [x, y]: PaperPoint) => {
  const [cos, sin] = [Math.cos(reference.rotationRadians), Math.sin(reference.rotationRadians)]
  const m = reference.metresPerPaperUnit
  return [
    reference.origin[0] + m * (cos * x - sin * y),
    reference.origin[1] + m * (sin * x + cos * y),
  ] as const
}

function numbers(object: PDFObject | undefined): number[] {
  if (!(object instanceof PDFArray)) return []
  return object.asArray().flatMap(item => (item instanceof PDFNumber ? [item.asNumber()] : []))
}

const pairs = (values: readonly number[]) =>
  values.flatMap((value, i) => (i % 2 === 0 ? [[value, values[i + 1]!] as const] : []))
