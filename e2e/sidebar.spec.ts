import { test, expect } from './fixtures'

// --- S1: Layout Split ---

test('S1: sidebar element exists', async ({ appWindow }) => {
  const sidebar = appWindow.locator('[data-testid="sidebar"]')
  await expect(sidebar).toBeVisible({ timeout: 5000 })
})

test('S1: sidebar has correct default width', async ({ appWindow }) => {
  const sidebar = appWindow.locator('[data-testid="sidebar"]')
  const box = await sidebar.boundingBox()
  expect(box).toBeTruthy()
  expect(box!.width).toBeGreaterThanOrEqual(195)
  expect(box!.width).toBeLessThanOrEqual(210)
})

test('S1: sidebar has warm stone background', async ({ appWindow }) => {
  const sidebar = appWindow.locator('[data-testid="sidebar"]')
  const bg = await sidebar.evaluate((el) => getComputedStyle(el).backgroundColor)
  // #F0EBE3 = rgb(240, 235, 227)
  expect(bg).toBe('rgb(240, 235, 227)')
})

test('S1: terminal still fills remaining space', async ({ appWindow }) => {
  const sidebar = appWindow.locator('[data-testid="sidebar"]')
  const terminal = appWindow.locator('.xterm')
  await expect(terminal).toBeVisible({ timeout: 5000 })

  const sidebarBox = await sidebar.boundingBox()
  const terminalBox = await terminal.boundingBox()
  expect(sidebarBox).toBeTruthy()
  expect(terminalBox).toBeTruthy()

  // Terminal should start after sidebar
  expect(terminalBox!.x).toBeGreaterThanOrEqual(sidebarBox!.x + sidebarBox!.width - 5)
})

test('S1: no visible border between sidebar and terminal', async ({ appWindow }) => {
  const sidebar = appWindow.locator('[data-testid="sidebar"]')
  const borderRight = await sidebar.evaluate((el) => getComputedStyle(el).borderRightWidth)
  expect(borderRight).toBe('0px')
})

// --- S2: Project List (now from real fixture data) ---

test('S2: project list shows projects from fixtures', async ({ appWindow }) => {
  // Wait for IPC session data to arrive from main process
  await appWindow.waitForTimeout(2000)
  const projects = appWindow.locator('[data-testid="project-item"]')
  await expect(projects.first()).toBeVisible({ timeout: 5000 })
  const count = await projects.count()
  // Fixtures have 2 projects: team-pulse and ridecast
  expect(count).toBe(2)
})

test('S2: project names have correct font size', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)
  const project = appWindow.locator('[data-testid="project-name"]').first()
  await expect(project).toBeVisible({ timeout: 5000 })
  const fontSize = await project.evaluate((el) => getComputedStyle(el).fontSize)
  expect(fontSize).toBe('11px')
})

test('S2: clicking a project selects it', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)
  const project = appWindow.locator('[data-testid="project-item"]').first()
  await expect(project).toBeVisible({ timeout: 5000 })
  await project.click()
  const selected = await project.getAttribute('data-selected')
  expect(selected).toBe('true')
})

// --- S3: Session List ---

test('S3: selected project shows sessions', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Ensure no project is selected first by clicking an already-selected one to deselect
  const project = appWindow.locator('[data-testid="project-item"]').first()
  await expect(project).toBeVisible({ timeout: 5000 })
  const selected = await project.getAttribute('data-selected')
  if (selected === 'true') {
    await project.click()
    await appWindow.waitForTimeout(200)
  }
  // Now select it fresh
  await project.click()
  await appWindow.waitForTimeout(200)
  const sessions = appWindow.locator('[data-testid="session-item"]')
  await expect(sessions.first()).toBeVisible({ timeout: 3000 })
  const count = await sessions.count()
  expect(count).toBeGreaterThanOrEqual(1)
})

test('S3: session names have correct font size', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)
  const project = appWindow.locator('[data-testid="project-item"]').first()
  await expect(project).toBeVisible({ timeout: 5000 })
  // Ensure sessions are visible
  const selected = await project.getAttribute('data-selected')
  if (selected !== 'true') {
    await project.click()
    await appWindow.waitForTimeout(200)
  }
  const session = appWindow.locator('[data-testid="session-name"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  const fontSize = await session.evaluate((el) => getComputedStyle(el).fontSize)
  expect(fontSize).toBe('10px')
})

// --- S4: Collapse/Expand ---

test('S4: sidebar can be collapsed', async ({ appWindow }) => {
  const toggle = appWindow.locator('[data-testid="sidebar-toggle"]')
  await expect(toggle).toBeVisible({ timeout: 5000 })

  // Ensure expanded first
  const sidebar = appWindow.locator('[data-testid="sidebar"]')
  const beforeBox = await sidebar.boundingBox()
  if (beforeBox && beforeBox.width < 100) {
    await toggle.click()
    await appWindow.waitForTimeout(300)
  }

  // Now collapse
  await toggle.click()
  await appWindow.waitForTimeout(300)

  const box = await sidebar.boundingBox()
  expect(box).toBeTruthy()
  expect(box!.width).toBeLessThanOrEqual(35)
})

test('S4: collapsed sidebar can be expanded', async ({ appWindow }) => {
  const toggle = appWindow.locator('[data-testid="sidebar-toggle"]')
  const sidebar = appWindow.locator('[data-testid="sidebar"]')

  // Ensure collapsed first
  const beforeBox = await sidebar.boundingBox()
  if (beforeBox && beforeBox.width > 100) {
    await toggle.click()
    await appWindow.waitForTimeout(300)
  }

  // Now expand
  await toggle.click()
  await appWindow.waitForTimeout(300)

  const box = await sidebar.boundingBox()
  expect(box).toBeTruthy()
  expect(box!.width).toBeGreaterThanOrEqual(195)
})

// --- S5: Header Bar ---

test('S5: header bar exists with correct background', async ({ appWindow }) => {
  const header = appWindow.locator('[data-testid="header-bar"]')
  await expect(header).toBeVisible({ timeout: 5000 })
  const bg = await header.evaluate((el) => getComputedStyle(el).backgroundColor)
  // #E8E2D8 = rgb(232, 226, 216)
  expect(bg).toBe('rgb(232, 226, 216)')
})

test('S5: header bar spans full width', async ({ appWindow }) => {
  const header = appWindow.locator('[data-testid="header-bar"]')
  const headerBox = await header.boundingBox()
  const winSize = await appWindow.evaluate(() => ({ width: window.innerWidth }))
  expect(headerBox).toBeTruthy()
  expect(headerBox!.width).toBeGreaterThanOrEqual(winSize.width - 2)
})

test('S5: header bar has correct height', async ({ appWindow }) => {
  const header = appWindow.locator('[data-testid="header-bar"]')
  const box = await header.boundingBox()
  expect(box).toBeTruthy()
  expect(box!.height).toBeGreaterThanOrEqual(28)
  expect(box!.height).toBeLessThanOrEqual(40)
})

test('S5: header bar is draggable region', async ({ appWindow }) => {
  const header = appWindow.locator('[data-testid="header-bar"]')
  const webkitDrag = await header.evaluate((el) => getComputedStyle(el).getPropertyValue('-webkit-app-region'))
  expect(webkitDrag).toBe('drag')
})

// --- S6: Session Selection ---

test('S6: clicking a session selects it', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Expand Team Pulse project first
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

  // Click the first session
  const session = appWindow.locator('[data-testid="session-item"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  await session.click()

  const selected = await session.getAttribute('data-selected')
  expect(selected).toBe('true')
})

test('S6: clicking a different session deselects the previous one', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Expand Team Pulse project
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

  const sessions = appWindow.locator('[data-testid="session-item"]')
  await expect(sessions.first()).toBeVisible({ timeout: 3000 })
  const sessionCount = await sessions.count()
  expect(sessionCount).toBeGreaterThanOrEqual(2)

  // Click the first session
  await sessions.first().click()
  const firstSelected = await sessions.first().getAttribute('data-selected')
  expect(firstSelected).toBe('true')

  // Click the second session
  await sessions.nth(1).click()
  const firstAfter = await sessions.first().getAttribute('data-selected')
  const secondAfter = await sessions.nth(1).getAttribute('data-selected')
  expect(firstAfter).toBe('false')
  expect(secondAfter).toBe('true')
})

// --- S7: Status Dots ---

test('S7: session items show status dots', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Expand Team Pulse project
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

  const dots = appWindow.locator('[data-testid="status-dot"]')
  await expect(dots.first()).toBeVisible({ timeout: 3000 })
  const dotCount = await dots.count()
  expect(dotCount).toBeGreaterThanOrEqual(2)

  // Each dot should have a non-empty background-color
  const firstDotBg = await dots.first().evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(firstDotBg).not.toBe('')
  expect(firstDotBg).not.toBe('rgba(0, 0, 0, 0)')
})
