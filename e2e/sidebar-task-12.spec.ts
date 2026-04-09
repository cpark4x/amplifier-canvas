/**
 * E2E tests for Task 12: Session Resume IPC Handler + Resume Button Wiring
 *
 * Tests:
 *   T12a — History items show a "Resume" button (data-testid="resume-btn")
 *   T12b — window.electronAPI.resumeSession is exposed as a function
 *
 * Uses an ISOLATED temp AMPLIFIER_HOME (not the shared fixtures dir) to avoid
 * database race conditions with other tests when running in parallel.
 */
import { test as base, _electron as electron, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// ---- Fixtures ---------------------------------------------------------------

type ResumeFixtures = {
  electronApp: ElectronApplication
  appWindow: Page
  tempHome: string
}

const test = base.extend<{}, ResumeFixtures>({
  tempHome: [
    async ({}, use) => {
      const tempHome = mkdtempSync(join(tmpdir(), 'amplifier-resume-test-'))
      const projectsDir = join(tempHome, 'projects')
      mkdirSync(join(tempHome, 'canvas'), { recursive: true })

      const workdir = tmpdir()

      const makeSession = (sessionId: string, projectSlug: string, events: object[]): void => {
        const dir = join(projectsDir, projectSlug, 'sessions', sessionId)
        mkdirSync(dir, { recursive: true })
        const jsonl = events.map((e) => JSON.stringify(e)).join('\n') + '\n'
        writeFileSync(join(dir, 'events.jsonl'), jsonl, 'utf-8')
      }

      // done-session (exitCode=0 → done)
      makeSession('done-session', 'resume-project', [
        {
          type: 'session:start',
          timestamp: '2026-04-07T10:00:00Z',
          data: { sessionId: 'done-session', projectSlug: 'resume-project', cwd: workdir },
        },
        {
          type: 'user_message',
          timestamp: '2026-04-07T10:00:01Z',
          data: { text: 'Refactor the auth module' },
        },
        {
          type: 'session:end',
          timestamp: '2026-04-07T10:00:25Z',
          data: { exitCode: 0 },
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

// ---- T12a: Resume button in history rows ------------------------------------

test('T12a: history session rows have a resume button', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  const resumeBtn = appWindow.locator('[data-testid="resume-btn"]').first()
  await expect(resumeBtn).toBeVisible({ timeout: 5000 })
})

test('T12a: resume button shows "Resume →" text', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  const resumeBtn = appWindow.locator('[data-testid="resume-btn"]').first()
  await expect(resumeBtn).toBeVisible({ timeout: 5000 })
  await expect(resumeBtn).toContainText('Resume')
})

// ---- T12b: electronAPI.resumeSession is exposed as a function ---------------

test('T12b: window.electronAPI.resumeSession is a function', async ({ appWindow }) => {
  const hasResumeSession = await appWindow.evaluate(
    () => typeof window.electronAPI?.resumeSession === 'function',
  )
  expect(hasResumeSession).toBe(true)
})
