import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { CourseRequest } from '@ratamestari/rules'
import { CoursePanel } from '../src/CoursePanel'

const REQUEST: CourseRequest = {
  eventLevel: 'finnishChampionship',
  format: 'long',
  sex: 'H',
  ageClass: 21,
  skillLetter: 'A',
}

const ignore = () => {}

const render = (hasCentre: boolean) =>
  renderToStaticMarkup(
    <CoursePanel
      request={REQUEST}
      onRequestChange={ignore}
      hasCentre={hasCentre}
      isPickingCentre={false}
      onMoveCentre={ignore}
      canSetCourse={hasCentre}
      isGenerating={false}
      onSetCourse={ignore}
      onTryAnother={ignore}
      course={null}
      isEditing={false}
      isPreparingPdf={false}
      onDownloadPdf={ignore}
      onDownloadXml={ignore}
      onFixControl={ignore}
    />,
  )

describe('CoursePanel', () => {
  it('asks for the competition centre before anything else', () => {
    const html = render(false)
    expect(html).toContain('Where is the competition centre?')
    expect(html).not.toContain('Set course')
  })

  it('offers the request sentence and Set course once the centre is chosen', () => {
    const html = render(true)
    expect(html).toContain('SM level')
    expect(html).toContain('Set course')
  })
})
