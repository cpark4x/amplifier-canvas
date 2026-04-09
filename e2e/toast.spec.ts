import { test as base, _electron as electron, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// --- Isolated test fixture with fresh temp AMPLIFIER_HOME per worker ---

type ToastFixtures = {
  electronApp: ElectronApplication
  appWindow: Page
  tempHome: string
}

const test = base.extend<{}, ToastFixtures>({
  tempHome: [
    async ({}, use) => {
      const tempHome = mkdtempSync(join(tmpdir(), 'amplifier-toast-test-'))

      const projectsDir = join(tempHome, 'projects')
      const sessionDir = join(projectsDir, 'toast-project', 'sessions', 'toast-session-001')

      // Pre-create session directories for both T1 and T2 tests
      const sessionDir2 = join(projectsDir, 'toast-project', 'sessions', 'toast-session-002')
      mkdirSync(sessionDir, { recursive: true })
      mkdirSync(sessionDir2, { recursive: true })
      mkdirSync(join(tempHome, 'canvas'), { recursive: true })

      // Write ACTIVE events.jsonl for session-001 (used by T1)
      const activeEvents1 = [
        JSON.stringify({
          type: 'session:start',
          timestamp: '2026-01-01T10:00:00Z',
          data: { sessionId: 'toast-session-001', projectSlug: 'toast-project', cwd: '/tmp/workdir' },
        }),
        JSON.stringify({
          type: 'user_message',
          timestamp: '2026-01-01T10:00:01Z',
          data: { text: 'Add toast notifications to the app' },
        }),
      ].join('\n') + '\n'

      writeFileSync(join(sessionDir, 'events.jsonl'), activeEvents1, 'utf-8')

      // Write ACTIVE events.jsonl for session-002 (used by T2)
      const activeEvents2 = [
        JSON.stringify({
          type: 'session:start',
          timestamp: '2026-01-01T11:00:00Z',
          data: { sessionId: 'toast-session-002', projectSlug: 'toast-project', cwd: '/tmp/workdir' },
        }),
        JSON.stringify({
          type: 'user_message',
          timestamp: '2026-01-01T11:00:01Z',
          data: { text: 'Dismiss toast notifications test' },
        }),
      ].join('\n') + '\n'

      writeFileSync(join(sessionDir2, 'events.jsonl'), activeEvents2, 'utf-8')

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

// --- T1: Toast appears when non-selected session transitions active→completed ---

test('T1: toast-container appears when a background session completes', async ({
  appWindow,
  tempHome,
}) => {
  // Wait for startup scan to complete — session should be in 'active' state
  await appWindow.waitForTimeout(2500)

  // Verify the session loaded as active (sanity check)
  const sessionTitlesBefore = await appWindow.evaluate(() => {
    const el = document.querySelector('[data-testid="debug-session-titles"]')
    if (!el || !el.textContent) return null
    try {
      return JSON.parse(el.textContent) as Array<{ id: string; status: string }>
    } catch {
      return null
    }
  })

  expect(sessionTitlesBefore).not.toBeNull()
  const activeBefore = sessionTitlesBefore!.find((s) => s.id === 'toast-session-001')
  expect(activeBefore).toBeDefined()
  // Session with no session:end event should be treated as active/running
  expect(['active', 'running', 'needs_input'].includes(activeBefore!.status)).toBe(true)

  // Overwrite events.jsonl to add session:end (marks completion)
  const sessionDir = join(tempHome, 'projects', 'toast-project', 'sessions', 'toast-session-001')
  const completedEvents = [
    JSON.stringify({
      type: 'session:start',
      timestamp: '2026-01-01T10:00:00Z',
      data: { sessionId: 'toast-session-001', projectSlug: 'toast-project', cwd: '/tmp/workdir' },
    }),
    JSON.stringify({
      type: 'user_message',
      timestamp: '2026-01-01T10:00:01Z',
      data: { text: 'Add toast notifications to the app' },
    }),
    JSON.stringify({
      type: 'session:end',
      timestamp: '2026-01-01T10:00:10Z',
      data: { exitCode: 0 },
    }),
  ].join('\n') + '\n'

  writeFileSync(join(sessionDir, 'events.jsonl'), completedEvents, 'utf-8')

  // Wait for chokidar awaitWriteFinish (200ms) + debounce (500ms) + processing + IPC round-trip
  await appWindow.waitForTimeout(4000)

  // The toast container should now be visible
  const toastContainer = appWindow.locator('[data-testid="toast-container"]')
  await expect(toastContainer).toBeVisible({ timeout: 3000 })

  // There should be at least one toast item
  const toastItem = appWindow.locator('[data-testid="toast-item"]')
  await expect(toastItem.first()).toBeVisible({ timeout: 2000 })

  // The toast should have a "Review" action button
  const actionButton = appWindow.locator('[data-testid="toast-action"]')
  await expect(actionButton.first()).toBeVisible({ timeout: 2000 })
  await expect(actionButton.first()).toHaveText('Review')
})

// --- T2: Toast dismiss button removes the toast ---

test('T2: clicking dismiss button removes the toast', async ({ appWindow, tempHome }) => {
  // Wait for startup scan — session-002 should be active
  await appWindow.waitForTimeout(2500)

  // Trigger completion for session-002 (different from T1 to avoid state conflict)
  const sessionDir2 = join(tempHome, 'projects', 'toast-project', 'sessions', 'toast-session-002')
  const completedEvents = [
    JSON.stringify({
      type: 'session:start',
      timestamp: '2026-01-01T11:00:00Z',
      data: { sessionId: 'toast-session-002', projectSlug: 'toast-project', cwd: '/tmp/workdir' },
    }),
    JSON.stringify({
      type: 'user_message',
      timestamp: '2026-01-01T11:00:01Z',
      data: { text: 'Dismiss toast notifications test' },
    }),
    JSON.stringify({
      type: 'session:end',
      timestamp: '2026-01-01T11:00:10Z',
      data: { exitCode: 0 },
    }),
  ].join('\n') + '\n'

  writeFileSync(join(sessionDir2, 'events.jsonl'), completedEvents, 'utf-8')

  await appWindow.waitForTimeout(4000)

  // Wait for toast to appear
  const toastContainer = appWindow.locator('[data-testid="toast-container"]')
  await expect(toastContainer).toBeVisible({ timeout: 3000 })

  // Click dismiss on the visible dismiss button
  const dismissButton = appWindow.locator('[data-testid="toast-dismiss"]').first()
  await expect(dismissButton).toBeVisible({ timeout: 2000 })
  await dismissButton.click()

  // Toast container should disappear (no more toasts)
  await expect(toastContainer).not.toBeVisible({ timeout: 3000 })
})
