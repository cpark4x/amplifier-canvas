import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  retries: 0,
  workers: 1,
  // Exclude fixture data directories that may contain non-Playwright test files
  testIgnore: ['**/fixtures/**'],
  use: {
    trace: 'on-first-retry'
  }
})
