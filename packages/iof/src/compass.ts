export const COMPASS_POINTS = [
  'north',
  'northEast',
  'east',
  'southEast',
  'south',
  'southWest',
  'west',
  'northWest',
] as const

export type CompassPoint = (typeof COMPASS_POINTS)[number]

const EIGHTH_TURN = Math.PI / 4
const NORTH_RADIANS = Math.PI / 2

export function compassPointOf(radiansFromEast: number): CompassPoint {
  const eighthsClockwiseFromNorth = Math.round((NORTH_RADIANS - radiansFromEast) / EIGHTH_TURN)
  return COMPASS_POINTS[((eighthsClockwiseFromNorth % 8) + 8) % 8]!
}

export function unitVectorOf(point: CompassPoint): readonly [number, number] {
  const radians = NORTH_RADIANS - COMPASS_POINTS.indexOf(point) * EIGHTH_TURN
  return [Math.cos(radians), Math.sin(radians)]
}

export function compassClockwiseDegrees(point: CompassPoint): number {
  return COMPASS_POINTS.indexOf(point) * 45
}
