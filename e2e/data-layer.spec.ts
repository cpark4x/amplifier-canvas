import { test, expect } from './fixtures'

// --- D1: Database initialization ---

test('D1: app starts without crashing when AMPLIFIER_HOME is set to fixtures', async ({ appWindow }) => {
  const title = await appWindow.title()
  expect(title).toBe('Amplifier Canvas')
})

// --- D2: IPC bridge exposes new methods ---

test('D2: electronAPI exposes session and file IPC methods', async ({ appWindow }) => {
  const apiShape = await appWindow.evaluate(() => ({
    hasOnSessionsChanged: typeof window.electronAPI?.onSessionsChanged === 'function',
    hasOnFilesChanged: typeof window.electronAPI?.onFilesChanged === 'function',
    hasListDir: typeof window.electronAPI?.listDir === 'function',
    hasReadTextFile: typeof window.electronAPI?.readTextFile === 'function',
  }))

  expect(apiShape.hasOnSessionsChanged).toBe(true)
  expect(apiShape.hasOnFilesChanged).toBe(true)
  expect(apiShape.hasListDir).toBe(true)
  expect(apiShape.hasReadTextFile).toBe(true)
})

// --- D3: Zustand store receives session data ---

test('D3: renderer receives session state from main process', async ({ appWindow }) => {
  // Wait for the IPC push to arrive
  await appWindow.waitForTimeout(2000)

  const sessionCount = await appWindow.evaluate(() => {
    const storeEl = document.querySelector('[data-testid="debug-session-count"]')
    return storeEl?.textContent || '0'
  })

  // Fixtures have 3 sessions across 2 projects
  expect(parseInt(sessionCount, 10)).toBe(3)
})

// --- D4: Sidebar shows real project data ---

test('D4: sidebar displays projects from fixture data', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  const projectNames = await appWindow.evaluate(() => {
    const elements = document.querySelectorAll('[data-testid="project-name"]')
    return Array.from(elements).map((el) => el.textContent)
  })

  // Fixture projects: ridecast and team-pulse (alphabetical: Ridecast, Team Pulse)
  expect(projectNames).toContain('Ridecast')
  expect(projectNames).toContain('Team Pulse')
})

// --- D5: Session status is derived from events.jsonl ---

test('D5: project sessions are listed when project is expanded', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Find and click the "Team Pulse" project (has 2 sessions in fixtures)
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

  const sessions = appWindow.locator('[data-testid="session-item"]')
  await expect(sessions.first()).toBeVisible({ timeout: 3000 })
  const sessionCount = await sessions.count()
  expect(sessionCount).toBe(2)
})
