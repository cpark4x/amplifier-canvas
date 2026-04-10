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

  // Fixtures have sessions across 2 projects (at least 4: rc-001 + tp-001/002/003;
  // tp-session-analysis adds a 5th when present)
  expect(parseInt(sessionCount, 10)).toBeGreaterThanOrEqual(4)
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

  // Find and click the "Team Pulse" project (has 3+ sessions in fixtures)
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

  // Done/failed sessions render as history-items; needs_input sessions as session-items.
  // Count ALL session rows (active or history) for team-pulse.
  const sessions = appWindow.locator(
    '[data-testid="session-item"][data-project-slug="team-pulse"], [data-testid="history-item"][data-project-slug="team-pulse"]'
  )
  await expect(sessions.first()).toBeVisible({ timeout: 3000 })
  const sessionCount = await sessions.count()
  expect(sessionCount).toBeGreaterThanOrEqual(3)
})

// --- D6: workDir is extracted from events and available on sessions ---

test('D6: sessions have workDir extracted from events.jsonl cwd field', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Read workDir data from the debug element added to App.tsx
  const workDirData = await appWindow.evaluate(() => {
    const el = document.querySelector('[data-testid="debug-session-workdirs"]')
    if (!el || !el.textContent) return null
    try {
      return JSON.parse(el.textContent) as Array<{ id: string; workDir?: string }>
    } catch {
      return null
    }
  })

  expect(workDirData).not.toBeNull()
  // At least 4 sessions (tp-session-analysis fixture may add a 5th)
  expect(workDirData!.length).toBeGreaterThanOrEqual(4)

  // All fixture sessions should have workDir set (events.jsonl has cwd field)
  for (const session of workDirData!) {
    expect(session.workDir).toBeDefined()
    expect(typeof session.workDir).toBe('string')
    expect(session.workDir!).toContain('workdir')
  }
})

// --- D7: Enriched session data (title, status, stats) ---

test('D7: sessions have enriched title, status, and stats from events.jsonl', async ({
  appWindow,
}) => {
  await appWindow.waitForTimeout(2000)

  const sessionTitles = await appWindow.evaluate(() => {
    const el = document.querySelector('[data-testid="debug-session-titles"]')
    if (!el || !el.textContent) return null
    try {
      return JSON.parse(el.textContent) as Array<{
        id: string
        title?: string
        status: string
        promptCount?: number
        filesChangedCount?: number
      }>
    } catch {
      return null
    }
  })

  expect(sessionTitles).not.toBeNull()

  const tp001 = sessionTitles!.find((s) => s.id === 'tp-session-001')
  expect(tp001).toBeDefined()
  expect(tp001!.status).toBe('done')
  expect(tp001!.title).toContain('Refactor the auth module')
  expect(tp001!.promptCount).toBe(1)

  const tp003 = sessionTitles!.find((s) => s.id === 'tp-session-003')
  expect(tp003).toBeDefined()
  expect(tp003!.status).toBe('failed')
})
