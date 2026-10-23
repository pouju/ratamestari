import type { LocalPoint } from './geometry'

export type LocalGeometry =
  | { readonly type: 'Point'; readonly coordinates: LocalPoint }
  | { readonly type: 'LineString'; readonly coordinates: readonly LocalPoint[] }
  | { readonly type: 'Polygon'; readonly coordinates: readonly (readonly LocalPoint[])[] }

export interface MapFeature {
  readonly symbolNumber: number
  readonly isomCode: string | null
  readonly geometry: LocalGeometry
}
