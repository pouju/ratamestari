import type { Brand } from './brand'

export type Meters = Brand<number, 'Meters'>
export type LocalPoint = Brand<readonly [x: number, y: number], 'LocalPoint'>
export type ProjectedPoint = Brand<readonly [easting: number, northing: number], 'ProjectedPoint'>
export type PaperPoint = Brand<readonly [x: number, y: number], 'PaperPoint'>
export type LocalExtent = Brand<
  readonly [minX: number, minY: number, maxX: number, maxY: number],
  'LocalExtent'
>

export const meters = (value: number): Meters => value as Meters
export const localPoint = (x: number, y: number): LocalPoint => [x, y] as const as LocalPoint
export const projectedPoint = (easting: number, northing: number): ProjectedPoint =>
  [easting, northing] as const as ProjectedPoint
export const paperPoint = (x: number, y: number): PaperPoint => [x, y] as const as PaperPoint
export const localExtent = (minX: number, minY: number, maxX: number, maxY: number): LocalExtent =>
  [minX, minY, maxX, maxY] as const as LocalExtent

export const distance = (a: LocalPoint, b: LocalPoint): Meters =>
  meters(Math.hypot(b[0] - a[0], b[1] - a[1]))

export const extentWidth = (e: LocalExtent): Meters => meters(e[2] - e[0])
export const extentHeight = (e: LocalExtent): Meters => meters(e[3] - e[1])
