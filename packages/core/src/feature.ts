import type { LocalExtent, LocalPoint } from './geometry'

export type LocalGeometry =
  | { readonly type: 'Point'; readonly coordinates: LocalPoint }
  | { readonly type: 'LineString'; readonly coordinates: readonly LocalPoint[] }
  | { readonly type: 'Polygon'; readonly coordinates: readonly (readonly LocalPoint[])[] }

export interface MapFeature {
  readonly symbolNumber: number
  readonly isomCode: string | null
  readonly symbolRotationDegreesCounterClockwise: number
  readonly geometry: LocalGeometry
}

// The outline of one map object, for finding what is drawn in the map's margin: titles, logos and
// copyright notices have no terrain meaning (ISOM code), though a logo may borrow map symbols.
export interface MapAnnotation {
  readonly objectIndex: number
  readonly symbolNumber: number
  readonly hasTerrainMeaning: boolean
  readonly text: string | null
  readonly extent: LocalExtent
}
