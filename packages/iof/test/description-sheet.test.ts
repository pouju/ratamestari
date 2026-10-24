import { describe, expect, it } from 'vitest'
import { localPoint } from '@ratamestari/core'
import type { Course } from '@ratamestari/engine'
import { allowedControlCodes, descriptionSheet } from '../src/description-sheet'
import { site } from './fixtures'

const course: Course = {
  seed: 1,
  start: site({ position: localPoint(0, 0), isomCode: '526' }),
  controls: [
    site({ position: localPoint(300, 0) }),
    site({ position: localPoint(300, 400), isomCode: '112' }),
  ],
  finish: localPoint(300, 523),
  controlDifficulties: [4, 4],
  flagSides: [null, null],
  legSeconds: [100, 100, 50],
  estimatedSeconds: 250,
  targetSeconds: 250,
  lengthMeters: 1234,
  climbMeters: 37,
  problems: {
    spacing: 0,
    acuteAngleWarnings: 0,
    acuteAngleNotes: 0,
    difficultyOutsideRange: 0,
    courseLineCrossings: 0,
    courseLinesThroughControls: 0,
    courseLinesOutsideMap: 0,
    courseLinesOverDescriptions: 0,
    stopsOutsidePrintArea: 0,
    overlappingCircles: 0,
    finalLegTooLong: false,
    winningTimeOutsideRange: false,
    controlsWithoutFeature: 0,
  },
  printArea: null,
  findings: [],
  breakdown: { total: 0, terms: {} } as unknown as Course['breakdown'],
  score: 0,
}

describe('descriptionSheet', () => {
  it('fills the heading, start, controls and finish rows', () => {
    const sheet = descriptionSheet(course, { title: 'Test event', courseName: 'H21' })
    expect(sheet.lengthKilometers).toBe(1.2)
    expect(sheet.climbMeters).toBe(35)
    expect(sheet.start?.feature).toBe('cairn')
    expect(sheet.controls.map(row => [row.number, row.code, row.description?.feature])).toEqual([
      [1, 31, 'boulder'],
      [2, 32, 'pit'],
    ])
    expect(sheet.finish).toEqual({ distanceMeters: 125, route: 'tapedAllTheWay' })
  })
})

describe('allowedControlCodes', () => {
  it('skips codes Lajisäännöt 11.46 leaves out', () => {
    const codes = allowedControlCodes(100)
    expect(codes[0]).toBe(31)
    expect(codes).not.toContain(66)
    expect(codes).not.toContain(98)
  })
})
