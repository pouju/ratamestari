import { isomSymbolRule, type Movement } from '@ratamestari/rules'

const RUNNABILITY_WORDS = ['', 'easy running', 'normal running', 'slow running', 'walk', 'fight']

const MOVEMENT_WORDS: Readonly<Record<Movement['kind'], string>> = {
  runnability: '',
  noEffect: 'no effect on running',
  crossingSlows: 'slows crossing',
  crossingPoint: 'crossing point',
  impassable: 'impassable',
  forbidden: 'forbidden to enter',
  forbiddenAlong: 'forbidden to follow',
  forbiddenExceptLevelCrossings: 'forbidden except at level crossings',
  mandatoryRoute: 'mandatory route',
  combinedWithOtherSymbols: 'combined with other symbols',
  runnabilityFromBackground: 'runnability from the background',
  courseOverprint: 'course overprint',
  notTerrain: 'not terrain',
}

const CONTROL_SITE_WORDS = {
  yes: 'control site',
  edge: 'control sites at its edges',
  weak: 'control site only at distinct points',
  no: 'no control sites',
  avoid: 'no controls inside',
  contourShape: 'control sites from its shape',
  notApplicable: '',
} as const

export function isomEffect(isomCode: string | null): string {
  if (isomCode === null) return 'ignored'
  const rule = isomSymbolRule(isomCode)
  if (!rule) return 'unknown ISOM symbol'
  const { movement } = rule
  const moving =
    movement.kind === 'runnability'
      ? `${RUNNABILITY_WORDS[movement.runnabilityClass]} (runnability ${movement.runnabilityClass})`
      : MOVEMENT_WORDS[movement.kind]
  return [moving, CONTROL_SITE_WORDS[rule.controlSite]].filter(Boolean).join(', ')
}
