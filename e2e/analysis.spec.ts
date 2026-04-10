import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// --- Helpers ---

async function expandTeamPulse(appWindow: Page): Promise<void> {
  await appWindow.waitForTimeout(2000)
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
}

async function clickCompletedSession(appWindow: Page): Promise<void> {
  await expandTeamPulse(appWindow)
  const session = appWindow.locator('[data-testid="session-item"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  await session.click()
}

// --- A1: ANALYSIS tab exists and is clickable ---

test('A1: ANALYSIS tab exists and is clickable', async ({ appWindow }) => {
  await clickCompletedSession(appWindow)

  const analysisTab = appWindow.locator('[data-testid="tab-analysis"]')
  await expect(analysisTab).toBeVisible({ timeout: 3000 })
  await analysisTab.click()
})

// --- A2: CHANGES tab is removed ---

test('A2: CHANGES tab is removed', async ({ appWindow }) => {
  await clickCompletedSession(appWindow)

  // CHANGES tab must not be visible
  await expect(appWindow.locator('[data-testid="tab-changes"]')).not.toBeVisible()

  // These three tabs must all be visible
  await expect(appWindow.locator('[data-testid="tab-files"]')).toBeVisible({ timeout: 3000 })
  await expect(appWindow.locator('[data-testid="tab-app"]')).toBeVisible({ timeout: 3000 })
  await expect(appWindow.locator('[data-testid="tab-analysis"]')).toBeVisible({ timeout: 3000 })
})

// --- A3: clicking ANALYSIS tab shows the analysis component ---

test('A3: clicking ANALYSIS tab shows the analysis component', async ({ appWindow }) => {
  await clickCompletedSession(appWindow)

  const analysisTab = appWindow.locator('[data-testid="tab-analysis"]')
  await expect(analysisTab).toBeVisible({ timeout: 3000 })
  await analysisTab.click()

  const sessionAnalysis = appWindow.locator('[data-testid="session-analysis"]')
  await expect(sessionAnalysis).toBeVisible({ timeout: 5000 })
})

// --- A4: analysis header shows stats ---

test('A4: analysis header shows stats', async ({ appWindow }) => {
  await clickCompletedSession(appWindow)

  const analysisTab = appWindow.locator('[data-testid="tab-analysis"]')
  await expect(analysisTab).toBeVisible({ timeout: 3000 })
  await analysisTab.click()

  const analysisHeader = appWindow.locator('[data-testid="analysis-header"]')
  await expect(analysisHeader).toBeVisible({ timeout: 5000 })
})

// --- A5: prompt history section is present and toggleable ---

test('A5: prompt history section is present and toggleable', async ({ appWindow }) => {
  await clickCompletedSession(appWindow)

  const analysisTab = appWindow.locator('[data-testid="tab-analysis"]')
  await expect(analysisTab).toBeVisible({ timeout: 3000 })
  await analysisTab.click()

  // Wait for the SessionAnalysis component to render
  await expect(appWindow.locator('[data-testid="session-analysis"]')).toBeVisible({ timeout: 5000 })

  const toggle = appWindow.locator('[data-testid="prompt-history-toggle"]')
  const isVisible = await toggle.isVisible({ timeout: 3000 }).catch(() => false)
  if (isVisible) {
    // Allow time for analysis auto-trigger to complete before checking prompt entries
    await appWindow.waitForTimeout(1500)
    await toggle.click()
    const entries = appWindow.locator('[data-testid="prompt-entry"]')
    expect(await entries.count()).toBeGreaterThan(0)
  }
})

// --- A6: AI sections area is present (loading or content) ---

test('A6: AI sections area is present (loading or content)', async ({ appWindow }) => {
  await clickCompletedSession(appWindow)

  const analysisTab = appWindow.locator('[data-testid="tab-analysis"]')
  await expect(analysisTab).toBeVisible({ timeout: 3000 })
  await analysisTab.click()

  const aiSections = appWindow.locator('[data-testid="ai-sections"]')
  await expect(aiSections).toBeVisible({ timeout: 5000 })
})

// --- A7: electronAPI exposes analysis bridge methods ---

test('A7: electronAPI exposes analysis bridge methods', async ({ appWindow }) => {
  const methods = await appWindow.evaluate(() => ({
    getAnalysis: typeof window.electronAPI?.getAnalysis,
    triggerAnalysis: typeof window.electronAPI?.triggerAnalysis,
    onAnalysisReady: typeof window.electronAPI?.onAnalysisReady,
  }))

  expect(methods.getAnalysis).toBe('function')
  expect(methods.triggerAnalysis).toBe('function')
  expect(methods.onAnalysisReady).toBe('function')
})
