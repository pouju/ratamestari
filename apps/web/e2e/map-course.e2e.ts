import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

// Screen points where the course overprint is drawn (its purple, rgb(190, 30, 180)).
async function overprintPoints(page: Page) {
  const canvas = page.locator('.map canvas').first()
  const box = (await canvas.boundingBox())!
  const pixels = await canvas.evaluate((element: HTMLCanvasElement) => {
    const context = element.getContext('2d')!
    const { width, height } = element
    const data = context.getImageData(0, 0, width, height).data
    const found: [number, number][] = []
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const i = (y * width + x) * 4
        if (data[i]! > 150 && data[i + 1]! < 80 && data[i + 2]! > 120) found.push([x, y])
      }
    }
    return { found, scale: width / element.clientWidth }
  })
  return pixels.found.map(([x, y]) => ({
    x: box.x + x / pixels.scale,
    y: box.y + y / pixels.scale,
  }))
}

test.describe('the course on the map', () => {
  test.skip(({ isMobile }) => isMobile, 'Pointer drags; touch needs a selected leg first')

  test.beforeEach(async ({ page }) => {
    await page.goto('./app/?sample')
    await expect(page.getByRole('button', { name: 'Try another course' })).toBeEnabled({
      timeout: 60_000,
    })
  })

  test('a leg is selected by tapping its line', async ({ page }) => {
    const points = await overprintPoints(page)
    const middle = points[Math.floor(points.length / 2)]!
    await page.mouse.click(middle.x, middle.y)
    await expect(page.getByText(/^Leg /).first()).toBeVisible()
  })

  test('a control dragged on the map changes the course', async ({ page }) => {
    const length = page.getByText(/^\d+(\.\d+)? km$/).first()
    const before = await length.textContent()
    const points = await overprintPoints(page)
    for (const point of points.filter((_, i) => i % 40 === 0)) {
      await page.mouse.move(point.x, point.y)
      await page.mouse.down()
      await page.mouse.move(point.x + 25, point.y + 25, { steps: 6 })
      await page.mouse.up()
      if ((await length.textContent()) !== before) break
      await page.waitForTimeout(500)
      if ((await length.textContent()) !== before) break
    }
    await expect(length).not.toHaveText(before!)
  })
})
