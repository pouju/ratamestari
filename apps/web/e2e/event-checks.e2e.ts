import { expect, test } from './fixtures'

test('a second course keeps clear of the first, and the checks across courses say so', async ({
  page,
}) => {
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
  // B is set clear of A's controls (D27), so no two controls of the courses are too close.
  await expect(checks.getByText(/closer than/)).toHaveCount(0)
})
