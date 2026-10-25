import { describe, expect, it } from 'vitest'
import { ENGLISH, FINNISH, formatFor } from '../src/i18n'

describe('English messages', () => {
  const { title } = ENGLISH.messages.leg

  it('names legs from the start, between controls and into the finish', () => {
    expect([title('start', 1), title(5, 6), title(10, 'finish')]).toEqual([
      'Start to 1',
      'Leg 5 to 6',
      'Leg 10 to finish',
    ])
  })
})

describe('formatFor', () => {
  const format = formatFor(ENGLISH)

  it('shows short distances in metres and longer ones in kilometres', () => {
    expect([format.distance(820), format.distance(1050)]).toEqual(['820 m', '1.05 km'])
  })

  it('shows small time differences in seconds and larger ones as minutes', () => {
    expect([format.timeDifference(18.4), format.timeDifference(70)]).toEqual(['18 s', '1:10'])
  })

  it('formats shares as percentages', () => {
    expect(format.share(0.1)).toBe('10%')
  })

  it('writes map scales the ISOM way', () => {
    expect(format.scale(15000)).toBe('1:15\u202f000')
  })

  it('rounds bearings to whole degrees', () => {
    expect(format.bearing(50.6)).toBe('51°')
  })
})

describe('Finnish messages', () => {
  const { leg, findings, courseRoutes } = FINNISH.messages
  const limits = { sharpAngleDegrees: 45, angleNoteDegrees: 60, featureMatchMetres: 15 }

  it('names legs and stops with the Finnish words', () => {
    expect([leg.title('start', 1), leg.title(5, 6), leg.title(10, 'finish')]).toEqual([
      'Lähtö – 1',
      'Rastiväli 5–6',
      'Rastiväli 10–maali',
    ])
    expect(courseRoutes.legName('start', 1)).toBe('L–1')
  })

  it('puts stops into the case each finding needs', () => {
    expect(findings.texts.acuteAngleWarnings([3], 9, limits)).toBe(
      'terävä, alle 45°:n kulma rastilla 3',
    )
    expect(findings.texts.overlappingCircles([0, 8], 8, limits)).toBe(
      'lähdön ja maalin rastiympyrät menevät päällekkäin',
    )
  })
})

describe('formatFor in Finnish', () => {
  const format = formatFor(FINNISH)

  it('uses a decimal comma and a space before the unit', () => {
    const spaced = (text: string) => text.replace(/\s/g, ' ')
    expect(spaced(format.distance(1050))).toBe('1,05 km')
    expect(spaced(format.share(0.1))).toBe('10 %')
  })
})
