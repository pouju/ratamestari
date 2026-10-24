import { describe, expect, it } from 'vitest'
import { ENGLISH, formatFor } from '../src/i18n'

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
