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
  // #F2F0EB = rgb(242, 240, 235)
  expect(bg).toBe('rgb(242, 240, 235)')
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

// --- S2: Project List ---

test('S2: project list shows project names', async ({ appWindow }) => {
  const projects = appWindow.locator('[data-testid="project-item"]')
  await expect(projects.first()).toBeVisible({ timeout: 5000 })
  const count = await projects.count()
  expect(count).toBe(3)
})

test('S2: project names have correct font size', async ({ appWindow }) => {
  const project = appWindow.locator('[data-testid="project-name"]').first()
  const fontSize = await project.evaluate((el) => getComputedStyle(el).fontSize)
  expect(fontSize).toBe('11px')
})

test('S2: clicking a project selects it', async ({ appWindow }) => {
  const project = appWindow.locator('[data-testid="project-item"]').first()
  await project.click()
  const selected = await project.getAttribute('data-selected')
  expect(selected).toBe('true')
})

// --- S3: Session List ---

test('S3: selected project shows sessions', async ({ appWindow }) => {
  // Ensure no project is selected first by clicking an already-selected one to deselect
  const project = appWindow.locator('[data-testid="project-item"]').first()
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
  const project = appWindow.locator('[data-testid="project-item"]').first()
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
  // #F5F3EE = rgb(245, 243, 238)
  expect(bg).toBe('rgb(245, 243, 238)')
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