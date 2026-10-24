import type { LocalPoint } from '@ratamestari/core'
import { HIDDEN_FLAG_SIDE, type FlagSideLocation } from '@ratamestari/rules'
import type { ControlSiteCandidate, TechnicalDifficulty } from './control-sites'

export interface FlagSide {
  readonly location: FlagSideLocation
  readonly directionRadians: number
  readonly isHiddenFromApproach: boolean
}

const EIGHTH_TURN = Math.PI / 4
const normalised = (radians: number) => Math.atan2(Math.sin(radians), Math.cos(radians))

const hidesFlag = (site: ControlSiteCandidate, maxDifficulty: number) =>
  site.flagSide !== null &&
  site.technicalDifficulty + HIDDEN_FLAG_SIDE.difficultyStep <= maxDifficulty

export function difficultyInCourse(
  site: ControlSiteCandidate,
  maxDifficulty: number,
): TechnicalDifficulty {
  return hidesFlag(site, maxDifficulty)
    ? ((site.technicalDifficulty + HIDDEN_FLAG_SIDE.difficultyStep) as TechnicalDifficulty)
    : site.technicalDifficulty
}

export function flagSideFor(
  site: ControlSiteCandidate,
  approachingFrom: LocalPoint,
  maxDifficulty: number,
): FlagSide | null {
  if (site.flagSide === null) return null
  const isHidden = hidesFlag(site, maxDifficulty)
  const awayFromApproach = Math.atan2(
    site.position[1] - approachingFrom[1],
    site.position[0] - approachingFrom[0],
  )
  const direction = isHidden ? awayFromApproach : awayFromApproach + Math.PI
  return {
    location: site.flagSide,
    directionRadians: normalised(Math.round(direction / EIGHTH_TURN) * EIGHTH_TURN),
    isHiddenFromApproach: isHidden,
  }
}
