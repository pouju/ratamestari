import { describe, expect, it } from 'vitest'
import { localPoint } from '@ratamestari/core'
import type { ControlSiteCandidate } from '../src/control-sites'
import { difficultyInCourse, flagSideFor } from '../src/flag-side'

const boulder = (technicalDifficulty: ControlSiteCandidate['technicalDifficulty']) =>
  ({
    id: 0,
    position: localPoint(500, 500),
    isomCode: '204',
    symbolNumber: 204000,
    placement: 'point',
    contourForm: null,
    distanceToLeadingFeatureMeters: 20,
    leadingFeatureDistance: 'near',
    inSlowTerrain: false,
    technicalDifficulty,
    orientation: null,
    similarFeatureOffsets: [],
    flagSide: 'side',
  }) satisfies ControlSiteCandidate

const fromSouth = localPoint(500, 200)

describe('flag side', () => {
  it('hides the flag behind the feature when the class can take a harder control', () => {
    expect(difficultyInCourse(boulder(3), 5)).toBe(4)
    const side = flagSideFor(boulder(3), fromSouth, 5)!
    expect(side.isHiddenFromApproach).toBe(true)
    expect(side.location).toBe('side')
    expect(side.directionRadians).toBeCloseTo(Math.PI / 2)
  })

  it('puts the flag on the side facing the approach for easier classes', () => {
    expect(difficultyInCourse(boulder(2), 2)).toBe(2)
    const side = flagSideFor(boulder(2), fromSouth, 2)!
    expect(side.isHiddenFromApproach).toBe(false)
    expect(side.directionRadians).toBeCloseTo(-Math.PI / 2)
  })

  it('rounds the side to one of eight directions', () => {
    const side = flagSideFor(boulder(3), localPoint(400, 230), 5)!
    expect(side.directionRadians).toBeCloseTo(Math.PI / 2)
  })

  it('leaves features without sides alone', () => {
    const pathEnd = { ...boulder(1), flagSide: null }
    expect(difficultyInCourse(pathEnd, 5)).toBe(1)
    expect(flagSideFor(pathEnd, fromSouth, 5)).toBeNull()
  })
})
