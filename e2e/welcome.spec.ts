import { test, expect } from './fixtures'

test('Screen 1: welcome screen renders, button opens terminal', async ({ appWindow }) => {
  await appWindow.waitForLoadState('domcontentloaded')
  await appWindow.waitForTimeout(2000)

  // Screen 1: welcome visible, terminal hidden
  const welcome = appWindow.locator('[data-testid="welcome-main"]')
  await expect(welcome).toBeVisible({ timeout: 5000 })
  console.log('✓ Welcome screen visible')

  const emptyState = appWindow.locator('[data-testid="sidebar-empty"]')
  await expect(emptyState).toBeVisible()
  console.log('✓ Sidebar: "No projects yet"')

  const terminal = appWindow.locator('[data-testid="pane-title"]')
  await expect(terminal).not.toBeVisible()
  console.log('✓ Terminal hidden')

  // Click "Create your first project"
  const btn = appWindow.locator('[data-testid="welcome-btn"]')
  await btn.click()
  await appWindow.waitForTimeout(1000)

  // Welcome should disappear, terminal should appear
  await expect(welcome).not.toBeVisible({ timeout: 3000 })
  console.log('✓ Welcome hidden after click')

  await expect(terminal).toBeVisible({ timeout: 3000 })
  console.log('✓ Terminal visible after click')

  // Screenshot the result
  await appWindow.screenshot({ path: '/tmp/canvas-after-click.png' })
  console.log('✓ Screenshot: /tmp/canvas-after-click.png')
})
