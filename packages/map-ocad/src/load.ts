/// <reference path="./ocad2geojson.d.ts" />
import { Buffer } from 'buffer'
import readOcad, { type OcadFile } from 'ocad2geojson/src/ocad-reader'
import { ocadToSvg } from 'ocad2geojson/src/ocad-to-svg'
import {
  localExtent,
  paperPoint,
  paperToLocal,
  projectedPoint,
  type Georef,
  type MapInfo,
} from '@ratamestari/core'

const BACKGROUND_MAP_RECORD_TYPE = '8'
const SCALE_PARAMETERS_RECORD_TYPE = '1039'

export interface OcadMap {
  readonly info: MapInfo
  readonly backgroundMapPaths: readonly string[]
  readonly objectCount: number
  renderSvg(document: Document): SVGSVGElement
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
