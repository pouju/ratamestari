import { defineConfig, devices } from '@playwright/test'

const port = 4173

export default defineConfig({
  testDir: './e2e',
  testMatch: '*.e2e.ts',
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}/`,
    locale: 'en-GB',
    trace: 'retain-on-failure',
    screenshot: 'on',
    // Skips the course reveal animation, so screenshots show the finished course.
    reducedMotion: 'reduce',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  // Tests the production build, so `pnpm build` must have run first (`pnpm e2e` does it).
  webServer: {
    command: `vite preview --port ${port} --strictPort`,
    port,
    reuseExistingServer: !process.env['CI'],
  },
})
