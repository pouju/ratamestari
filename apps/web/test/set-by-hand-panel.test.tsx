import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { localPoint } from '@ratamestari/core'
import type { Course } from '@ratamestari/engine'
import { SetByHandPanel } from '../src/SetByHandPanel'

const course = {
  start: { position: localPoint(0, 0) },
  controls: [{ position: localPoint(1000, 0) }, { position: localPoint(1000, 500) }],
  finish: localPoint(0, 500),
} as unknown as Course

const ignore = () => {}

const render = (current: Course | null, selectedStop: number | null) =>
  renderToStaticMarkup(
    <SetByHandPanel
      course={current}
      selectedStop={selectedStop}
      preview={null}
      canUndo={false}
      isEditing={false}
      onDelete={ignore}
      onUndo={ignore}
      onDone={ignore}
    />,
  )

describe('SetByHandPanel', () => {
  it('asks for the start before any control', () => {
    expect(render(null, null)).toContain('where the start is')
  })

  it('names the next control to add', () => {
    expect(render(course, null)).toContain('add control 3')
  })

  it('offers to delete a selected control but not the start or the finish', () => {
    expect(render(course, 2)).toContain('Delete control 2')
    expect(render(course, 0)).toContain('The start is selected')
    expect(render(course, 0)).not.toContain('Delete control')
    expect(render(course, 3)).toContain('The finish is selected')
  })
})
