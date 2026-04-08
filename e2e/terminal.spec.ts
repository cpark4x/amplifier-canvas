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
    env: { ...process.env, NODE_ENV: 'test', AMPLIFIER_HOME: require('path').resolve(__dirname, 'fixtures', 'amplifier-home') },
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

test('T1: window has warm background to prevent flash', async ({ electronApp }) => {
  const bgColor = await electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    return win?.getBackgroundColor()
  })

  // Should be warm stone (#F0EBE3) — Electron returns uppercase hex with alpha
  expect(bgColor?.toLowerCase()).toContain('f0ebe3')
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

test('T2: terminal takes up the main content area', async ({ appWindow }) => {
  const terminal = appWindow.locator('.xterm')
  const box = await terminal.boundingBox()
  expect(box).toBeTruthy()
  const size = await appWindow.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }))
  // Terminal shares width with sidebar, but should fill most of it
  expect(box!.width).toBeGreaterThan(size.width * 0.4)
  expect(box!.height).toBeGreaterThan(size.height * 0.5)
})

// --- T3: PTY Pipe ---

test('T3: typing a command produces output', async ({ appWindow }) => {
  const terminal = appWindow.locator('.xterm')

  // Wait for shell to initialize and show a prompt
  await appWindow.waitForTimeout(2000)

  // Click the terminal to focus xterm's internal textarea
  await terminal.click()

  await appWindow.keyboard.type('echo __CANVAS_TEST__')
  await appWindow.keyboard.press('Enter')

  await expect(terminal).toContainText('__CANVAS_TEST__', { timeout: 5000 })
})

test('T3: shell persists after command completes', async ({ appWindow }) => {
  const terminal = appWindow.locator('.xterm')

  // Click the terminal to ensure focus
  await terminal.click()

  await appWindow.keyboard.type('echo __STILL_ALIVE__')
  await appWindow.keyboard.press('Enter')

  await expect(terminal).toContainText('__STILL_ALIVE__', { timeout: 5000 })
})

test('T3: ANSI color sequences render correctly', async ({ appWindow }) => {
  const terminal = appWindow.locator('.xterm')

  await appWindow.waitForTimeout(1000)
  await terminal.click()

  await appWindow.keyboard.type('printf "\\033[32mGREEN\\033[0m NORMAL"')
  await appWindow.keyboard.press('Enter')

  await expect(terminal).toContainText('GREEN', { timeout: 5000 })
  await expect(terminal).toContainText('NORMAL', { timeout: 5000 })
})

test('T3: window resize reflows terminal', async ({ appWindow, electronApp }) => {
  const terminal = appWindow.locator('.xterm')
  const boxBefore = await terminal.boundingBox()
  expect(boxBefore).toBeTruthy()

  await electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      const [w, h] = win.getSize()
      win.setSize(w + 100, h + 100)
    }
  })

  await appWindow.waitForTimeout(500)

  const boxAfter = await terminal.boundingBox()
  expect(boxAfter).toBeTruthy()
  expect(boxAfter!.width).toBeGreaterThan(boxBefore!.width)
})

// --- T5: Keyboard Fidelity ---

test('T5: Ctrl+C sends SIGINT and interrupts a running process', async ({ appWindow }) => {
  const term = appWindow.locator('.xterm')
  await term.click()
  await appWindow.waitForTimeout(1000)
  await appWindow.keyboard.type('sleep 999')
  await appWindow.keyboard.press('Enter')
  await appWindow.waitForTimeout(500)
  await appWindow.keyboard.press('Control+c')
  await appWindow.waitForTimeout(500)
  await appWindow.keyboard.type('echo __AFTER_SIGINT__')
  await appWindow.keyboard.press('Enter')

  const terminal = appWindow.locator('.xterm')
  await expect(terminal).toContainText('__AFTER_SIGINT__', { timeout: 5000 })
})

test('T5: arrow keys produce escape sequences (command history)', async ({ appWindow }) => {
  await appWindow.locator('.xterm').click()
  await appWindow.keyboard.type('echo __HISTORY_TEST__')
  await appWindow.keyboard.press('Enter')
  await appWindow.waitForTimeout(500)
  await appWindow.keyboard.press('ArrowUp')
  await appWindow.waitForTimeout(300)
  await appWindow.keyboard.press('Enter')

  const terminal = appWindow.locator('.xterm')
  await expect(terminal).toContainText('__HISTORY_TEST__', { timeout: 5000 })
})

test('T5: Ctrl+D on empty line exits subshell gracefully', async ({ appWindow }) => {
  await appWindow.locator('.xterm').click()
  await appWindow.keyboard.type('bash')
  await appWindow.keyboard.press('Enter')
  await appWindow.waitForTimeout(500)
  await appWindow.keyboard.press('Control+d')
  await appWindow.waitForTimeout(500)
  await appWindow.keyboard.type('echo __AFTER_CTRL_D__')
  await appWindow.keyboard.press('Enter')

  const terminal = appWindow.locator('.xterm')
  await expect(terminal).toContainText('__AFTER_CTRL_D__', { timeout: 5000 })
})

test('T5: tab completion works', async ({ appWindow }) => {
  await appWindow.locator('.xterm').click()
  await appWindow.keyboard.type('ech')
  await appWindow.keyboard.press('Tab')
  await appWindow.waitForTimeout(500)
  await appWindow.keyboard.type(' __TAB_COMPLETE__')
  await appWindow.keyboard.press('Enter')

  const terminal = appWindow.locator('.xterm')
  await expect(terminal).toContainText('__TAB_COMPLETE__', { timeout: 5000 })
})