import { test as base, _electron as electron, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// --- Isolated test fixture with fresh temp AMPLIFIER_HOME per worker ---

type WatcherFixtures = {
  electronApp: ElectronApplication
  appWindow: Page
  tempHome: string
}

const test = base.extend<{}, WatcherFixtures>({
  tempHome: [
    async ({}, use) => {
      // Create a temp AMPLIFIER_HOME with the required directory structure
      const tempHome = mkdtempSync(join(tmpdir(), 'amplifier-watcher-test-'))

      const projectsDir = join(tempHome, 'projects')
      const projectDir = join(projectsDir, 'test-project')

      // Pre-create session directories so chokidar can watch them from startup.
      // events.jsonl is NOT created here - it will be created during the test to
      // trigger chokidar 'add' events.
      mkdirSync(join(projectDir, 'sessions', 'ew-session-001'), { recursive: true })
      mkdirSync(join(projectDir, 'sessions', 'ew-session-002'), { recursive: true })

      // Create canvas dir (for DB)
      mkdirSync(join(tempHome, 'canvas'), { recursive: true })

      await use(tempHome)

      // Cleanup: remove the temp dir entirely
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

// --- EW1: Watcher enrichment on session completion (done) ---

test('EW1: watcher-triggered session includes enrichment (title, promptCount, filesChangedCount)', async ({
  appWindow,
  tempHome,
}) => {
  // Wait for startup scan to complete and chokidar to be ready
  await appWindow.waitForTimeout(2000)

  // Write a completed events.jsonl into the pre-created session directory.
  // Chokidar should fire 'add' for the new file.
  const sessionId = 'ew-session-001'
  const sessionDir = join(tempHome, 'projects', 'test-project', 'sessions', sessionId)

  const events = [
    JSON.stringify({
      type: 'session:start',
      timestamp: '2026-01-01T10:00:00Z',
      data: { sessionId, projectSlug: 'test-project', cwd: '/tmp/workdir' },
    }),
    JSON.stringify({
      type: 'user_message',
      timestamp: '2026-01-01T10:00:01Z',
      data: { text: 'Implement the watcher enrichment feature for external sessions' },
    }),
    JSON.stringify({
      type: 'tool_call',
      timestamp: '2026-01-01T10:00:05Z',
      data: { tool: 'write_file', args: { path: 'src/watcher.ts' } },
    }),
    JSON.stringify({
      type: 'session:end',
      timestamp: '2026-01-01T10:00:10Z',
      data: { exitCode: 0 },
    }),
  ].join('\n') + '\n'

  writeFileSync(join(sessionDir, 'events.jsonl'), events, 'utf-8')

  // Wait for chokidar awaitWriteFinish (200ms) + debounce (500ms) + processing + IPC round-trip
  await appWindow.waitForTimeout(4000)

  // Read debug session titles from renderer state
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

  const watcherSession = sessionTitles!.find((s) => s.id === sessionId)
  expect(watcherSession).toBeDefined()

  // Watcher enrichment: status should be 'done' (exitCode=0)
  expect(watcherSession!.status).toBe('done')

  // Watcher enrichment: title should be derived from the first user_message
  expect(watcherSession!.title).toBeDefined()
  expect(watcherSession!.title).toContain('Implement the watcher enrichment')

  // Watcher enrichment: promptCount should be 1 (one user_message)
  expect(watcherSession!.promptCount).toBe(1)

  // Watcher enrichment: filesChangedCount should be 1 (one write_file call)
  expect(watcherSession!.filesChangedCount).toBe(1)
})

// --- EW2: Watcher enrichment on failed session ---

test('EW2: watcher-triggered failed session has title and correct status', async ({
  appWindow,
  tempHome,
}) => {
  // Wait for startup scan + EW1 to settle
  await appWindow.waitForTimeout(2000)

  const sessionId = 'ew-session-002'
  const sessionDir = join(tempHome, 'projects', 'test-project', 'sessions', sessionId)

  const events = [
    JSON.stringify({
      type: 'session:start',
      timestamp: '2026-01-01T11:00:00Z',
      data: { sessionId, projectSlug: 'test-project', cwd: '/tmp/workdir' },
    }),
    JSON.stringify({
      type: 'user_message',
      timestamp: '2026-01-01T11:00:01Z',
      data: { text: 'Check the config settings for the deployment' },
    }),
    JSON.stringify({
      type: 'session:end',
      timestamp: '2026-01-01T11:00:05Z',
      data: { exitCode: 1 },
    }),
  ].join('\n') + '\n'

  writeFileSync(join(sessionDir, 'events.jsonl'), events, 'utf-8')

  // Wait for chokidar to process
  await appWindow.waitForTimeout(4000)

  const sessionTitles = await appWindow.evaluate(() => {
    const el = document.querySelector('[data-testid="debug-session-titles"]')
    if (!el || !el.textContent) return null
    try {
      return JSON.parse(el.textContent) as Array<{
        id: string
        title?: string
        status: string
        promptCount?: number
      }>
    } catch {
      return null
    }
  })

  expect(sessionTitles).not.toBeNull()

  const failedSession = sessionTitles!.find((s) => s.id === sessionId)
  expect(failedSession).toBeDefined()

  // Failed session (exitCode=1) should have status 'failed'
  expect(failedSession!.status).toBe('failed')

  // Title should be derived from user_message
  expect(failedSession!.title).toBeDefined()
  expect(failedSession!.title).toContain('Check the config settings')

  // promptCount should be 1
  expect(failedSession!.promptCount).toBe(1)
})
