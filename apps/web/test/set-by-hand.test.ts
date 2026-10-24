import { describe, expect, it } from 'vitest'
import { localPoint } from '@ratamestari/core'
import type { Course } from '@ratamestari/engine'
import { handEditFor, isControlStop, neighboursOf, withUndoStep } from '../src/set-by-hand'

const course = {
  start: { position: localPoint(0, 0) },
  controls: [{ position: localPoint(1000, 0) }, { position: localPoint(1000, 500) }],
  finish: localPoint(0, 500),
} as unknown as Course

const at = localPoint(300, 300)

describe('a tap while setting a course by hand', () => {
  it('places the start first', () => {
    expect(handEditFor(null, null, null, at)).toEqual({ kind: 'start', at })
  })

  it('adds a control on open map, or puts one into a tapped leg', () => {
    expect(handEditFor(course, null, null, at)).toEqual({ kind: 'add', at })
    expect(handEditFor(course, null, { kind: 'leg', leg: 1 }, at)).toEqual({
      kind: 'insert',
      afterStop: 1,
      at,
    })
  })

  it('selects a tapped stop, and a second tap deselects it', () => {
    expect(handEditFor(course, null, { kind: 'stop', stop: 2 }, at)).toEqual({
      kind: 'select',
      stop: 2,
    })
    expect(handEditFor(course, 2, { kind: 'stop', stop: 2 }, at)).toEqual({
      kind: 'select',
      stop: null,
    })
  })

  it('only clears the selection when a stop is selected', () => {
    expect(handEditFor(course, 1, null, at)).toEqual({ kind: 'select', stop: null })
    expect(handEditFor(course, 1, { kind: 'leg', leg: 0 }, at)).toEqual({
      kind: 'select',
      stop: null,
    })
  })
})

describe('isControlStop', () => {
  it('is true for controls only, not the start or the finish', () => {
    expect([0, 1, 2, 3].map(stop => isControlStop(course, stop))).toEqual([
      false,
      true,
      true,
      false,
    ])
    expect(isControlStop(course, null)).toBe(false)
  })
})

describe('withUndoStep', () => {
  it('keeps a bounded history of earlier courses', () => {
    let history: readonly (Course | null)[] = []
    for (let i = 0; i < 60; i++) history = withUndoStep(history, i === 0 ? null : course)
    expect(history).toHaveLength(50)
    expect(withUndoStep([], null)).toEqual([null])
  })
})

describe('the stops a new control would join', () => {
  it('joins the last control and the finish when added at the end', () => {
    expect(neighboursOf(course, { kind: 'add', at })).toEqual([localPoint(1000, 500)])
  })

  it('joins both ends of the leg it goes into', () => {
    expect(neighboursOf(course, { kind: 'insert', afterStop: 0, at })).toEqual([
      localPoint(0, 0),
      localPoint(1000, 0),
    ])
  })

  it('joins nothing before the start is placed or when a tap selects', () => {
    expect(neighboursOf(null, { kind: 'start', at })).toBeNull()
    expect(neighboursOf(course, { kind: 'select', stop: 1 })).toBeNull()
  })
})
