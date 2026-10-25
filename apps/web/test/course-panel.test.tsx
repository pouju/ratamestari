import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { CourseRequest } from '@ratamestari/rules'
import type { CourseFileCheck } from '../src/CheckPanel'
import { CoursePanel } from '../src/CoursePanel'
import { deduceClass } from '../src/course-fit'
import type { SearchStatus } from '../src/search-progress'

const REQUEST: CourseRequest = {
  eventLevel: 'finnishChampionship',
  format: 'long',
  sex: 'H',
  ageClass: 21,
  skillLetter: 'A',
}

const ignore = () => {}

const render = (
  hasCentre: boolean,
  check: CourseFileCheck | null = null,
  search: SearchStatus | null = null,
) =>
  renderToStaticMarkup(
    <CoursePanel
      request={REQUEST}
      onRequestChange={ignore}
      isAssistantOn={false}
      hasCentre={hasCentre}
      isPickingCentre={false}
      onMoveCentre={ignore}
      canSetCourse={hasCentre}
      search={search}
      onSetCourse={ignore}
      onSetByHand={ignore}
      onStop={ignore}
      onTryAnother={ignore}
      kept={null}
      onForgetKept={ignore}
      course={null}
      isEditing={false}
      isPreparingPdf={false}
      onDownloadPdf={ignore}
      onDownloadXml={ignore}
      onFixControl={ignore}
      check={check}
      onOpenCourseFile={ignore}
      onSelectCheckedCourse={ignore}
      onCloseCheck={ignore}
      onDeduceClass={ignore}
      suggestion={null}
      onAcceptSuggestion={ignore}
      onDismissSuggestion={ignore}
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
    expect(html).toContain('Set it yourself')
    expect(html).toContain('skill level A')
  })

  it('offers to check a course file while asking for the centre', () => {
    expect(render(false)).toContain('open its IOF XML file')
  })

  it('shows the file, its courses and the sentence it was checked as', () => {
    const html = render(true, {
      fileName: 'Kevätkisa.xml',
      courseNames: ['H21', 'D21'],
      selected: 0,
      classFromName: true,
      deduced: null,
      status: 'checking',
      fileLengthMeters: 11200,
      fileControlCount: 18,
      groundMismatchMetres: null,
    })
    expect(html).toContain('Kevätkisa.xml')
    expect(html).toContain('D21')
    expect(html).not.toContain('Set course')
  })

  it('says which level and distance a checked course fits best, and why', () => {
    const deduced = deduceClass(
      { estimatedSeconds: 32 * 60, controlDifficulties: [3, 4, 5] },
      { sex: 'H', ageClass: 21, skillLetter: 'A' },
      'H',
    )
    const html = render(true, {
      fileName: 'Kevätkisa.xml',
      courseNames: ['H21'],
      selected: 0,
      classFromName: true,
      status: 'checked',
      fileLengthMeters: null,
      fileControlCount: 3,
      groundMismatchMetres: null,
      deduced,
    })
    expect(html).toContain('Fits best')
    expect(html).toContain('middle distance for H21')
    expect(html).toContain('within the 30–35 min of this class')
    expect(html).toContain('Check as another class')
  })

  it('shows that the course is being set, with Stop, while searching', () => {
    const html = render(true, null, { startedAt: Date.now() })
    expect(html).toContain('Setting the course…')
    expect(html).toContain('0:00')
    expect(html).toContain('Stop')
    expect(html).not.toContain('Set course')
  })

  it('names the search phase when one is given', () => {
    const html = render(true, null, { startedAt: 0, phase: 'sections' })
    expect(html).toContain('Setting sections…')
    expect(html).toContain('Stop keeps the best course found so far.')
  })
})
