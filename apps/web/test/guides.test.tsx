import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ENGLISH, formatFor } from '../src/i18n'
import { en } from '../src/i18n/en'
import { GUIDE_RUN } from '../src/guides/guide-run'
import { Guides } from '../src/guides/Guides'
import { focusBox } from '../src/guides/scene'
import { scenes } from '../src/guides/scenes'
import { SAMPLE_RUN } from '../src/landing/demo-run'

const [width, height] = SAMPLE_RUN.page
const isOnPage = ([x, y]: readonly number[]) =>
  x !== undefined && y !== undefined && x >= 0 && y >= 0 && x <= width && y <= height

describe('the recorded guides run', () => {
  it('has every demo the guides play, on the recorded page', () => {
    const { drag, assistant, plannedLeg } = GUIDE_RUN
    expect(drag && assistant && plannedLeg).toBeTruthy()
    expect([drag!.to, assistant!.to, plannedLeg!.from, plannedLeg!.to].every(isOnPage)).toBe(true)
  })

  it('shows a real route choice on the leg and the planned leg', () => {
    expect(GUIDE_RUN.leg.routes.length).toBeGreaterThan(1)
    expect(GUIDE_RUN.plannedLeg!.routes.length).toBeGreaterThan(1)
    expect(GUIDE_RUN.courseRoutes).toHaveLength(SAMPLE_RUN.controls.length + 1)
  })
})

describe('guides', () => {
  const all = scenes(en, formatFor(ENGLISH))

  it('give every step text a step in its animation', () => {
    for (const [name, scene] of Object.entries(all)) {
      expect(scene, name).not.toBeNull()
      expect(scene!.stepStarts, name).toHaveLength(en.guides[name as keyof typeof all].steps.length)
    }
  })

  it('render the page with every guide', () => {
    const page = renderToStaticMarkup(<Guides />)
    for (const name of Object.keys(all)) {
      expect(page).toContain(en.guides[name as keyof typeof all].title)
    }
  })
})

describe('focusBox', () => {
  it('keeps the page aspect ratio and stays on the page', () => {
    const [x, y, boxWidth, boxHeight] = focusBox(
      [
        [5, 5],
        [40, 10],
      ],
      20,
      [300, 200],
    )
    expect(boxWidth / boxHeight).toBeCloseTo(1.5)
    expect(x).toBeGreaterThanOrEqual(0)
    expect(y).toBeGreaterThanOrEqual(0)
    expect(x + boxWidth).toBeLessThanOrEqual(300)
    expect(y + boxHeight).toBeLessThanOrEqual(200)
  })
})
