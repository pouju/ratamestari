import { expect, test } from './fixtures'

test('the panel sheet follows a drag and settles at the nearest size', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'The panel is a sheet only on narrow screens')
  await page.goto('./app/?sample')
  const handle = page.getByRole('button', { name: 'Show more of the panel' })
  await expect(handle).toBeVisible()
  const sheet = page.locator('aside')
  const peekHeight = (await sheet.boundingBox())!.height

  const box = (await handle.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y - 150, { steps: 5 })
  expect((await sheet.boundingBox())!.height).toBeGreaterThan(peekHeight + 100)
  await page.mouse.move(x, 30, { steps: 5 })
  await page.mouse.up()

  await expect(page.getByRole('button', { name: 'Show less of the panel' })).toBeVisible()
})
