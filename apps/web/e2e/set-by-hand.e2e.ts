import { expect, test } from './fixtures'

test('a course is set by hand, control by control', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Placing by tap is the same flow; the sheet covers much of the map')
  await page.goto('./app/?sample')
  await expect(page.getByRole('button', { name: 'Try another course' })).toBeEnabled({
    timeout: 60_000,
  })
  await page.getByRole('button', { name: 'Add course' }).click()
  await page.getByRole('button', { name: 'Set it yourself' }).click()
  await expect(page.getByText(/^Click the map where the start is/)).toBeVisible()

  const map = (await page.locator('.map canvas').first().boundingBox())!
  const at = (x: number, y: number) =>
    page.mouse.click(map.x + map.width * x, map.y + map.height * y)
  await at(0.2, 0.3)
  await expect(page.getByText(/^Click the map to add control 1\./)).toBeVisible()
  await at(0.3, 0.45)
  await expect(page.getByText(/^Click the map to add control 2\./)).toBeVisible()

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByText(/^Click the map to add control 1\./)).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText(/^Click the map to add control/)).toBeHidden()
})
