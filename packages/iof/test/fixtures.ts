import { localPoint } from '@ratamestari/core'
import type { ControlSiteCandidate } from '@ratamestari/engine'

export const site = (overrides: Partial<ControlSiteCandidate> = {}): ControlSiteCandidate => ({
  id: 0,
  position: localPoint(500, 500),
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
  ...overrides,
})

export const NORTH_WEST = (3 * Math.PI) / 4
