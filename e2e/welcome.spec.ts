import { test, expect } from './fixtures'

// NOTE: All tests in this file share ONE Electron app (worker-scoped fixture).
// Tests run sequentially and state persists. Order matters.

test('Screen 1: welcome screen renders correctly', async ({ appWindow }) => {
  await appWindow.waitForLoadState('domcontentloaded')
  await appWindow.waitForTimeout(2000)

  // If a previous test in this Playwright worker left the app in a non-welcome state
  // (e.g. a session was selected), reset back to the welcome screen.
  await appWindow.evaluate(() => {
    const reset = (window as unknown as Record<string, unknown>).__resetToWelcome
    if (typeof reset === 'function') reset()
  })
  await appWindow.waitForTimeout(300) // Allow React to re-render

  // Welcome visible, terminal hidden
  const welcome = appWindow.locator('[data-testid="welcome-main"]')
  await expect(welcome).toBeVisible({ timeout: 5000 })
  console.log('✓ Welcome screen visible')

  const terminal = appWindow.locator('[data-testid="pane-title"]')
  await expect(terminal).not.toBeVisible()
  console.log('✓ Terminal hidden')
})

test('Screen 2: clicking button opens Add Project modal with tabs', async ({ appWindow }) => {
  // Click welcome button
  const btn = appWindow.locator('[data-testid="welcome-btn"]')
  await btn.click()
  await appWindow.waitForTimeout(500)

  // Modal should appear
  const modal = appWindow.locator('[data-testid="modal"]')
  await expect(modal).toBeVisible({ timeout: 3000 })
  console.log('✓ Modal visible')

  // Two tabs: "New" and "Existing"
  const tabNew = appWindow.locator('[data-testid="tab-new"]')
  const tabExisting = appWindow.locator('[data-testid="tab-existing"]')
  await expect(tabNew).toBeVisible()
  await expect(tabExisting).toBeVisible()
  console.log('✓ Both tabs visible')

  // "New" tab is active by default
  const nameInput = appWindow.locator('[data-testid="project-name-input"]')
  await expect(nameInput).toBeVisible()
  await expect(nameInput).toHaveAttribute('placeholder', 'Project name')
  console.log('✓ Project name input with placeholder')

  // Submit and cancel buttons exist
  await expect(appWindow.locator('[data-testid="modal-submit"]')).toBeVisible()
  console.log('✓ "Create project" button visible')

  await expect(appWindow.locator('[data-testid="modal-cancel"]')).toBeVisible()
  console.log('✓ Cancel button visible')

  await appWindow.screenshot({ path: '/tmp/canvas-screen2-new-tab.png' })
  console.log('✓ Screenshot: /tmp/canvas-screen2-new-tab.png')
})

test('Screen 2: switching to Existing tab shows search + project list', async ({ appWindow }) => {
  // Modal is still open from previous test — click "Existing" tab
  await appWindow.locator('[data-testid="tab-existing"]').click()
  await appWindow.waitForTimeout(500)

  // Search input should be visible
  const searchInput = appWindow.locator('[data-testid="search-input"]')
  await expect(searchInput).toBeVisible()
  console.log('✓ Search input visible on Existing tab')

  // Switch back to New tab
  await appWindow.locator('[data-testid="tab-new"]').click()
  await appWindow.waitForTimeout(300)

  // Name input visible again
  const nameInput = appWindow.locator('[data-testid="project-name-input"]')
  await expect(nameInput).toBeVisible()
  console.log('✓ Name input visible again after switching back to New tab')
})

test('Screen 2: cancel closes modal, returns to welcome', async ({ appWindow }) => {
  // Modal is still open from previous test — click cancel
  await appWindow.locator('[data-testid="modal-cancel"]').click()
  await appWindow.waitForTimeout(500)

  // Modal gone, welcome still there
  const modal = appWindow.locator('[data-testid="modal"]')
  await expect(modal).not.toBeVisible()
  console.log('✓ Modal closed')

  const welcome = appWindow.locator('[data-testid="welcome-main"]')
  await expect(welcome).toBeVisible()
  console.log('✓ Welcome screen still visible')
})

test('Screen 2→3: creating project transitions to terminal + sidebar shows project', async ({ appWindow }) => {
  // Re-open modal
  await appWindow.locator('[data-testid="welcome-btn"]').click()
  await appWindow.waitForTimeout(500)

  const modal = appWindow.locator('[data-testid="modal"]')
  await expect(modal).toBeVisible({ timeout: 3000 })

  // Type project name
  const nameInput = appWindow.locator('[data-testid="project-name-input"]')
  await nameInput.fill('Canvas-App')
  console.log('✓ Typed project name: Canvas-App')

  // Click "Create project"
  await appWindow.locator('[data-testid="modal-submit"]').click()
  await appWindow.waitForTimeout(1000)

  // Modal gone
  await expect(modal).not.toBeVisible()
  console.log('✓ Modal closed')

  // Welcome gone
  const welcome = appWindow.locator('[data-testid="welcome-main"]')
  await expect(welcome).not.toBeVisible()
  console.log('✓ Welcome hidden')

  // Terminal visible (Screen 3)
  const terminal = appWindow.locator('[data-testid="pane-title"]')
  await expect(terminal).toBeVisible({ timeout: 3000 })
  console.log('✓ Terminal visible (Screen 3)')

  // Sidebar: "No projects yet" gone, project name visible
  const emptyState = appWindow.locator('[data-testid="sidebar-empty"]')
  await expect(emptyState).not.toBeVisible()
  console.log('✓ Sidebar empty state gone')

  const projectName = appWindow.locator('[data-testid="project-name"]', { hasText: 'Canvas' })
  await expect(projectName).toBeVisible({ timeout: 3000 })
  console.log('✓ Sidebar shows project: Canvas-App')

  // "+" button visible in sidebar
  const addBtn = appWindow.locator('[data-testid="sidebar-add-btn"]')
  await expect(addBtn).toBeVisible()
  console.log('✓ Sidebar "+" button visible')

  await appWindow.screenshot({ path: '/tmp/canvas-screen3.png' })
  console.log('✓ Screenshot: /tmp/canvas-screen3.png')
})
