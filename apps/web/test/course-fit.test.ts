import { describe, expect, it } from 'vitest'
import type { TechnicalDifficulty } from '@ratamestari/engine'
import { deduceClass, fitOf } from '../src/course-fit'

const measured = (minutes: number, difficulties: TechnicalDifficulty[]) => ({
  estimatedSeconds: minutes * 60,
  controlDifficulties: difficulties,
})

describe('fitOf', () => {
  it('finds no fault in a course inside the winning time and difficulty range', () => {
    const fit = fitOf(measured(32, [3, 4, 5]), {
      eventLevel: 'national',
      format: 'middle',
      sex: 'H',
      ageClass: 21,
      skillLetter: 'A',
    })
    expect(fit?.minutesOutsideRange).toBe(0)
    expect(fit?.controlsOutsideDifficulty).toBe(0)
  })

  it('counts minutes past the range and controls that are too easy', () => {
    const fit = fitOf(measured(40, [1, 3, 4]), {
      eventLevel: 'national',
      format: 'middle',
      sex: 'H',
      ageClass: 21,
      skillLetter: 'A',
    })
    expect(fit?.minutesOutsideRange).toBe(5)
    expect(fit?.controlsOutsideDifficulty).toBe(1)
  })
})

describe('deduceClass', () => {
  it('keeps the class from the course name and deduces the level and distance', () => {
    const deduced = deduceClass(
      measured(90, [3, 4, 5, 4]),
      { sex: 'D', ageClass: 21, skillLetter: 'A' },
      'H',
    )
    expect(deduced?.best.request).toMatchObject({
      eventLevel: 'finnishChampionship',
      format: 'long',
      sex: 'D',
      ageClass: 21,
    })
  })

  it('deduces a young class from a short, easy course', () => {
    const deduced = deduceClass(measured(15, [1, 1, 1]), null, 'D')
    expect(deduced?.best.request).toMatchObject({ format: 'middle', ageClass: 10, sex: 'D' })
    expect(deduced?.best.minutesOutsideRange).toBe(0)
  })
})
