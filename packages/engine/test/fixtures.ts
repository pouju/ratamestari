import {
  localExtent,
  localPoint,
  type LocalExtent,
  type LocalGeometry,
  type LocalPoint,
  type MapFeature,
} from '@ratamestari/core'

export const SQUARE_KILOMETRE: LocalExtent = localExtent(0, 0, 1000, 1000)

export const feature = (isomCode: string | null, geometry: LocalGeometry): MapFeature => ({
  symbolNumber: 0,
  isomCode,
  geometry,
})

export const rectangle = (
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): LocalGeometry => ({
  type: 'Polygon',
  coordinates: [
    [
      localPoint(minX, minY),
      localPoint(maxX, minY),
      localPoint(maxX, maxY),
      localPoint(minX, maxY),
      localPoint(minX, minY),
    ],
  ],
})

export const line = (...points: [number, number][]): LocalGeometry => ({
  type: 'LineString',
  coordinates: points.map(([x, y]): LocalPoint => localPoint(x, y)),
})

export const point = (x: number, y: number): LocalGeometry => ({
  type: 'Point',
  coordinates: localPoint(x, y),
})
