import { test, expect } from './fixtures'

// NOTE: All tests in this file share ONE Electron app (worker-scoped fixture).
// Tests run sequentially and state persists. Order matters.

test('Screen 1: welcome screen renders correctly', async ({ appWindow }) => {
  await appWindow.waitForLoadState('domcontentloaded')
  await appWindow.waitForTimeout(2000)

  // Sidebar empty state
  const emptyState = appWindow.locator('[data-testid="sidebar-empty"]')
  await expect(emptyState).toBeVisible({ timeout: 5000 })
  console.log('✓ Sidebar: "No projects yet"')

  // Welcome visible, terminal hidden
  const welcome = appWindow.locator('[data-testid="welcome-main"]')
  await expect(welcome).toBeVisible({ timeout: 5000 })
  console.log('✓ Welcome screen visible')

  const terminal = appWindow.locator('[data-testid="pane-title"]')
  await expect(terminal).not.toBeVisible()
  console.log('✓ Terminal hidden')
})

test('Screen 2: clicking button opens New Project modal', async ({ appWindow }) => {
  // Click welcome button
  const btn = appWindow.locator('[data-testid="welcome-btn"]')
  await btn.click()
  await appWindow.waitForTimeout(500)

  // Modal should appear
  const modal = appWindow.locator('[data-testid="modal"]')
  await expect(modal).toBeVisible({ timeout: 3000 })
  console.log('✓ Modal visible')

  // Modal has correct title
  const title = modal.locator('text=New Project')
  await expect(title).toBeVisible()
  console.log('✓ Modal title: "New Project"')

  // Has project name input with placeholder
  const nameInput = appWindow.locator('[data-testid="project-name-input"]')
  await expect(nameInput).toBeVisible()
  await expect(nameInput).toHaveAttribute('placeholder', 'e.g. Canvas-App')
  console.log('✓ Project name input with placeholder')

  // Has radio buttons
  await expect(appWindow.locator('[data-testid="radio-blank"]')).toBeVisible()
  console.log('✓ "Blank project" radio visible')

  await expect(appWindow.locator('[data-testid="radio-existing"]')).toBeVisible()
  console.log('✓ "Existing folder" radio visible')

  // Folder input is disabled by default (blank project selected)
  const folderInput = appWindow.locator('[data-testid="folder-input"]')
  await expect(folderInput).toBeDisabled()
  console.log('✓ Folder input disabled (blank project mode)')

  // Submit and cancel buttons exist
  await expect(appWindow.locator('[data-testid="modal-submit"]')).toBeVisible()
  console.log('✓ "Create project" button visible')

  await expect(appWindow.locator('[data-testid="modal-cancel"]')).toBeVisible()
  console.log('✓ Cancel button visible')

  await appWindow.screenshot({ path: '/tmp/canvas-screen2.png' })
  console.log('✓ Screenshot: /tmp/canvas-screen2.png')
})

test('Screen 2: selecting "Existing folder" enables folder input', async ({ appWindow }) => {
  // Modal is still open from previous test
  const folderInput = appWindow.locator('[data-testid="folder-input"]')
  await expect(folderInput).toBeDisabled()
  console.log('✓ Folder input starts disabled')

  // Click "Existing folder"
  await appWindow.locator('[data-testid="radio-existing"]').click()
  await appWindow.waitForTimeout(300)

  await expect(folderInput).toBeEnabled()
  console.log('✓ Folder input enabled after selecting "Existing folder"')

  // Switch back to blank
  await appWindow.locator('[data-testid="radio-blank"]').click()
  await appWindow.waitForTimeout(300)

  await expect(folderInput).toBeDisabled()
  console.log('✓ Folder input disabled again after switching back to blank')
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

test('Screen 2→3: creating project transitions to terminal', async ({ appWindow }) => {
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

  await appWindow.screenshot({ path: '/tmp/canvas-screen3.png' })
  console.log('✓ Screenshot: /tmp/canvas-screen3.png')
})
