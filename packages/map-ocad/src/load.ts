/// <reference path="./ocad2geojson.d.ts" />
import { Buffer } from 'buffer'
import readOcad, { type OcadFile } from 'ocad2geojson/src/ocad-reader'
import ocadToGeoJson, { type OcadGeometry, type Position } from 'ocad2geojson/src/ocad-to-geojson'
import { ocadToSvg } from 'ocad2geojson/src/ocad-to-svg'
import {
  localExtent,
  paperPoint,
  paperToLocal,
  projectedPoint,
  type Georef,
  type LocalGeometry,
  type LocalPoint,
  type MapFeature,
  type MapInfo,
} from '@ratamestari/core'
import { isomCodeForOcadSymbol, type IsomCodeOverrides } from './isom-code'

const BACKGROUND_MAP_RECORD_TYPE = '8'
const SCALE_PARAMETERS_RECORD_TYPE = '1039'
const OCAD_ANGLE_UNITS_PER_DEGREE = 10

export interface MapSymbol {
  readonly number: number
  readonly name: string
  readonly objectCount: number
}

export interface OcadMap {
  readonly info: MapInfo
  readonly backgroundMapPaths: readonly string[]
  readonly objectCount: number
  renderSvg(document: Document): SVGSVGElement
  features(isomCodeOverrides?: IsomCodeOverrides): readonly MapFeature[]
  symbols(): readonly MapSymbol[]
}

export async function loadOcadMap(bytes: Uint8Array): Promise<OcadMap> {
  const file = await readOcad(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), {
    quietWarnings: true,
  })
  const scale = file.getCrs().scale
  if (!(scale > 0)) throw new Error('OCAD file has no map scale')

  const [minX, minY, maxX, maxY] = file.getBounds()
  const min = paperToLocal(paperPoint(minX, minY), scale)
  const max = paperToLocal(paperPoint(maxX, maxY), scale)
  let cachedFeatures: readonly MapFeature[] | undefined
  const defaultFeatures = () => (cachedFeatures ??= readFeatures(file, scale))

  return {
    info: {
      scale,
      extent: localExtent(min[0], min[1], max[0], max[1]),
      georef: readGeoref(file),
    },
    backgroundMapPaths: (file.parameterStrings[BACKGROUND_MAP_RECORD_TYPE] ?? []).map(
      record => record['_first'] ?? '',
    ),
    objectCount: file.objects.length,
    renderSvg: document => ocadToSvg(file, { document }),
    features: overrides =>
      overrides && overrides.size > 0
        ? defaultFeatures().map(feature => ({
            ...feature,
            isomCode: isomCodeForOcadSymbol(feature.symbolNumber, overrides),
          }))
        : defaultFeatures(),
    symbols: () => usedSymbols(file),
  }
}

function readFeatures(file: OcadFile, scale: number): MapFeature[] {
  const toLocal = ([x, y]: Position) => paperToLocal(paperPoint(x, y), scale)
  const { features } = ocadToGeoJson(file, { applyCrs: false, generateSymbolElements: false })
  return features.flatMap(({ properties, geometry }) =>
    geometry
      ? [
          {
            symbolNumber: properties.sym,
            isomCode: isomCodeForOcadSymbol(properties.sym),
            symbolRotationDegreesCounterClockwise: normalizeDegrees(
              (properties.ang ?? 0) / OCAD_ANGLE_UNITS_PER_DEGREE,
            ),
            geometry: toLocalGeometry(geometry, toLocal),
          },
        ]
      : [],
  )
}

function usedSymbols(file: OcadFile): MapSymbol[] {
  const counts = new Map<number, number>()
  for (const { sym } of file.objects) counts.set(sym, (counts.get(sym) ?? 0) + 1)
  const names = new Map(file.symbols.map(symbol => [symbol.symNum, symbol.description]))
  return [...counts]
    .sort(([a], [b]) => a - b)
    .map(([number, objectCount]) => ({
      number,
      name: names.get(number)?.trim() ?? '',
      objectCount,
    }))
}

function toLocalGeometry(
  geometry: OcadGeometry,
  toLocal: (position: Position) => LocalPoint,
): LocalGeometry {
  switch (geometry.type) {
    case 'Point':
      return { type: 'Point', coordinates: toLocal(geometry.coordinates) }
    case 'LineString':
      return { type: 'LineString', coordinates: geometry.coordinates.map(toLocal) }
    case 'Polygon':
      return { type: 'Polygon', coordinates: geometry.coordinates.map(ring => ring.map(toLocal)) }
  }
}

function readGeoref(file: OcadFile): Georef | null {
  const hasScaleParameters = file.parameterStrings[SCALE_PARAMETERS_RECORD_TYPE] !== undefined
  const crs = file.getCrs()
  if (!hasScaleParameters || crs.catalog !== 'EPSG' || !crs.code) return null
  return {
    epsg: crs.code,
    originInProjected: projectedPoint(crs.easting, crs.northing),
    grivationRadians: crs.grivation,
  }
}

const normalizeDegrees = (degrees: number) => ((degrees % 360) + 360) % 360
