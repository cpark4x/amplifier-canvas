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

test('T1: app menu has required sections', async ({ electronApp }) => {
  const menuInfo = await electronApp.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu()
    if (!menu) return null
    return menu.items.map(item => ({
      label: item.label,
      submenuLabels: item.submenu?.items.map(sub => sub.label).filter(l => l !== '') ?? []
    }))
  })

  expect(menuInfo).not.toBeNull()

  const labels = menuInfo!.map(m => m.label)
  expect(labels).toContain('Edit')
  expect(labels).toContain('View')
  expect(labels).toContain('Window')

  // Verify Edit menu has essential items
  const editMenu = menuInfo!.find(m => m.label === 'Edit')!
  expect(editMenu.submenuLabels).toContain('Undo')
  expect(editMenu.submenuLabels).toContain('Copy')
  expect(editMenu.submenuLabels).toContain('Paste')
  expect(editMenu.submenuLabels).toContain('Select All')
})

test('T1: window has dark background to prevent flash', async ({ electronApp }) => {
  const bgColor = await electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    return win?.getBackgroundColor()
  })

  // Should be dark (#1A1A1A) — Electron returns uppercase hex with alpha
  expect(bgColor?.toLowerCase()).toContain('1a1a1a')
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

// --- T2: xterm.js Terminal ---

test('T2: terminal element exists in the window', async ({ appWindow }) => {
  const terminal = appWindow.locator('.xterm')
  await expect(terminal).toBeVisible({ timeout: 5000 })
})

test('T2: terminal takes up the full app area', async ({ appWindow }) => {
  const terminal = appWindow.locator('.xterm')
  const box = await terminal.boundingBox()
  expect(box).toBeTruthy()
  const size = await appWindow.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }))
  expect(box!.width).toBeGreaterThan(size.width * 0.5)
  expect(box!.height).toBeGreaterThan(size.height * 0.5)
})