import { ANALYTICS_SCRIPT, expect, test } from './fixtures'

test('the landing page opens', async ({ page, externalRequests }) => {
  await page.goto('./')
  await expect(page.getByRole('link', { name: 'Try it with a sample map' }).first()).toBeVisible()
  expect(externalRequests.filter(url => url !== ANALYTICS_SCRIPT)).toEqual([])
})

test('a course is set on the sample map', async ({ page, externalRequests }) => {
  await page.goto('./app/?sample')

  await expect(page.getByText('sample.ocd, 1:15 000')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try another course' })).toBeEnabled({
    timeout: 60_000,
  })
  await expect(page.getByRole('button', { name: 'Download PDF' })).toBeEnabled()
  await expect(page.getByText(/^\d+(\.\d+)? km$/).first()).toBeVisible()

  expect(externalRequests.filter(url => url !== ANALYTICS_SCRIPT)).toEqual([])
})
