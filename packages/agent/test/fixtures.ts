import { localPoint } from '@ratamestari/core'
import type { ControlSiteCandidate, Course, CourseProblems } from '@ratamestari/engine'
import type { CourseRequest } from '@ratamestari/rules'

export const site = (
  x: number,
  y: number,
  overrides: Partial<ControlSiteCandidate> = {},
): ControlSiteCandidate => ({
  id: 0,
  position: localPoint(x, y),
  isomCode: '204',
  symbolNumber: 204000,
  placement: 'point',
  contourForm: null,
  distanceToLeadingFeatureMeters: 100,
  leadingFeatureDistance: 'far',
  inSlowTerrain: false,
  technicalDifficulty: 4,
  orientation: null,
  similarFeatureOffsets: [],
  flagSide: null,
  ...overrides,
})

export const NO_PROBLEMS: CourseProblems = {
  spacing: 0,
  acuteAngleWarnings: 0,
  acuteAngleNotes: 0,
  difficultyOutsideRange: 0,
  courseLineCrossings: 0,
  courseLinesThroughControls: 0,
  courseLinesOutsideMap: 0,
  courseLinesOverDescriptions: 0,
  overlappingCircles: 0,
  finalLegTooLong: false,
}

export const COURSE: Course = {
  seed: 3,
  start: site(1234.5, 2345.5, { isomCode: '505', placement: 'lineEnd', technicalDifficulty: 1 }),
  controls: [
    site(1534.5, 2745.5),
    site(1834.5, 2745.5, { placement: 'contourBend', contourForm: 'reEntrant' }),
  ],
  finish: localPoint(1234.5, 2745.5),
  controlDifficulties: [4, 4],
  flagSides: [null, null],
  legSeconds: [150, 90, 180],
  estimatedSeconds: 420,
  targetSeconds: 450,
  lengthMeters: 1234,
  climbMeters: 42,
  problems: { ...NO_PROBLEMS, spacing: 1 },
  printArea: null,
  findings: [{ kind: 'spacing', stops: [1, 2] }],
  breakdown: { total: 0, terms: {} } as unknown as Course['breakdown'],
  score: 0,
}

export const H21_LONG_SM: CourseRequest = {
  eventLevel: 'finnishChampionship',
  format: 'long',
  sex: 'H',
  ageClass: 21,
  skillLetter: 'A',
}
