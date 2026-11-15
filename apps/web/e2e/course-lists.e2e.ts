import { expect, test } from './fixtures'

test('a weekly event starts from the A–D list and is kept as my list', async ({ page }) => {
  await page.goto('./app/?sample')
  await expect(page.getByRole('button', { name: 'Try another course' })).toBeEnabled({
    timeout: 60_000,
  })
  const showMore = page.getByRole('button', { name: 'Show more of the panel' })
  while (await showMore.isVisible()) await showMore.click()
  const courses = page.getByRole('navigation', { name: 'Courses of the event' })

  await page.getByRole('combobox', { name: 'Start from' }).selectOption('weekly')
  // A is already set on the sample map, so the list leaves it as it is.
  await expect(courses.getByRole('button', { name: 'A, D10' })).toBeVisible()
  await expect(courses.getByRole('button', { name: 'B, orange' })).toBeVisible()
  await expect(courses.getByRole('button', { name: 'C, yellow' })).toBeVisible()
  await expect(courses.getByRole('button', { name: 'D, white' })).toBeVisible()

  await courses.getByRole('button', { name: 'B, orange' }).click()
  await expect(page.getByRole('spinbutton', { name: 'Shortest length in kilometres' })).toHaveValue(
    '4',
  )
  await expect(page.getByRole('spinbutton', { name: 'Longest length in kilometres' })).toHaveValue(
    '5',
  )

  await page.getByRole('button', { name: 'Save these courses as my list' }).click()
  await expect(page.getByText(/^Saved in this browser/)).toBeVisible()
  await page.reload()
  while (await showMore.isVisible()) await showMore.click()
  await expect(
    page.getByRole('combobox', { name: 'Start from' }).getByRole('option', { name: 'My list' }),
  ).toHaveCount(1)
})
