import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { setExperimentalFeatures, unlockClickCounter } from '../src/experimental'
import { MapStart } from '../src/WorkspaceStart'

const ignore = () => {}

describe('experimental features', () => {
  it('switch after seven quick clicks, not after slow ones', () => {
    setExperimentalFeatures(false)
    let time = 0
    const click = unlockClickCounter(() => time)

    for (let i = 0; i < 6; i++) {
      expect(click()).toBeNull()
      time += 2000
    }
    expect(click()).toBeNull()

    time += 5000
    for (let i = 0; i < 6; i++) {
      expect(click()).toBeNull()
      time += 100
    }
    expect(click()).toBe(true)
  })

  it('offer PDF maps on the start screen only when on', () => {
    const startScreen = () =>
      renderToStaticMarkup(
        <MapStart opening={{ status: 'empty' }} isDraggingOver={false} onChooseFile={ignore} />,
      )

    setExperimentalFeatures(false)
    expect(startScreen()).not.toContain('PDF')
    setExperimentalFeatures(true)
    expect(startScreen()).toContain('PDF')
  })
})
