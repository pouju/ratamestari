import { ANALYTICS_SCRIPT, expect, test } from './fixtures'

test('a second course is set beside the first and each keeps its own', async ({
  page,
  externalRequests,
}) => {
  await page.goto('./app/?sample')
  const tryAnother = page.getByRole('button', { name: 'Try another course' })
  await expect(tryAnother).toBeEnabled({ timeout: 60_000 })
  // On a phone the panel is a sheet; open it fully, as a user would, to reach the course tabs.
  const showMore = page.getByRole('button', { name: 'Show more of the panel' })
  while (await showMore.isVisible()) await showMore.click()
  const courses = page.getByRole('navigation', { name: 'Courses of the event' })
  const firstLength = await page
    .getByText(/^\d+(\.\d+)? km$/)
    .first()
    .textContent()

  await courses.getByRole('button', { name: 'Add course' }).click()
  await expect(courses.getByRole('button', { name: /^B,/ })).toHaveAttribute('aria-current', 'page')
  await expect(tryAnother).toBeHidden()

  await page.getByRole('button', { name: 'Set course', exact: true }).click()
  await expect(tryAnother).toBeEnabled({ timeout: 60_000 })

  await courses.getByRole('button', { name: /^A,/ }).click()
  await expect(courses.getByRole('button', { name: /^A,/ })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByText(/^\d+(\.\d+)? km$/).first()).toHaveText(firstLength!)
  expect(externalRequests.filter(url => url !== ANALYTICS_SCRIPT)).toEqual([])
})
