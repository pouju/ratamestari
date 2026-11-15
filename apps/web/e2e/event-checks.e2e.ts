import { expect, test } from './fixtures'

test('checks across the courses appear once two courses are set', async ({ page }) => {
  await page.goto('./app/?sample')
  const tryAnother = page.getByRole('button', { name: 'Try another course' })
  await expect(tryAnother).toBeEnabled({ timeout: 60_000 })
  const showMore = page.getByRole('button', { name: 'Show more of the panel' })
  while (await showMore.isVisible()) await showMore.click()
  const checks = page.getByRole('region', { name: /across the courses/ })
  await expect(checks).toHaveCount(0)

  await page.getByRole('button', { name: 'Add course' }).click()
  await page.getByRole('button', { name: 'Set course', exact: true }).click()
  await expect(tryAnother).toBeEnabled({ timeout: 60_000 })

  await expect(checks).toBeVisible()
  // On a small map two courses always share something; each finding names its courses.
  await expect(checks.getByText(/^Courses A, B ·|^Courses B, A ·/).first()).toBeVisible()
})
