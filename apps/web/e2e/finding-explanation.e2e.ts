import { expect, test } from './fixtures'

test('a finding explains why it matters and how to fix it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Placing by tap is the same flow; the sheet covers much of the map')
  await page.goto('./app/?sample')
  await expect(page.getByRole('button', { name: 'Try another course' })).toBeEnabled({
    timeout: 60_000,
  })
  await page.getByRole('button', { name: 'Add course' }).click()
  await page.getByRole('button', { name: 'Set it yourself' }).click()

  const map = (await page.locator('.map canvas').first().boundingBox())!
  const at = (x: number, y: number) =>
    page.mouse.click(map.x + map.width * x, map.y + map.height * y)
  await at(0.2, 0.3)
  await expect(page.getByText(/^Click the map to add control 1\./)).toBeVisible()
  await at(0.3, 0.45)
  await expect(page.getByText(/^Click the map to add control 2\./)).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()

  const findings = page.getByRole('region', { name: /^\d+ things? to check$/ })
  const finding = findings.getByRole('listitem').first()
  await expect(finding).toBeVisible()
  await expect(finding.getByText('Why it matters', { exact: true })).toBeHidden()
  await finding.getByText('Why, and how to fix').click()
  await expect(finding.getByText('Why it matters', { exact: true })).toBeVisible()
  await expect(finding.getByText('How to fix', { exact: true })).toBeVisible()
})
