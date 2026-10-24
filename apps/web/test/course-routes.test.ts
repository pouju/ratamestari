import { describe, expect, it } from 'vitest'
import { localPoint } from '@ratamestari/core'
import type { LegEvaluation } from '@ratamestari/engine'
import { legKey, routeSummary } from '../src/course-routes'

const evaluated = (hasRouteChoice: boolean) =>
  ({ status: 'evaluated', leg: { hasRouteChoice } as LegEvaluation }) as const

describe('course routes', () => {
  it('keys a leg by its ends and the pace', () => {
    const a = localPoint(10, 20)
    const b = localPoint(300.04, 400)
    expect(legKey(a, b, 300)).toBe(legKey(a, localPoint(300.01, 400), 300))
    expect(legKey(a, b, 300)).not.toBe(legKey(b, a, 300))
    expect(legKey(a, b, 300)).not.toBe(legKey(a, b, 330))
  })

  it('counts the legs found so far and those with a route choice', () => {
    expect(
      routeSummary([
        evaluated(true),
        evaluated(false),
        { status: 'unreachable' },
        { status: 'finding' },
      ]),
    ).toEqual({ legs: 4, evaluated: 3, withRouteChoice: 1 })
  })
})
