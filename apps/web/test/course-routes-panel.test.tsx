import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Course } from '@ratamestari/engine'
import { CourseRoutesPanel } from '../src/CourseRoutesPanel'

const ignore = () => {}
const COURSE = { controls: [{}, {}] } as unknown as Course

describe('the routes list', () => {
  it('marks the open leg, so it stays beside the leg details', () => {
    const html = renderToStaticMarkup(
      <CourseRoutesPanel
        course={COURSE}
        legs={[{ status: 'finding' }, { status: 'finding' }, { status: 'finding' }]}
        selectedLeg={1}
        onFindAll={ignore}
        onSelectLeg={ignore}
      />,
    )
    expect(html.match(/aria-current="true"/g)).toHaveLength(1)
    expect(html).toContain('class="is-selected"')
  })
})
