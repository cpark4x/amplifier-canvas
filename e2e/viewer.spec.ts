import { test, expect } from './fixtures'

// --- V1: Viewer Shell ---

test('V1: selecting a session shows the Viewer panel', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Viewer should NOT be visible initially
  const viewer = appWindow.locator('[data-testid="viewer-panel"]')
  await expect(viewer).not.toBeVisible()

  // Expand Team Pulse project
  const projectItems = appWindow.locator('[data-testid="project-item"]')
  const count = await projectItems.count()
  for (let i = 0; i < count; i++) {
    const name = await projectItems.nth(i).locator('[data-testid="project-name"]').textContent()
    if (name === 'Team Pulse') {
      await projectItems.nth(i).click()
      break
    }
  }
  await appWindow.waitForTimeout(300)

  // Click a session
  const session = appWindow.locator('[data-testid="session-item"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  await session.click()

  // Viewer panel should now be visible
  await expect(viewer).toBeVisible({ timeout: 3000 })
})

test('V1: Viewer panel shows session info in header', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Expand Team Pulse and click first session
  const projectItems = appWindow.locator('[data-testid="project-item"]')
  const count = await projectItems.count()
  for (let i = 0; i < count; i++) {
    const name = await projectItems.nth(i).locator('[data-testid="project-name"]').textContent()
    if (name === 'Team Pulse') {
      const selected = await projectItems.nth(i).getAttribute('data-selected')
      if (selected !== 'true') {
        await projectItems.nth(i).click()
        await appWindow.waitForTimeout(300)
      }
      break
    }
  }

  const session = appWindow.locator('[data-testid="session-item"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  await session.click()

  // Viewer header should show project name and session ID
  const viewerHeader = appWindow.locator('[data-testid="viewer-header"]')
  await expect(viewerHeader).toBeVisible({ timeout: 3000 })

  const headerText = await viewerHeader.textContent()
  expect(headerText).toContain('Team Pulse')
  expect(headerText).toContain('tp-session-')
})

test('V1: Viewer panel shows status dot', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Expand Team Pulse and click first session
  const projectItems = appWindow.locator('[data-testid="project-item"]')
  const count = await projectItems.count()
  for (let i = 0; i < count; i++) {
    const name = await projectItems.nth(i).locator('[data-testid="project-name"]').textContent()
    if (name === 'Team Pulse') {
      const selected = await projectItems.nth(i).getAttribute('data-selected')
      if (selected !== 'true') {
        await projectItems.nth(i).click()
        await appWindow.waitForTimeout(300)
      }
      break
    }
  }

  const session = appWindow.locator('[data-testid="session-item"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  await session.click()

  const viewerDot = appWindow.locator('[data-testid="viewer-status-dot"]')
  await expect(viewerDot).toBeVisible({ timeout: 3000 })
})

test('V1: terminal remains visible when Viewer opens', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Expand Team Pulse and click first session
  const projectItems = appWindow.locator('[data-testid="project-item"]')
  const count = await projectItems.count()
  for (let i = 0; i < count; i++) {
    const name = await projectItems.nth(i).locator('[data-testid="project-name"]').textContent()
    if (name === 'Team Pulse') {
      const selected = await projectItems.nth(i).getAttribute('data-selected')
      if (selected !== 'true') {
        await projectItems.nth(i).click()
        await appWindow.waitForTimeout(300)
      }
      break
    }
  }

  const session = appWindow.locator('[data-testid="session-item"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  await session.click()

  // Both terminal and viewer should be visible
  const terminal = appWindow.locator('.xterm')
  const viewer = appWindow.locator('[data-testid="viewer-panel"]')
  await expect(terminal).toBeVisible({ timeout: 3000 })
  await expect(viewer).toBeVisible({ timeout: 3000 })

  // Terminal should still have width > 0
  const termBox = await terminal.boundingBox()
  expect(termBox).toBeTruthy()
  expect(termBox!.width).toBeGreaterThan(100)
})

test('V1: close button dismisses the Viewer panel', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Expand Team Pulse and click first session
  const projectItems = appWindow.locator('[data-testid="project-item"]')
  const count = await projectItems.count()
  for (let i = 0; i < count; i++) {
    const name = await projectItems.nth(i).locator('[data-testid="project-name"]').textContent()
    if (name === 'Team Pulse') {
      const selected = await projectItems.nth(i).getAttribute('data-selected')
      if (selected !== 'true') {
        await projectItems.nth(i).click()
        await appWindow.waitForTimeout(300)
      }
      break
    }
  }

  const session = appWindow.locator('[data-testid="session-item"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  await session.click()

  const viewer = appWindow.locator('[data-testid="viewer-panel"]')
  await expect(viewer).toBeVisible({ timeout: 3000 })

  // Click the close button
  const closeBtn = appWindow.locator('[data-testid="viewer-close"]')
  await expect(closeBtn).toBeVisible({ timeout: 3000 })
  await closeBtn.click()

  // Viewer should disappear
  await expect(viewer).not.toBeVisible({ timeout: 3000 })
})