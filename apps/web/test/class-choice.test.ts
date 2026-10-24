import { describe, expect, it } from 'vitest'
import type { CourseRequest } from '@ratamestari/rules'
import { offeredAgeClasses, withOfferedClass } from '../src/class-choice'

const request = (fields: Partial<CourseRequest>): CourseRequest => ({
  eventLevel: 'finnishChampionship',
  format: 'long',
  sex: 'H',
  ageClass: 21,
  skillLetter: 'A',
  ...fields,
})

describe('offeredAgeClasses', () => {
  it('leaves out the classes the SM rules have no winning time for', () => {
    const offered = offeredAgeClasses(request({}))
    expect(offered).not.toContain(14)
    expect(offered[0]).toBe(15)
  })

  it('offers the youngest classes at national events', () => {
    expect(offeredAgeClasses(request({ eventLevel: 'national' }))).toContain(10)
  })
})

describe('withOfferedClass', () => {
  it('keeps a class the rules cover', () => {
    expect(withOfferedClass(request({ ageClass: 35 }))).toEqual({
      request: request({ ageClass: 35 }),
      replacedAgeClass: null,
    })
  })

  it('moves a class the rules do not cover to the nearest one and says which it was', () => {
    const choice = withOfferedClass(request({ ageClass: 12 }))
    expect(choice.request.ageClass).toBe(15)
    expect(choice.replacedAgeClass).toBe(12)
  })
})
