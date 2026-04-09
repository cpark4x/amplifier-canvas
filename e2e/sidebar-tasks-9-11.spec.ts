/**
 * E2E tests for Tasks 9, 10, 11:
 *   T9 — Sidebar status dot colors
 *   T10 — Sidebar history section
 *   T11 — "+ New session" slot
 *
 * Uses an ISOLATED temp AMPLIFIER_HOME (not the shared fixtures dir) to avoid
 * database race conditions with db-migration.spec.ts when running in parallel.
 */
import { test as base, _electron as electron, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// ---- Fixtures ---------------------------------------------------------------

type SidebarFixtures = {
  electronApp: ElectronApplication
  appWindow: Page
  tempHome: string
}

const test = base.extend<{}, SidebarFixtures>({
  tempHome: [
    async ({}, use) => {
      const tempHome = mkdtempSync(join(tmpdir(), 'amplifier-sidebar-test-'))
      const projectsDir = join(tempHome, 'projects')
      mkdirSync(join(tempHome, 'canvas'), { recursive: true })

      // ---- Project: test-project ------------------------------------------
      // done-session  (exitCode=0 → done)
      // active-session  (no session:end, last event = assistant_message → needs_input)
      // failed-session  (exitCode=1 → failed)
      //
      // All sessions have cwd: /tmp/sidebar-test-workdir (absolute path, always exists on macOS/Linux)
      const workdir = tmpdir() // /tmp — guaranteed to exist

      const makeSession = (sessionId: string, projectSlug: string, events: object[]): void => {
        const dir = join(projectsDir, projectSlug, 'sessions', sessionId)
        mkdirSync(dir, { recursive: true })
        const jsonl = events.map((e) => JSON.stringify(e)).join('\n') + '\n'
        writeFileSync(join(dir, 'events.jsonl'), jsonl, 'utf-8')
      }

      // done-session
      makeSession('done-session', 'test-project', [
        {
          type: 'session:start',
          timestamp: '2026-04-07T10:00:00Z',
          data: { sessionId: 'done-session', projectSlug: 'test-project', cwd: workdir },
        },
        {
          type: 'user_message',
          timestamp: '2026-04-07T10:00:01Z',
          data: { text: 'Refactor the auth module' },
        },
        {
          type: 'tool_call',
          timestamp: '2026-04-07T10:00:05Z',
          data: { tool: 'write_file', args: { path: 'src/app.ts' } },
        },
        {
          type: 'tool_call',
          timestamp: '2026-04-07T10:00:10Z',
          data: { tool: 'edit_file', args: { path: 'src/utils.ts' } },
        },
        {
          type: 'session:end',
          timestamp: '2026-04-07T10:00:25Z',
          data: { exitCode: 0 },
        },
      ])

      // active-session (needs_input — last event is assistant_message)
      makeSession('active-session', 'test-project', [
        {
          type: 'session:start',
          timestamp: '2026-04-07T11:00:00Z',
          data: { sessionId: 'active-session', projectSlug: 'test-project', cwd: workdir },
        },
        {
          type: 'user_message',
          timestamp: '2026-04-07T11:00:01Z',
          data: { text: 'Add a new feature file' },
        },
        {
          type: 'tool_call',
          timestamp: '2026-04-07T11:00:05Z',
          data: { tool: 'create_file', args: { path: 'src/new-feature.ts' } },
        },
        {
          type: 'assistant_message',
          timestamp: '2026-04-07T11:00:10Z',
          data: { text: 'Done, I created the new file.' },
        },
      ])

      // failed-session (exitCode=1 → failed)
      makeSession('failed-session', 'test-project', [
        {
          type: 'session:start',
          timestamp: '2026-04-07T12:00:00Z',
          data: { sessionId: 'failed-session', projectSlug: 'test-project', cwd: workdir },
        },
        {
          type: 'user_message',
          timestamp: '2026-04-07T12:00:01Z',
          data: { text: 'Check the config settings' },
        },
        {
          type: 'session:end',
          timestamp: '2026-04-07T12:00:10Z',
          data: { exitCode: 1 },
        },
      ])

      await use(tempHome)

      try {
        rmSync(tempHome, { recursive: true, force: true })
      } catch {
        // ignore cleanup errors
      }
    },
    { scope: 'worker' },
  ],

  electronApp: [
    async ({ tempHome }, use) => {
      const electronApp = await electron.launch({
        args: ['.'],
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: 'test',
          AMPLIFIER_HOME: tempHome,
        },
      })
      try {
        await use(electronApp)
      } finally {
        await electronApp.close()
      }
    },
    { scope: 'worker' },
  ],

  appWindow: [
    async ({ electronApp }, use) => {
      const appWindow = await electronApp.firstWindow()
      await appWindow.waitForLoadState('domcontentloaded')
      await use(appWindow)
    },
    { scope: 'worker' },
  ],
})

// ---- S9: Status Dot Color Transitions ---------------------------------------

test('S9: done session has emerald status dot (#3ECF8E)', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  const doneDot = appWindow.locator('[data-testid="status-dot"][data-status="done"]').first()
  await expect(doneDot).toBeVisible({ timeout: 5000 })

  const bg = await doneDot.evaluate((el) => getComputedStyle(el).backgroundColor)
  // #3ECF8E = rgb(62, 207, 142)
  expect(bg).toBe('rgb(62, 207, 142)')
})

test('S9: failed session has red status dot (#EF4444)', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  const failedDot = appWindow.locator('[data-testid="status-dot"][data-status="failed"]').first()
  await expect(failedDot).toBeVisible({ timeout: 5000 })

  const bg = await failedDot.evaluate((el) => getComputedStyle(el).backgroundColor)
  // #EF4444 = rgb(239, 68, 68)
  expect(bg).toBe('rgb(239, 68, 68)')
})

test('S9: active session (needs_input) has amber status dot (#F59E0B)', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  const activeDot = appWindow.locator('[data-testid="status-dot"][data-status="needs_input"]').first()
  await expect(activeDot).toBeVisible({ timeout: 5000 })

  const bg = await activeDot.evaluate((el) => getComputedStyle(el).backgroundColor)
  // #F59E0B = rgb(245, 158, 11)
  expect(bg).toBe('rgb(245, 158, 11)')
})

// ---- S10: Sidebar History Section -------------------------------------------

test('S10: HISTORY section divider appears for projects with completed sessions', async ({
  appWindow,
}) => {
  await appWindow.waitForTimeout(2000)

  // test-project has done-session and failed-session → should show HISTORY
  const historyDivider = appWindow.locator('[data-testid="history-divider"]').first()
  await expect(historyDivider).toBeVisible({ timeout: 5000 })
  await expect(historyDivider).toContainText('HISTORY')
})

test('S10: history session shows stats line with prompts and files', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // done-session: promptCount=1, filesChangedCount=2 (write_file + edit_file)
  const stats = appWindow.locator('[data-testid="session-stats"]').first()
  await expect(stats).toBeVisible({ timeout: 5000 })

  const text = await stats.textContent()
  expect(text).toMatch(/prompts/)
  expect(text).toMatch(/files/)
})

test('S10: history session shows title derived from first prompt', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // History sessions should show their title in [data-testid="history-session-name"]
  const historyName = appWindow.locator('[data-testid="history-session-name"]').first()
  await expect(historyName).toBeVisible({ timeout: 5000 })

  const text = await historyName.textContent()
  expect(text).toBeTruthy()
  expect(text!.length).toBeGreaterThan(0)
})

test('S10: multiple history sessions appear in the HISTORY section', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // done-session + failed-session → 2 history-session-name elements
  const historyNames = appWindow.locator('[data-testid="history-session-name"]')
  await expect(historyNames.first()).toBeVisible({ timeout: 5000 })

  const count = await historyNames.count()
  expect(count).toBeGreaterThanOrEqual(2)
})

// ---- S11: New Session Slot --------------------------------------------------

test('S11: + New session slot is visible for projects with sessions', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  const slot = appWindow.locator('[data-testid="new-session-slot"]').first()
  await expect(slot).toBeVisible({ timeout: 5000 })
})

test('S11: + New session slot shows "New session" text', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  const slot = appWindow.locator('[data-testid="new-session-slot"]').first()
  await expect(slot).toBeVisible({ timeout: 5000 })
  await expect(slot).toContainText('New session')
})

test('S11: one new session slot per project', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // test-project has a workDir → one slot
  const slots = appWindow.locator('[data-testid="new-session-slot"]')
  await expect(slots.first()).toBeVisible({ timeout: 5000 })

  const count = await slots.count()
  expect(count).toBeGreaterThanOrEqual(1)
})
