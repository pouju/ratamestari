import { afterEach, describe, expect, it } from 'vitest'
import { track } from '../src/analytics'

const global = globalThis as { window?: unknown }

describe('track', () => {
  afterEach(() => {
    delete global.window
  })

  it('hands the event to Umami when its script is loaded', () => {
    const sent: unknown[] = []
    global.window = { umami: { track: (...event: unknown[]) => sent.push(event) } }
    track('map-opened', { map: 'sample' })
    track('pdf-downloaded')
    expect(sent).toEqual([
      ['map-opened', { map: 'sample' }],
      ['pdf-downloaded', undefined],
    ])
  })

  it('does nothing without Umami, as in development', () => {
    expect(() => track('pdf-downloaded')).not.toThrow()
    global.window = {}
    expect(() => track('pdf-downloaded')).not.toThrow()
  })
})
