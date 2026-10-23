import {
  localPoint,
  paperPoint,
  projectedPoint,
  type LocalExtent,
  type LocalPoint,
  type PaperPoint,
  type ProjectedPoint,
} from './geometry'

export interface Georef {
  readonly epsg: number
  readonly originInProjected: ProjectedPoint
  readonly grivationRadians: number
}

export interface MapInfo {
  readonly scale: number
  readonly extent: LocalExtent
  readonly georef: Georef | null
}

const HUNDREDTHS_MM_PER_METER = 100 * 1000

export const paperToLocal = (p: PaperPoint, scale: number): LocalPoint =>
  localPoint((p[0] * scale) / HUNDREDTHS_MM_PER_METER, (p[1] * scale) / HUNDREDTHS_MM_PER_METER)

export const localToPaper = (p: LocalPoint, scale: number): PaperPoint =>
  paperPoint((p[0] * HUNDREDTHS_MM_PER_METER) / scale, (p[1] * HUNDREDTHS_MM_PER_METER) / scale)

export const localToProjected = (p: LocalPoint, georef: Georef): ProjectedPoint => {
  const cos = Math.cos(georef.grivationRadians)
  const sin = Math.sin(georef.grivationRadians)
  const [originE, originN] = georef.originInProjected
  return projectedPoint(originE + p[0] * cos + p[1] * sin, originN - p[0] * sin + p[1] * cos)
}

export const projectedToLocal = (p: ProjectedPoint, georef: Georef): LocalPoint => {
  const cos = Math.cos(georef.grivationRadians)
  const sin = Math.sin(georef.grivationRadians)
  const dE = p[0] - georef.originInProjected[0]
  const dN = p[1] - georef.originInProjected[1]
  return localPoint(dE * cos - dN * sin, dE * sin + dN * cos)
}
