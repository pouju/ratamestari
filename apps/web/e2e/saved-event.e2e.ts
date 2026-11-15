import { expect, test } from './fixtures'

test('the event is still there after a reload, with its course names', async ({ page }) => {
  await page.goto('./app/?sample')
  const tryAnother = page.getByRole('button', { name: 'Try another course' })
  await expect(tryAnother).toBeEnabled({ timeout: 60_000 })
  const showMore = page.getByRole('button', { name: 'Show more of the panel' })
  while (await showMore.isVisible()) await showMore.click()
  const courses = page.getByRole('navigation', { name: 'Courses of the event' })
  const length = await page
    .getByText(/^\d+(\.\d+)? km$/)
    .first()
    .textContent()

  await courses.getByRole('button', { name: 'Add course' }).click()
  await courses.getByRole('button', { name: /^B,/ }).click()
  const name = page.getByRole('textbox', { name: 'Course name' })
  await name.fill('Easy')
  await name.press('Enter')
  await expect(courses.getByRole('button', { name: /^Easy,/ })).toBeVisible()
  await courses.getByRole('button', { name: /^A,/ }).click()
  // Saving waits for edits to pause.
  await page.waitForTimeout(1500)

  await page.reload()
  while (await showMore.isVisible()) await showMore.click()
  await expect(courses.getByRole('button', { name: /^A,/ })).toHaveAttribute('aria-current', 'page')
  await expect(courses.getByRole('button', { name: /^Easy,/ })).toBeVisible()
  await expect(page.getByText(/^\d+(\.\d+)? km$/).first()).toHaveText(length!)
  await expect(tryAnother).toBeEnabled()

  // Edits need the course's setting in the engine, which comes back with the event.
  await page.getByRole('button', { name: 'Fix' }).first().click()
  await expect(tryAnother).toBeEnabled()
  await expect(page.getByText(/Set a course before/)).toHaveCount(0)
})
