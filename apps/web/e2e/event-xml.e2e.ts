import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures'

test('the IOF XML of all courses holds each course, sharing controls', async ({ page }) => {
  await page.goto('./app/?sample')
  const tryAnother = page.getByRole('button', { name: 'Try another course' })
  await expect(tryAnother).toBeEnabled({ timeout: 60_000 })
  const showMore = page.getByRole('button', { name: 'Show more of the panel' })
  while (await showMore.isVisible()) await showMore.click()
  await page.getByRole('button', { name: 'Add course' }).click()
  await page.getByRole('button', { name: 'Set course', exact: true }).click()
  await expect(tryAnother).toBeEnabled({ timeout: 60_000 })

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'IOF XML of all courses' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('sample-courses.xml')
  const xml = await readFile(await file.path(), 'utf8')

  expect(xml.match(/<Course>/g)).toHaveLength(2)
  // Both courses finish at the competition centre, so they share the finish; each course still
  // picks its own start until setting a course takes the others into account (D27, step 6).
  expect(xml.match(/<Control type="Finish">/g)).toHaveLength(1)
  const ids = [...xml.matchAll(/<Control(?: type="\w+")?><Id>(\w+)<\/Id>/g)].map(match => match[1])
  expect(new Set(ids).size).toBe(ids.length)
})
