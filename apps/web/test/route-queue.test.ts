import { describe, expect, it } from 'vitest'
import { createRouteQueue, SUPERSEDED } from '../src/route-queue'

const controlled = <T>(value: T) => {
  let finish = () => {}
  const started: string[] = []
  const job = (name: string) => () => {
    started.push(name)
    return new Promise<T>(resolve => (finish = () => resolve(value)))
  }
  return { job, started, finish: () => finish() }
}

describe('route queue', () => {
  it('runs one request at a time', async () => {
    const queue = createRouteQueue()
    const { job, started, finish } = controlled(1)
    const first = queue.request('a', 'course', job('a'))
    void queue.request('b', 'course', job('b'))
    expect(started).toEqual(['a'])
    finish()
    await first
    await Promise.resolve()
    expect(started).toEqual(['a', 'b'])
  })

  it('replaces a waiting request for the same slot', async () => {
    const queue = createRouteQueue()
    const { job, started, finish } = controlled(1)
    const running = queue.request('busy', 'course', job('busy'))
    const replaced = queue.request('preview', 'preview', job('old'))
    void queue.request('preview', 'preview', job('new'))
    expect(await replaced).toBe(SUPERSEDED)
    finish()
    await running
    await Promise.resolve()
    expect(started).toEqual(['busy', 'new'])
  })

  it('serves the most urgent request first', async () => {
    const queue = createRouteQueue()
    const { job, started, finish } = controlled(1)
    const running = queue.request('busy', 'course', job('busy'))
    void queue.request('leg 2', 'course', job('leg 2'))
    void queue.request('preview', 'preview', job('preview'))
    finish()
    await running
    await Promise.resolve()
    expect(started).toEqual(['busy', 'preview'])
  })

  it('drops waiting requests of a kind when cancelled', async () => {
    const queue = createRouteQueue()
    const { job, finish } = controlled(1)
    const running = queue.request('busy', 'course', job('busy'))
    const waiting = queue.request('leg 2', 'course', job('leg 2'))
    queue.cancel('course')
    expect(await waiting).toBe(SUPERSEDED)
    finish()
    expect(await running).toBe(1)
  })
})
