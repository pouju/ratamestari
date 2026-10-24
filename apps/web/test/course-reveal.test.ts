import { describe, expect, it } from 'vitest'
import { localExtent, localPoint } from '@ratamestari/core'
import { drawnLegsAt, revealedDescriptionExtent, revealPlan } from '../src/course-reveal'

const stopsAlong = (legLengths: readonly number[]) => {
  let x = 0
  return [localPoint(0, 0), ...legLengths.map(length => localPoint((x += length), 0))]
}

describe('revealing a finished course', () => {
  it('takes four to eight seconds for a course of 15 to 25 controls', () => {
    for (const controls of [15, 20, 25]) {
      const plan = revealPlan(stopsAlong(Array.from({ length: controls + 1 }, () => 300)))
      expect(plan.totalMs).toBeGreaterThanOrEqual(4000)
      expect(plan.totalMs).toBeLessThanOrEqual(8000)
    }
  })

  it('gives a long leg more time than a short one', () => {
    const plan = revealPlan(stopsAlong([100, 900]))
    const firstLegMs = plan.legEndsMs[0]! - plan.startPauseMs
    const secondLegMs = plan.legEndsMs[1]! - plan.legEndsMs[0]!
    expect(secondLegMs).toBeGreaterThan(firstLegMs)
    expect(secondLegMs).toBeLessThan(firstLegMs * 3)
  })

  it('shows the start alone, then draws each leg in turn and ends with the whole course', () => {
    const plan = revealPlan(stopsAlong([300, 300, 300]))
    expect(drawnLegsAt(plan, 0)).toBe(0)
    const midSecondLeg = (plan.legEndsMs[0]! + plan.legEndsMs[1]!) / 2
    expect(drawnLegsAt(plan, midSecondLeg)).toBeCloseTo(1.5)
    expect(drawnLegsAt(plan, plan.totalMs)).toBeNull()
  })

  it('never draws backwards', () => {
    const plan = revealPlan(stopsAlong([200, 700, 400, 50]))
    let previous = -1
    for (let ms = 0; ms < plan.totalMs; ms += 16) {
      const drawn = drawnLegsAt(plan, ms)!
      expect(drawn).toBeGreaterThanOrEqual(previous)
      previous = drawn
    }
  })

  it('opens the description box row by row as the controls appear', () => {
    const box = localExtent(0, 0, 80, 70)
    const rowHeight = 10
    expect(revealedDescriptionExtent(box, 3, 0)[1]).toBe(70 - 3 * rowHeight)
    expect(revealedDescriptionExtent(box, 3, 1.5)[1]).toBe(70 - 4 * rowHeight)
    expect(revealedDescriptionExtent(box, 3, 4)[1]).toBe(0)
  })
})
