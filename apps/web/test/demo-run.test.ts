import { describe, expect, it } from 'vitest'
import { SAMPLE_RUN } from '../src/landing/demo-run'

describe('the recorded hero run', () => {
  const [width, height] = SAMPLE_RUN.page
  const isOnPage = ([x, y]: readonly number[]) =>
    x !== undefined && y !== undefined && x >= 0 && y >= 0 && x <= width && y <= height

  it('has a course whose every point is on the recorded page', () => {
    expect(SAMPLE_RUN.controls.length).toBeGreaterThan(0)
    const points = [
      SAMPLE_RUN.start,
      ...SAMPLE_RUN.controls,
      SAMPLE_RUN.finish,
      ...SAMPLE_RUN.sites,
    ]
    expect(points.every(isOnPage)).toBe(true)
  })

  it('carries the figures and course symbol sizes the player shows', () => {
    expect(SAMPLE_RUN.lengthMeters).toBeGreaterThan(0)
    expect(SAMPLE_RUN.symbols.controlRadius).toBeGreaterThan(0)
  })
})
