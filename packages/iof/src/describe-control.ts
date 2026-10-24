import type { ControlSiteCandidate, Offset } from '@ratamestari/engine'
import {
  DESCRIPTION_GEOMETRY,
  isomDescription,
  type DescriptionAppearance,
  type DescriptionFeature,
  type DescriptionLocation,
} from '@ratamestari/rules'
import { COMPASS_POINTS, compassPointOf, unitVectorOf, type CompassPoint } from './compass'

export interface FlagLocation {
  readonly kind: DescriptionLocation
  readonly direction: CompassPoint | null
}

export interface ControlDescription {
  readonly whichOfSimilar: CompassPoint | null
  readonly feature: DescriptionFeature
  readonly appearance: DescriptionAppearance | null
  readonly location: FlagLocation | null
}

interface FeatureAndAppearance {
  readonly feature: DescriptionFeature
  readonly appearance: DescriptionAppearance | null
  readonly flagOnAreaSide: boolean
}

const OPEN_AREA_FEATURES: ReadonlySet<DescriptionFeature> = new Set(['openLand', 'semiOpenLand'])

export function describeControl(site: ControlSiteCandidate): ControlDescription | null {
  const described = featureOf(site)
  if (!described) return null
  const { flagOnAreaSide, ...base } = described
  const whichOfSimilar = whichOfSimilarFeatures(site.similarFeatureOffsets)
  if (whichOfSimilar === 'ambiguous') return null
  const { orientation } = site

  if (site.placement === 'lineEnd' && orientation?.kind === 'end') {
    return {
      ...base,
      whichOfSimilar,
      location: { kind: 'end', direction: compassPointOf(orientation.pointingRadians) },
    }
  }
  if (site.placement === 'areaCorner' && orientation?.kind === 'corner') {
    const direction = compassPointOf(orientation.pointingRadians)
    const isTip = orientation.turnDegrees > DESCRIPTION_GEOMETRY.cornerMaxTurnDegrees
    if (OPEN_AREA_FEATURES.has(base.feature) && !orientation.isConvex) {
      return {
        whichOfSimilar,
        feature: 'forestCorner',
        appearance: null,
        location: isTip ? { kind: 'tip', direction } : null,
      }
    }
    const cornerKind = flagOnAreaSide === orientation.isConvex ? 'cornerInside' : 'cornerOutside'
    return {
      ...base,
      whichOfSimilar,
      location: { kind: isTip ? 'tip' : cornerKind, direction },
    }
  }
  return { ...base, whichOfSimilar, location: null }
}

function featureOf(site: ControlSiteCandidate): FeatureAndAppearance | null {
  const contourFeature = (feature: DescriptionFeature) => ({
    feature,
    appearance: null,
    flagOnAreaSide: true,
  })
  switch (site.placement) {
    case 'contourKnoll':
      if (site.contourForm === 'knoll') return contourFeature('hill')
      if (site.contourForm === 'depression') return contourFeature('depression')
      return null
    case 'contourBend':
      if (site.contourForm === 'spur') return contourFeature('spur')
      if (site.contourForm === 'reEntrant') return contourFeature('reEntrant')
      return null
    default: {
      const mapping = isomDescription(site.isomCode)
      return mapping
        ? {
            feature: mapping.feature,
            appearance: mapping.appearance,
            flagOnAreaSide: mapping.flagOnAreaSide,
          }
        : null
    }
  }
}

function whichOfSimilarFeatures(offsets: readonly Offset[]): CompassPoint | null | 'ambiguous' {
  const competing = offsets.filter(
    offset =>
      Math.hypot(...offset) <= DESCRIPTION_GEOMETRY.similarFeatureNeedsClarifierWithinMeters,
  )
  if (competing.length === 0) return null
  let best: { point: CompassPoint; margin: number } | null = null
  for (const point of COMPASS_POINTS) {
    const [ux, uy] = unitVectorOf(point)
    const margin = Math.min(...competing.map(([dx, dy]) => -(dx * ux + dy * uy)))
    if (!best || margin > best.margin) best = { point, margin }
  }
  return best && best.margin >= DESCRIPTION_GEOMETRY.similarFeatureClearMarginMeters
    ? best.point
    : 'ambiguous'
}
