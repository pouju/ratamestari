import { describe, expect, it } from 'vitest'
import { localPoint } from '@ratamestari/core'
import type { Course, LegEvaluation, Route } from '@ratamestari/engine'
import { legCount, legEnds, pointAlong, rankedRoutes, stopName } from '../src/leg-routes'

const route = (timeSeconds: number): Route => ({
  points: [localPoint(0, 0), localPoint(100, 0)],
  lengthMeters: 100,
  timeSeconds,
})

const legWith = (fastest: Route, alternatives: Route[]) =>
  ({ fastest, alternatives }) as unknown as LegEvaluation

const courseThrough = (...xs: number[]) => {
  const [start = 0, ...rest] = xs
  const finish = rest.pop() ?? 0
  return {
    start: { position: localPoint(start, 0) },
    controls: rest.map(x => ({ position: localPoint(x, 0) })),
    finish: localPoint(finish, 0),
  } as unknown as Course
}

describe('rankedRoutes', () => {
  it('orders the alternatives by time and colours them fastest to slowest', () => {
    const ranked = rankedRoutes(legWith(route(300), [route(340), route(318)]))
    expect(ranked.map(r => [r.rank, r.secondsSlower])).toEqual([
      ['fastest', 0],
      ['middle', 18],
      ['slowest', 40],
    ])
  })

  it('marks a single alternative as the slowest', () => {
    expect(rankedRoutes(legWith(route(300), [route(320)])).map(r => r.rank)).toEqual([
      'fastest',
      'slowest',
    ])
  })

  it('keeps a leg without alternatives as one fastest route', () => {
    expect(rankedRoutes(legWith(route(300), [])).map(r => r.rank)).toEqual(['fastest'])
  })
})

describe('legs of a course', () => {
  const course = courseThrough(0, 100, 200, 300)

  it('counts a leg into the finish', () => {
    expect(legCount(course)).toBe(3)
  })

  it('names the start, controls and finish', () => {
    expect([0, 1, 2, 3].map(stop => stopName(course, stop))).toEqual(['start', 1, 2, 'finish'])
  })

  it('finds the ends of a leg and nothing past the finish', () => {
    expect(legEnds(course, 2)).toEqual([localPoint(200, 0), localPoint(300, 0)])
    expect(legEnds(course, 3)).toBeNull()
  })
})

describe('pointAlong', () => {
  it('measures the share along the whole polyline', () => {
    const points = [localPoint(0, 0), localPoint(100, 0), localPoint(100, 100)]
    expect(pointAlong(points, 0.75)).toEqual(localPoint(100, 50))
  })
})
