import { describe, expect, it } from 'vitest'
import { localPoint } from '@ratamestari/core'
import type { ControlSiteCandidate, Course } from '@ratamestari/engine'
import {
  isLegKept,
  isStopKept,
  keptCount,
  locksFor,
  NOTHING_KEPT,
  toggleLeg,
  toggleStop,
  withMovedStop,
} from '../src/kept'

const site = (id: number, x = id * 100) =>
  ({ id, position: localPoint(x, 0) }) as unknown as ControlSiteCandidate
const courseOf = (start: ControlSiteCandidate, controls: readonly ControlSiteCandidate[]) =>
  ({ start, controls, finish: localPoint(0, 0) }) as unknown as Course

const COURSE = courseOf(site(0), [site(1), site(2), site(3)])

describe('kept controls', () => {
  it('keeps a stop, but never the finish', () => {
    const kept = toggleStop(NOTHING_KEPT, COURSE, 2)
    expect(isStopKept(kept, COURSE, 2)).toBe(true)
    expect(isStopKept(kept, COURSE, 1)).toBe(false)
    expect(toggleStop(kept, COURSE, 4)).toBe(kept)
  })

  it('keeps both ends of a kept leg, and lets the leg go with either end', () => {
    const kept = toggleLeg(NOTHING_KEPT, COURSE, 1)
    expect([1, 2].map(stop => isStopKept(kept, COURSE, stop))).toEqual([true, true])
    expect(isLegKept(kept, COURSE, 1)).toBe(true)
    const withoutEnd = toggleStop(kept, COURSE, 2)
    expect(isLegKept(withoutEnd, COURSE, 1)).toBe(false)
    expect(isStopKept(withoutEnd, COURSE, 1)).toBe(true)
  })

  it('follows the kept sites into a renumbered course', () => {
    const kept = toggleStop(NOTHING_KEPT, COURSE, 2)
    const renumbered = courseOf(site(0), [site(7), site(8), site(2)])
    expect(isStopKept(kept, renumbered, 3)).toBe(true)
    expect(keptCount(kept, renumbered)).toEqual({ controls: 1, legs: 0 })
  })

  it('tells hand-placed sites without a feature apart by position', () => {
    const handPlaced = courseOf(site(0), [site(-1, 50), site(-1, 90)])
    const kept = toggleStop(NOTHING_KEPT, handPlaced, 1)
    expect(isStopKept(kept, handPlaced, 2)).toBe(false)
  })

  it('gives the engine the kept controls in order with their kept legs', () => {
    const kept = toggleLeg(toggleStop(NOTHING_KEPT, COURSE, 1), COURSE, 3)
    expect(locksFor(kept, COURSE)).toEqual({
      start: null,
      controls: [site(1), site(3)],
      keptLegs: [false, false, true],
    })
    expect(locksFor(NOTHING_KEPT, COURSE)).toBeNull()
  })

  it('keeps a moved control kept, with its legs', () => {
    const kept = toggleLeg(NOTHING_KEPT, COURSE, 1)
    const moved = courseOf(site(0), [site(1), site(9), site(3)])
    const after = withMovedStop(kept, COURSE, moved, 2)
    expect(isStopKept(after, moved, 2)).toBe(true)
    expect(isLegKept(after, moved, 1)).toBe(true)
  })
})
