import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Course } from '@ratamestari/engine'
import { LegRoutesPanel } from '../src/LegRoutesPanel'

const ignore = () => {}
const COURSE = { controls: [{}, {}] } as unknown as Course

const render = (leg: number) =>
  renderToStaticMarkup(
    <LegRoutesPanel
      course={COURSE}
      leg={leg}
      routes={{ status: 'finding' }}
      onSelectLeg={ignore}
      keeping={{ leg: true, from: true, to: false }}
      onToggleLegKept={ignore}
      onToggleStopKept={ignore}
    />,
  )

describe('the leg view', () => {
  it('offers to keep the leg and both its controls', () => {
    const html = render(1)
    expect(html).toContain('Keep this leg')
    expect(html).toContain('Keep control 1')
    expect(html).toContain('Keep control 2')
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(2)
  })

  it('offers the start on the first leg and never the finish', () => {
    expect(render(0)).toContain('Keep the start')
    const last = render(2)
    expect(last).toContain('Keep control 2')
    expect(last).not.toContain('Keep control 3')
  })
})
