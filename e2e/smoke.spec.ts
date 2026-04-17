/**
 * SMOKE TEST — the commit gate.
 *
 * Purpose: prove end-to-end that the app is usable.
 * If this fails, the app is broken — do not commit.
 *
 * Target runtime: < 30s on a warm cache.
 * Scope: launch, sidebar renders, session spawns, terminal roundtrip, clean close.
 *
 * This test is the ONLY test that gates commits. Everything else is bonus.
 */
import { test, expect } from './fixtures'

test.describe('SMOKE — end-to-end usability gate', () => {
  test('S1: app launches and window has correct title', async ({ appWindow }) => {
    const title = await appWindow.title()
    expect(title).toBe('Amplifier Canvas')
  })

  test('S2: sidebar renders with fixture projects', async ({ appWindow }) => {
    // Fixture seeds Team Pulse + Ridecast into canvas.db as registered projects.
    // On launch, sidebar should display them.
    const sidebar = appWindow.locator('[data-testid="sidebar"]')
    await expect(sidebar).toBeVisible({ timeout: 5000 })

    // At least one project must be present (fixture guarantees 2).
    const projectItems = appWindow.locator('[data-testid="project-item"]')
    await expect(projectItems.first()).toBeVisible({ timeout: 5000 })
    const count = await projectItems.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('S3: clicking a fixture session shows terminal', async ({ appWindow }) => {
    // Expand the first project so its session rows render.
    const firstProject = appWindow.locator('[data-testid="project-item"]').first()
    await firstProject.click()
    await appWindow.waitForTimeout(500) // Allow expand + UI settle.

    // Click the first session item in sidebar. This should set viewMode='session'
    // and spawn/attach a PTY. Regression test: prior to the fix in onSessionSelect,
    // clicking a project first put the app into viewMode='project', and selecting
    // a session did not clear it — so the terminal stayed hidden behind ProjectView.
    const sessionItem = appWindow.locator('[data-testid="session-item"]').first()
    await expect(sessionItem).toBeVisible({ timeout: 5000 })
    await sessionItem.click()

    // Terminal must now be visible.
    const terminal = appWindow.locator('.xterm')
    await expect(terminal).toBeVisible({ timeout: 5000 })

    const paneTitle = appWindow.locator('[data-testid="pane-title"]')
    await expect(paneTitle).toBeVisible({ timeout: 3000 })
  })

  test('S4: terminal PTY roundtrip — typing echo produces output', async ({ appWindow }) => {
    // Terminal already visible from S3 (worker-scoped fixture, state persists).
    const terminal = appWindow.locator('.xterm')
    await expect(terminal).toBeVisible({ timeout: 3000 })

    // Focus xterm's hidden textarea.
    await terminal.click()
    await appWindow.waitForTimeout(300)

    // Auto-resume typed `amplifier session resume <id>` on PTY boot. In test env
    // amplifier CLI is not installed — command errors out, shell prompt returns.
    // Wait long enough for that to finish before typing our marker.
    await appWindow.waitForTimeout(2000)

    await appWindow.keyboard.type('echo __SMOKE_OK__')
    await appWindow.keyboard.press('Enter')

    await expect(terminal).toContainText('__SMOKE_OK__', { timeout: 5000 })
  })
})
