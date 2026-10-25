import { paperPoint, type PaperPoint } from '@ratamestari/core'
import { MAP_APPEARANCES, type Appearance, type Ink } from '@ratamestari/rules'
import { chainDots } from './chains'
import type { PaperFeature, PaperGeometry } from './classify'
import { median } from './shapes'

type Inked<T extends Appearance['draw']> = Extract<Appearance, { draw: T }> & { code: string }

const DOTTED_LINES = MAP_APPEARANCES.flatMap(({ code, appearance }) =>
  appearance.draw === 'dottedLine' ? [{ ...appearance, code }] : [],
) as Inked<'dottedLine'>[]
const SCATTERED_DOTS = MAP_APPEARANCES.flatMap(({ code, appearance }) =>
  appearance.draw === 'scatteredDots' ? [{ ...appearance, code }] : [],
) as Inked<'scatteredDots'>[]

// Interpretation: dots in an even row are a dotted line; the rest are a dot screen, read as small
// squares of the area they stand for.
export const MAX_DOT_MM = 0.32
const MAX_SPACING_SHARE = 1.6
const SPACING_TOLERANCE = 0.4
const MIN_DOTTED_LINE_DOTS = 4
export const SCATTERED_SQUARE_MM = 0.6

export interface Dot {
  readonly ink: Ink
  readonly centre: PaperPoint
}

export function readDots(
  dots: readonly Dot[],
  toMm: (paperUnits: number) => number,
): PaperFeature[] {
  const byInk = new Map<Ink, PaperPoint[]>()
  for (const dot of dots) byInk.set(dot.ink, [...(byInk.get(dot.ink) ?? []), dot.centre])
  const features: PaperFeature[] = []
  for (const [ink, centres] of byInk) {
    const dottedLine = DOTTED_LINES.find(candidate => candidate.ink === ink)
    const scattered = SCATTERED_DOTS.filter(candidate => candidate.ink === ink)
    const spacingMm = dottedLine?.spacingMm ?? 0.45
    for (const chain of chainDots(centres, (spacingMm * MAX_SPACING_SHARE) / toMm(1))) {
      if (
        dottedLine &&
        chain.points.length >= MIN_DOTTED_LINE_DOTS &&
        isEvenlySpaced(chain.points, dottedLine.spacingMm, toMm)
      ) {
        features.push({
          isomCode: dottedLine.code,
          geometry: { type: 'LineString', coordinates: chain.points },
        })
        continue
      }
      if (scattered.length === 0) continue
      for (const centre of chain.points) {
        const nearestMm = toMm(nearestDistance(centre, centres))
        const code = scattered.reduce((best, candidate) =>
          distanceToRange(nearestMm, candidate.spacingMm) <
          distanceToRange(nearestMm, best.spacingMm)
            ? candidate
            : best,
        ).code
        features.push({
          isomCode: code,
          geometry: squareAround(centre, SCATTERED_SQUARE_MM / toMm(1)),
        })
      }
    }
  }
  return features
}

export function squareAround([x, y]: PaperPoint, side: number): PaperGeometry {
  const half = side / 2
  return {
    type: 'Polygon',
    coordinates: [
      [
        paperPoint(x - half, y - half),
        paperPoint(x + half, y - half),
        paperPoint(x + half, y + half),
        paperPoint(x - half, y + half),
      ],
    ],
  }
}

function isEvenlySpaced(
  points: readonly PaperPoint[],
  spacingMm: number,
  toMm: (paperUnits: number) => number,
): boolean {
  const gaps = points
    .slice(1)
    .map((point, i) => toMm(Math.hypot(point[0] - points[i]![0], point[1] - points[i]![1])))
  return Math.abs(median(gaps) - spacingMm) <= spacingMm * SPACING_TOLERANCE
}

function nearestDistance(centre: PaperPoint, centres: readonly PaperPoint[]): number {
  let best = Infinity
  for (const other of centres) {
    if (other === centre) continue
    const distance = Math.hypot(other[0] - centre[0], other[1] - centre[1])
    if (distance < best) best = distance
  }
  return best
}

const distanceToRange = (value: number, { min, max }: { min: number; max: number }) =>
  value < min ? min - value : value > max ? value - max : 0
