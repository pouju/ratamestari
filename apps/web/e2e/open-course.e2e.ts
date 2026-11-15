import { expect, test } from './fixtures'

test('an open course is set by length and skill colour', async ({ page }) => {
  await page.goto('./app/?sample')
  await expect(page.getByRole('button', { name: 'Try another course' })).toBeEnabled({
    timeout: 60_000,
  })
  const showMore = page.getByRole('button', { name: 'Show more of the panel' })
  while (await showMore.isVisible()) await showMore.click()

  await page.getByRole('button', { name: 'Add course' }).click()
  await page.getByRole('combobox', { name: 'Course for' }).selectOption('open')
  await page.getByRole('combobox', { name: 'Skill colour' }).selectOption('yellow')
  await page.getByRole('spinbutton', { name: 'Shortest length in kilometres' }).fill('1.5')
  await page.getByRole('spinbutton', { name: 'Longest length in kilometres' }).fill('2.5')
  const courses = page.getByRole('navigation', { name: 'Courses of the event' })
  await expect(courses.getByRole('button', { name: 'B, yellow' })).toBeVisible()

  await page.getByRole('button', { name: 'Set course', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Try another course' })).toBeEnabled({
    timeout: 60_000,
  })
  await expect(page.getByText('Time at the event pace', { exact: true })).toBeVisible()
  await expect(page.getByText(/^target 1\.50 km–2\.50 km$/)).toBeVisible()
})
