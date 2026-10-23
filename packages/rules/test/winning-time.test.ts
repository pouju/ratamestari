import { describe, expect, it } from 'vitest'
import { winningTimeFor, winningTimeSchema } from '../src/winning-time'

describe('winningTimeFor', () => {
  it('reads national winning times from Lajisäännöt 11.25', () => {
    const time = winningTimeFor('national', 'long', 21)!
    expect([time.minMinutes, time.maxMinutes]).toEqual([65, 75])
    expect(time.sources[0]).toEqual({ document: 'Lajisäännöt 2026', section: '11.25' })
    expect(() => winningTimeSchema.parse(time)).not.toThrow()
  })

  it('reads SM final winning times from Lajisäännöt 19.41 and 19.44', () => {
    expect(winningTimeFor('finnishChampionship', 'long', 21)).toMatchObject({
      minMinutes: 85,
      maxMinutes: 95,
      sources: [{ document: 'Lajisäännöt 2026', section: '19.41' }, expect.anything()],
    })
    expect(winningTimeFor('finnishChampionship', 'middle', 16)).toMatchObject({
      minMinutes: 20,
      maxMinutes: 25,
      sources: [{ document: 'Lajisäännöt 2026', section: '19.44' }, expect.anything()],
    })
  })

  it('aims for the middle of the interval as IOF 16.9 says', () => {
    expect(winningTimeFor('national', 'middle', 21)!.targetMinutes).toBe(32.5)
  })

  it('returns null for classes without an SM winning time', () => {
    expect(winningTimeFor('finnishChampionship', 'long', 14)).toBeNull()
  })
})
