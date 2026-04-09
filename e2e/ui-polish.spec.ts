/**
 * E2E tests for UI polish fixes:
 *   Fix #1 — Terminal padding wrapper
 *   Fix #3 — "+ New session" slot always visible when project is expanded
 *   Fix #4 — Collapse/expand uses SVG chevron (not Unicode)
 *   Fix #5 — Header has logo + 3 icon buttons
 *   Bonus  — Dynamic pane title: "{sessionTitle} · {projectName}"
 *
 * Uses an isolated temp AMPLIFIER_HOME to avoid race conditions with other tests.
 */
import { test as base, _electron as electron, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// ---- Fixtures ---------------------------------------------------------------

type PolishFixtures = {
  electronApp: ElectronApplication
  appWindow: Page
  tempHome: string
}

const test = base.extend<{}, PolishFixtures>({
  tempHome: [
    async ({}, use) => {
      const tempHome = mkdtempSync(join(tmpdir(), 'amplifier-polish-test-'))
      const projectsDir = join(tempHome, 'projects')
      mkdirSync(join(tempHome, 'canvas'), { recursive: true })

      const workdir = tmpdir()

      const makeSession = (sessionId: string, projectSlug: string, events: object[]): void => {
        const dir = join(projectsDir, projectSlug, 'sessions', sessionId)
        mkdirSync(dir, { recursive: true })
        const jsonl = events.map((e) => JSON.stringify(e)).join('\n') + '\n'
        writeFileSync(join(dir, 'events.jsonl'), jsonl, 'utf-8')
      }

      // Project with ONLY an active session (no completed ones)
      // Used to test Fix #3: slot should appear even without completed sessions
      makeSession('only-active-session', 'active-only-project', [
        {
          type: 'session:start',
          timestamp: '2026-04-07T10:00:00Z',
          data: { sessionId: 'only-active-session', projectSlug: 'active-only-project', cwd: workdir },
        },
        {
          type: 'user_message',
          timestamp: '2026-04-07T10:00:01Z',
          data: { text: 'Build the dark mode feature' },
        },
        {
          type: 'assistant_message',
          timestamp: '2026-04-07T10:00:10Z',
          data: { text: 'I am working on it.' },
        },
        // No session:end — so this is needs_input (active), no completed sessions
      ])

      // Project with both active and completed sessions
      // Used to test Bonus: pane title with session selected
      makeSession('done-session', 'mixed-project', [
        {
          type: 'session:start',
          timestamp: '2026-04-07T11:00:00Z',
          data: { sessionId: 'done-session', projectSlug: 'mixed-project', cwd: workdir },
        },
        {
          type: 'user_message',
          timestamp: '2026-04-07T11:00:01Z',
          data: { text: 'Refactor authentication' },
        },
        {
          type: 'session:end',
          timestamp: '2026-04-07T11:00:25Z',
          data: { exitCode: 0 },
        },
      ])

      makeSession('active-session', 'mixed-project', [
        {
          type: 'session:start',
          timestamp: '2026-04-07T12:00:00Z',
          data: { sessionId: 'active-session', projectSlug: 'mixed-project', cwd: workdir },
        },
        {
          type: 'user_message',
          timestamp: '2026-04-07T12:00:01Z',
          data: { text: 'Add login page' },
        },
        {
          type: 'assistant_message',
          timestamp: '2026-04-07T12:00:10Z',
          data: { text: 'Building the login page now.' },
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

// ---- Fix #1: Terminal Padding -----------------------------------------------

test('Fix1: terminal has outer wrapper with padding', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Select a session to enter the terminal zone (hasSession = true)
  const session = appWindow.locator('[data-testid="session-item"]').first()
  await expect(session).toBeVisible({ timeout: 5000 })
  await session.click()
  await appWindow.waitForTimeout(300)

  // The terminal-wrapper should now be visible
  const wrapper = appWindow.locator('[data-testid="terminal-wrapper"]')
  await expect(wrapper).toBeVisible({ timeout: 5000 })

  const paddingLeft = await wrapper.evaluate(
    (el) => parseFloat(getComputedStyle(el).paddingLeft),
  )
  expect(paddingLeft).toBeGreaterThan(0)
})

// ---- Fix #3: "+ New session" slot always visible ----------------------------

test('Fix3: new-session-slot appears for ALL expanded projects, not just ones with completed sessions', async ({
  appWindow,
}) => {
  await appWindow.waitForTimeout(2000)

  // active-only-project has ONLY needs_input sessions (no completed ones)
  // mixed-project has a completed session
  // Before fix: 1 slot total (only mixed-project shows slot, hasCompleted = true)
  // After fix:  2 slots total (both projects show slot)
  const slots = appWindow.locator('[data-testid="new-session-slot"]')
  await expect(slots.first()).toBeVisible({ timeout: 5000 })

  const count = await slots.count()
  // Both active-only-project and mixed-project should show the slot
  expect(count).toBeGreaterThanOrEqual(2)
})

// ---- Fix #4: Collapse/Expand SVG chevron ------------------------------------

test('Fix4: sidebar toggle button contains an SVG element (not bare Unicode)', async ({
  appWindow,
}) => {
  const toggle = appWindow.locator('[data-testid="sidebar-toggle"]').first()
  await expect(toggle).toBeVisible({ timeout: 5000 })

  // Must have an <svg> child — not Unicode characters
  const svgCount = await toggle.locator('svg').count()
  expect(svgCount).toBeGreaterThanOrEqual(1)
})

// ---- Fix #5: Header icon buttons + logo -------------------------------------

test('Fix5: header has a logo SVG element', async ({ appWindow }) => {
  const logo = appWindow.locator('[data-testid="header-logo"]')
  await expect(logo).toBeVisible({ timeout: 5000 })
})

test('Fix5: header has a Layout toggle button', async ({ appWindow }) => {
  const btn = appWindow.locator('[data-testid="header-btn-layout"]')
  await expect(btn).toBeVisible({ timeout: 5000 })
  // Button must contain an SVG
  const svgCount = await btn.locator('svg').count()
  expect(svgCount).toBeGreaterThanOrEqual(1)
})

test('Fix5: header has a Notifications button', async ({ appWindow }) => {
  const btn = appWindow.locator('[data-testid="header-btn-notifications"]')
  await expect(btn).toBeVisible({ timeout: 5000 })
})

test('Fix5: header has a Settings button', async ({ appWindow }) => {
  const btn = appWindow.locator('[data-testid="header-btn-settings"]')
  await expect(btn).toBeVisible({ timeout: 5000 })
})

// ---- Bonus: Dynamic pane title ----------------------------------------------

test('Bonus: pane title shows session·project when a session is selected', async ({
  appWindow,
}) => {
  await appWindow.waitForTimeout(2000)

  // Click the active session in mixed-project to select it
  const projectItems = appWindow.locator('[data-testid="project-item"]')
  const count = await projectItems.count()

  for (let i = 0; i < count; i++) {
    const nameEl = projectItems.nth(i).locator('[data-testid="project-name"]')
    const name = await nameEl.textContent()
    if (name === 'Mixed Project') {
      const selected = await projectItems.nth(i).getAttribute('data-selected')
      if (selected !== 'true') {
        await projectItems.nth(i).click()
        await appWindow.waitForTimeout(200)
      }
      break
    }
  }

  // Click the active session item
  const session = appWindow.locator('[data-testid="session-item"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  await session.click()
  await appWindow.waitForTimeout(300)

  // Pane title should now include "·" separator (session · project format)
  const paneTitle = appWindow.locator('[data-testid="pane-title"]')
  await expect(paneTitle).toBeVisible({ timeout: 3000 })
  const text = await paneTitle.textContent()
  expect(text).toContain('·')
})

test('Bonus: pane title shows "Ctrl+C to return to shell" hint', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Click a session to enter the terminal zone
  const projectItems = appWindow.locator('[data-testid="project-item"]')
  const count = await projectItems.count()

  for (let i = 0; i < count; i++) {
    const nameEl = projectItems.nth(i).locator('[data-testid="project-name"]')
    const name = await nameEl.textContent()
    if (name === 'Mixed Project') {
      const selected = await projectItems.nth(i).getAttribute('data-selected')
      if (selected !== 'true') {
        await projectItems.nth(i).click()
        await appWindow.waitForTimeout(200)
      }
      break
    }
  }

  const session = appWindow.locator('[data-testid="session-item"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  await session.click()
  await appWindow.waitForTimeout(300)

  // Pane title should contain the Ctrl+C hint
  const paneTitle = appWindow.locator('[data-testid="pane-title"]')
  await expect(paneTitle).toBeVisible({ timeout: 3000 })
  const text = await paneTitle.textContent()
  expect(text).toContain('Ctrl+C')
})
