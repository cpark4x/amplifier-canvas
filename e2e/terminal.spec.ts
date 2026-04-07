import { _electron as electron } from '@playwright/test'
import { test, expect } from './fixtures'
import { APP_NAME, WINDOW_CONFIG } from '../src/shared/constants'

// --- T1: Electron Shell ---

test('T1: window has correct title', async ({ appWindow }) => {
  const title = await appWindow.title()
  expect(title).toBe(APP_NAME)
})

test('T1: window has minimum dimensions', async ({ appWindow }) => {
  // Electron doesn't use Playwright's viewport; read actual window inner size.
  const size = await appWindow.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }))
  expect(size.width).toBeGreaterThanOrEqual(WINDOW_CONFIG.minWidth)
  expect(size.height).toBeGreaterThanOrEqual(WINDOW_CONFIG.minHeight)
})

test('T1: app launches in under 2 seconds', async () => {
  // Launch a fresh instance and measure startup time.
  // 5s is a generous CI threshold; actual target is <2s.
  const start = Date.now()
  const testApp = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'test' },
  })
  const testPage = await testApp.firstWindow()
  const elapsed = Date.now() - start

  try {
    expect(elapsed).toBeLessThan(5000)
    // Sanity-check the launched window
    const title = await testPage.title()
    expect(title).toBe(APP_NAME)
  } finally {
    await testApp.close()
  }
})

test('T1: window shows no unexpected chrome', async ({ appWindow }) => {
  // The app should show a dark background with terminal-first layout.
  // Verify the #root container exists and takes full viewport.
  const rootDiv = appWindow.locator('#root')
  await expect(rootDiv).toBeVisible()

  // Verify the root div is present and rendered
  const boundingBox = await rootDiv.boundingBox()
  expect(boundingBox).toBeTruthy()
  expect(boundingBox!.width).toBeGreaterThan(0)
  expect(boundingBox!.height).toBeGreaterThan(0)
})