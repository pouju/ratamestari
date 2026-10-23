// Submodule imports keep ocad2geojson's CLI, QML and vector tile code out of the bundle.

declare module 'ocad2geojson/src/ocad-reader' {
  import type { Buffer } from 'buffer'

  export interface OcadCrs {
    easting: number
    northing: number
    scale: number
    grivation: number
    code: number
    catalog: string | null
    name: string | null
    toProjectedCoord(coord: readonly number[]): number[]
  }

  export interface OcadSymbol {
    symNum: number
    description: string
    type: number
  }

  export interface OcadObject {
    sym: number
    objType: number
  }

  export interface OcadFile {
    header: { version: number; subVersion: number }
    parameterStrings: Record<string, Array<Record<string, string>>>
    objects: OcadObject[]
    symbols: OcadSymbol[]
    warnings: string[]
    getCrs(): OcadCrs
    getBounds(projection?: (c: number[]) => number[]): [number, number, number, number]
  }

  export interface ReadOcadOptions {
    bypassVersionCheck?: boolean
    quietWarnings?: boolean
    failOnWarning?: boolean
  }

  export default function readOcad(buffer: Buffer, options?: ReadOcadOptions): Promise<OcadFile>
}

declare module 'ocad2geojson/src/ocad-to-svg' {
  import type { OcadFile } from 'ocad2geojson/src/ocad-reader'

  export interface OcadToSvgOptions {
    document?: Document
    exportHidden?: boolean
    generateSymbolElements?: boolean
    fill?: string
  }

  export function ocadToSvg(file: OcadFile, options?: OcadToSvgOptions): SVGSVGElement
}
