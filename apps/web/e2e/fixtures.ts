import { test as base, expect } from '@playwright/test'

type Fixtures = {
  externalRequests: string[]
  pageErrors: string[]
}

// Every test records what left the page for another host and fails on browser errors, so a
// regression that sends map data out (D3) or breaks the page shows up even when the UI looks right.
export const test = base.extend<Fixtures>({
  externalRequests: [
    async ({ page, baseURL }, use) => {
      const requests: string[] = []
      const ownOrigin = new URL(baseURL ?? '').origin
      await page.route(
        url => url.origin !== ownOrigin && url.protocol.startsWith('http'),
        async route => {
          requests.push(route.request().url())
          await route.fulfill({ status: 204 })
        },
      )
      await use(requests)
    },
    { auto: true },
  ],
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text())
      })
      await use(errors)
      expect(errors, 'errors in the browser console').toEqual([])
    },
    { auto: true },
  ],
})

export const ANALYTICS_SCRIPT = 'https://cloud.umami.is/script.js'

export { expect }
