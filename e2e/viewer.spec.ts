import { test, expect } from './fixtures'

// --- V1: Viewer Shell ---

test('V1: selecting a session shows the Viewer panel', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Viewer should NOT be visible initially
  const viewer = appWindow.locator('[data-testid="viewer-panel"]')
  await expect(viewer).not.toBeVisible()

  // Expand Team Pulse project
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

  // Click a session
  const session = appWindow.locator('[data-testid="session-item"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  await session.click()

  // Viewer panel should now be visible
  await expect(viewer).toBeVisible({ timeout: 3000 })
})

test('V1: Viewer panel shows primary tabs when session selected', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)
  const projectItems = appWindow.locator('[data-testid="project-item"]')
  const count = await projectItems.count()
  for (let i = 0; i < count; i++) {
    const name = await projectItems.nth(i).locator('[data-testid="project-name"]').textContent()
    if (name === 'Team Pulse') {
      const selected = await projectItems.nth(i).getAttribute('data-selected')
      if (selected !== 'true') { await projectItems.nth(i).click(); await appWindow.waitForTimeout(300) }
      break
    }
  }
  const session = appWindow.locator('[data-testid="session-item"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  await session.click()
  const primaryTabs = appWindow.locator('[data-testid="primary-tabs"]')
  await expect(primaryTabs).toBeVisible({ timeout: 3000 })
  const filesTab = appWindow.locator('[data-testid="tab-files"]')
  await expect(filesTab).toBeVisible({ timeout: 3000 })
  const filesColor = await filesTab.evaluate((el) => getComputedStyle(el).color)
  expect(filesColor).not.toBe(await appWindow.locator('[data-testid="tab-app"]').evaluate((el) => getComputedStyle(el).color))
})

test('V1: Viewer panel has four primary tabs', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)
  const projectItems = appWindow.locator('[data-testid="project-item"]')
  const count = await projectItems.count()
  for (let i = 0; i < count; i++) {
    const name = await projectItems.nth(i).locator('[data-testid="project-name"]').textContent()
    if (name === 'Team Pulse') {
      const selected = await projectItems.nth(i).getAttribute('data-selected')
      if (selected !== 'true') { await projectItems.nth(i).click(); await appWindow.waitForTimeout(300) }
      break
    }
  }
  const session = appWindow.locator('[data-testid="session-item"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  await session.click()
  await expect(appWindow.locator('[data-testid="tab-files"]')).toBeVisible({ timeout: 3000 })
  await expect(appWindow.locator('[data-testid="tab-app"]')).toBeVisible({ timeout: 3000 })
  await expect(appWindow.locator('[data-testid="tab-analysis"]')).toBeVisible({ timeout: 3000 })
  await expect(appWindow.locator('[data-testid="tab-changes"]')).toBeVisible({ timeout: 3000 })
})

test('V1: terminal remains visible when Viewer opens', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Expand Team Pulse and click first session
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

  const session = appWindow.locator('[data-testid="session-item"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  await session.click()

  // Both terminal and viewer should be visible
  const terminal = appWindow.locator('.xterm')
  const viewer = appWindow.locator('[data-testid="viewer-panel"]')
  await expect(terminal).toBeVisible({ timeout: 3000 })
  await expect(viewer).toBeVisible({ timeout: 3000 })

  // Terminal should still have width > 0
  const termBox = await terminal.boundingBox()
  expect(termBox).toBeTruthy()
  expect(termBox!.width).toBeGreaterThan(100)
})

test('V1: close button dismisses the Viewer panel', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Expand Team Pulse and click first session
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

  const session = appWindow.locator('[data-testid="session-item"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  await session.click()

  const viewer = appWindow.locator('[data-testid="viewer-panel"]')
  await expect(viewer).toBeVisible({ timeout: 3000 })

  // Click the close button
  const closeBtn = appWindow.locator('[data-testid="viewer-close"]')
  await expect(closeBtn).toBeVisible({ timeout: 3000 })
  await closeBtn.click()

  // Viewer should disappear
  await expect(viewer).not.toBeVisible({ timeout: 3000 })
})

// --- W1: Width Animation (progressive disclosure) ---

test('W1: after closing, viewer panel is still in the DOM with width 0', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Expand Team Pulse and open a session
  const projectItems = appWindow.locator('[data-testid="project-item"]')
  const count = await projectItems.count()
  for (let i = 0; i < count; i++) {
    const name = await projectItems.nth(i).locator('[data-testid="project-name"]').textContent()
    if (name === 'Team Pulse') {
      const selected = await projectItems.nth(i).getAttribute('data-selected')
      if (selected !== 'true') { await projectItems.nth(i).click(); await appWindow.waitForTimeout(300) }
      break
    }
  }

  const session = appWindow.locator('[data-testid="session-item"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  await session.click()

  const viewer = appWindow.locator('[data-testid="viewer-panel"]')
  await expect(viewer).toBeVisible({ timeout: 3000 })

  // Close the viewer
  const closeBtn = appWindow.locator('[data-testid="viewer-close"]')
  await expect(closeBtn).toBeVisible({ timeout: 3000 })
  await closeBtn.click()

  // Viewer should NOT be visually visible (width collapsed to 0)
  await expect(viewer).not.toBeVisible({ timeout: 3000 })

  // BUT it must still be in the DOM (not unmounted)
  const viewerCount = await viewer.count()
  expect(viewerCount).toBe(1)

  // AND its rendered width must be 0 (not 340)
  const viewerWidth = await viewer.evaluate((el) => el.getBoundingClientRect().width)
  expect(viewerWidth).toBe(0)
})

test('W1: viewer panel has CSS transition on width property', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Expand Team Pulse and open a session
  const projectItems = appWindow.locator('[data-testid="project-item"]')
  const count = await projectItems.count()
  for (let i = 0; i < count; i++) {
    const name = await projectItems.nth(i).locator('[data-testid="project-name"]').textContent()
    if (name === 'Team Pulse') {
      const selected = await projectItems.nth(i).getAttribute('data-selected')
      if (selected !== 'true') { await projectItems.nth(i).click(); await appWindow.waitForTimeout(300) }
      break
    }
  }

  const session = appWindow.locator('[data-testid="session-item"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  await session.click()

  const viewer = appWindow.locator('[data-testid="viewer-panel"]')
  await expect(viewer).toBeVisible({ timeout: 3000 })

  // The viewer root div must have a CSS transition on the width property
  const transition = await viewer.evaluate((el) => getComputedStyle(el).transition)
  expect(transition).toContain('width')
})

// --- V2: FileBrowser ---

test('V2: session with workDir shows file browser', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Expand Team Pulse and click first session (has workDir)
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

  const session = appWindow.locator('[data-testid="session-item"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  await session.click()

  // File browser should be visible
  const fileBrowser = appWindow.locator('[data-testid="file-browser"]')
  await expect(fileBrowser).toBeVisible({ timeout: 5000 })
})

test('V2: file browser lists files from workDir', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Expand Team Pulse and click first session
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

  const session = appWindow.locator('[data-testid="session-item"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  await session.click()

  // Wait for file entries to appear
  const fileEntries = appWindow.locator('[data-testid="file-entry"]')
  await expect(fileEntries.first()).toBeVisible({ timeout: 5000 })

  // Should see README.md, src/, assets/
  const entryTexts = await fileEntries.allTextContents()
  const allText = entryTexts.join(' ')
  expect(allText).toContain('README.md')
  expect(allText).toContain('src')
})

test('V2: clicking a folder navigates into it', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Expand Team Pulse and click first session
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

  const session = appWindow.locator('[data-testid="session-item"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  await session.click()

  // Wait for file entries
  const fileEntries = appWindow.locator('[data-testid="file-entry"]')
  await expect(fileEntries.first()).toBeVisible({ timeout: 5000 })

  // Click the src folder
  const srcFolder = appWindow.locator('[data-testid="file-entry"][data-is-directory="true"]', { hasText: 'src' })
  await expect(srcFolder).toBeVisible({ timeout: 3000 })
  await srcFolder.click()

  // Wait for navigation — should now show files inside src/
  await appWindow.waitForTimeout(500)
  const newEntries = appWindow.locator('[data-testid="file-entry"]')
  await expect(newEntries.first()).toBeVisible({ timeout: 5000 })

  const newTexts = await newEntries.allTextContents()
  const allText = newTexts.join(' ')
  expect(allText).toContain('app.ts')

  // Breadcrumb should show we're in src/
  const breadcrumb = appWindow.locator('[data-testid="file-breadcrumb"]')
  const breadcrumbText = await breadcrumb.textContent()
  expect(breadcrumbText).toContain('src')
})

test('V2: back button navigates up one level', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Close any existing viewer to reset state (tests share window)
  const viewer = appWindow.locator('[data-testid="viewer-panel"]')
  if (await viewer.isVisible()) {
    const closeBtn = appWindow.locator('[data-testid="viewer-close"]')
    await closeBtn.click()
    await appWindow.waitForTimeout(300)
  }

  // Expand Team Pulse and click first session
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

  const session = appWindow.locator('[data-testid="session-item"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  await session.click()

  // Wait for file entries (should be at root since viewer was reset)
  const fileEntries = appWindow.locator('[data-testid="file-entry"]')
  await expect(fileEntries.first()).toBeVisible({ timeout: 5000 })

  // Navigate into src/
  const srcFolder = appWindow.locator('[data-testid="file-entry"][data-is-directory="true"]', { hasText: 'src' })
  await expect(srcFolder).toBeVisible({ timeout: 5000 })
  await srcFolder.click()

  // Verify we see src contents (wait for new entries to load)
  await appWindow.waitForTimeout(500)
  const srcEntries = appWindow.locator('[data-testid="file-entry"]')
  await expect(srcEntries.first()).toBeVisible({ timeout: 5000 })
  const srcTexts = await srcEntries.allTextContents()
  expect(srcTexts.join(' ')).toContain('app.ts')

  // Back button should be visible (not at root)
  const backButton = appWindow.locator('[data-testid="file-browser-back"]')
  await expect(backButton).toBeVisible({ timeout: 3000 })
  await backButton.click()

  // Wait for navigation back to root
  await appWindow.waitForTimeout(500)
  const rootEntries = appWindow.locator('[data-testid="file-entry"]')
  await expect(rootEntries.first()).toBeVisible({ timeout: 5000 })

  // Should be back at root — see README.md and src/
  const rootTexts = await rootEntries.allTextContents()
  const allText = rootTexts.join(' ')
  expect(allText).toContain('README.md')
  expect(allText).toContain('src')
})

// --- V3: FileRenderer + MarkdownRenderer ---

test('V3: clicking a markdown file renders it', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Expand Team Pulse and click first session
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

  const session = appWindow.locator('[data-testid="session-item"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  await session.click()

  // Wait for file browser to load
  const fileEntries = appWindow.locator('[data-testid="file-entry"]')
  await expect(fileEntries.first()).toBeVisible({ timeout: 5000 })

  // Click README.md
  const readmeEntry = appWindow.locator('[data-testid="file-entry"]', { hasText: 'README.md' })
  await expect(readmeEntry).toBeVisible({ timeout: 3000 })
  await readmeEntry.click()

  // File renderer should appear with markdown content
  const fileRenderer = appWindow.locator('[data-testid="file-renderer"]')
  await expect(fileRenderer).toBeVisible({ timeout: 5000 })

  // Should contain rendered markdown (headings become h1, h2, etc.)
  const heading = fileRenderer.locator('h1')
  await expect(heading).toBeVisible({ timeout: 5000 })
  const headingText = await heading.textContent()
  expect(headingText).toContain('Team Pulse')
})

// --- V4: CodeRenderer ---

test('V4: clicking a TypeScript file shows syntax-highlighted code', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Close any existing viewer to reset state (tests share window)
  const viewer = appWindow.locator('[data-testid="viewer-panel"]')
  if (await viewer.isVisible()) {
    const closeBtn = appWindow.locator('[data-testid="viewer-close"]')
    await closeBtn.click()
    await appWindow.waitForTimeout(300)
  }

  // Expand Team Pulse and click first session
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

  const session = appWindow.locator('[data-testid="session-item"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  await session.click()

  // Wait for file browser
  const fileEntries = appWindow.locator('[data-testid="file-entry"]')
  await expect(fileEntries.first()).toBeVisible({ timeout: 5000 })

  // Navigate to src/
  const srcFolder = appWindow.locator('[data-testid="file-entry"][data-is-directory="true"]', { hasText: 'src' })
  await expect(srcFolder).toBeVisible({ timeout: 3000 })
  await srcFolder.click()
  await appWindow.waitForTimeout(500)

  // Click app.ts
  const appTsEntry = appWindow.locator('[data-testid="file-entry"]', { hasText: 'app.ts' })
  await expect(appTsEntry).toBeVisible({ timeout: 5000 })
  await appTsEntry.click()

  // File renderer should show code
  const fileRenderer = appWindow.locator('[data-testid="file-renderer"]')
  await expect(fileRenderer).toBeVisible({ timeout: 5000 })

  // Should contain highlight.js markup (hljs class)
  const codeBlock = fileRenderer.locator('[data-testid="code-renderer"]')
  await expect(codeBlock).toBeVisible({ timeout: 5000 })

  // The code should contain TypeScript content
  const codeText = await codeBlock.textContent()
  expect(codeText).toContain('createServer')
})

test('V4b: code renderer uses dark theme background (#0F0E0C)', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Close any existing viewer to reset state (tests share window)
  const viewer = appWindow.locator('[data-testid="viewer-panel"]')
  if (await viewer.isVisible()) {
    const closeBtn = appWindow.locator('[data-testid="viewer-close"]')
    await closeBtn.click()
    await appWindow.waitForTimeout(300)
  }

  // Expand Team Pulse and click first session
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

  const session = appWindow.locator('[data-testid="session-item"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  await session.click()

  // Wait for file browser
  const fileEntries = appWindow.locator('[data-testid="file-entry"]')
  await expect(fileEntries.first()).toBeVisible({ timeout: 5000 })

  // Navigate to src/
  const srcFolder = appWindow.locator('[data-testid="file-entry"][data-is-directory="true"]', { hasText: 'src' })
  await expect(srcFolder).toBeVisible({ timeout: 3000 })
  await srcFolder.click()
  await appWindow.waitForTimeout(500)

  // Click app.ts
  const appTsEntry = appWindow.locator('[data-testid="file-entry"]', { hasText: 'app.ts' })
  await expect(appTsEntry).toBeVisible({ timeout: 5000 })
  await appTsEntry.click()

  const codeBlock = appWindow.locator('[data-testid="code-renderer"]')
  await expect(codeBlock).toBeVisible({ timeout: 5000 })

  // The inner flex container must use the warm near-black dark background
  const bg = await codeBlock.evaluate((el) => {
    const inner = el.querySelector('div')
    return inner ? getComputedStyle(inner).backgroundColor : ''
  })
  // #0F0E0C = rgb(15, 14, 12)
  expect(bg).toBe('rgb(15, 14, 12)')
})

// --- V5: canvas:// Protocol + ImageRenderer ---

test('V5: clicking an image file shows the image renderer', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Close any existing viewer to reset state (tests share window)
  const viewer = appWindow.locator('[data-testid="viewer-panel"]')
  if (await viewer.isVisible()) {
    const closeBtn = appWindow.locator('[data-testid="viewer-close"]')
    await closeBtn.click()
    await appWindow.waitForTimeout(300)
  }

  // Expand Team Pulse and click first session
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

  const session = appWindow.locator('[data-testid="session-item"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  await session.click()

  // Wait for file browser
  const fileEntries = appWindow.locator('[data-testid="file-entry"]')
  await expect(fileEntries.first()).toBeVisible({ timeout: 5000 })

  // Navigate to assets/
  const assetsFolder = appWindow.locator('[data-testid="file-entry"][data-is-directory="true"]', { hasText: 'assets' })
  await expect(assetsFolder).toBeVisible({ timeout: 3000 })
  await assetsFolder.click()
  await appWindow.waitForTimeout(500)

  // Click logo.png
  const logoEntry = appWindow.locator('[data-testid="file-entry"]', { hasText: 'logo.png' })
  await expect(logoEntry).toBeVisible({ timeout: 5000 })
  await logoEntry.click()

  // Image renderer should appear
  const imageRenderer = appWindow.locator('[data-testid="image-renderer"]')
  await expect(imageRenderer).toBeVisible({ timeout: 5000 })

  // Should have an img element with canvas:// src
  const img = imageRenderer.locator('img')
  await expect(img).toBeVisible({ timeout: 5000 })
  const src = await img.getAttribute('src')
  expect(src).toMatch(/^canvas:\/\//)
})

// --- I1: Recent Files Quick Access ---

test('I1: session with recent files shows recent-files section', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Expand Team Pulse
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

  // Click tp-session-001 specifically (it has tool_call events with file activity)
  const sessions = appWindow.locator('[data-testid="session-item"]')
  await expect(sessions.first()).toBeVisible({ timeout: 3000 })

  const sessionCount = await sessions.count()
  for (let i = 0; i < sessionCount; i++) {
    const sessionName = await sessions.nth(i).locator('[data-testid="session-name"]').textContent()
    if (sessionName?.includes('tp-session-001')) {
      await sessions.nth(i).click()
      break
    }
  }

  // Recent files section should appear
  const recentFiles = appWindow.locator('[data-testid="recent-files"]')
  await expect(recentFiles).toBeVisible({ timeout: 3000 })

  // Should have recent file items
  const recentItems = appWindow.locator('[data-testid="recent-file-item"]')
  await expect(recentItems.first()).toBeVisible({ timeout: 3000 })

  // Items should show file names from tp-session-001's events (src/app.ts, src/utils.ts)
  const itemTexts = await recentItems.allTextContents()
  const allText = itemTexts.join(' ')
  expect(allText).toContain('app.ts')
})

test('I1: clicking a recent file link opens it in FileRenderer', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Expand Team Pulse and click tp-session-001
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

  const sessions = appWindow.locator('[data-testid="session-item"]')
  await expect(sessions.first()).toBeVisible({ timeout: 3000 })

  const sessionCount = await sessions.count()
  for (let i = 0; i < sessionCount; i++) {
    const sessionName = await sessions.nth(i).locator('[data-testid="session-name"]').textContent()
    if (sessionName?.includes('tp-session-001')) {
      await sessions.nth(i).click()
      break
    }
  }

  // Click the first recent file item
  const recentItems = appWindow.locator('[data-testid="recent-file-item"]')
  await expect(recentItems.first()).toBeVisible({ timeout: 3000 })
  await recentItems.first().click()

  // File renderer should appear (skipping file browser navigation)
  const fileRenderer = appWindow.locator('[data-testid="file-renderer"]')
  await expect(fileRenderer).toBeVisible({ timeout: 5000 })
})

test('I1: recent file items show operation badges', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Expand Team Pulse and click tp-session-001
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

  const sessions = appWindow.locator('[data-testid="session-item"]')
  await expect(sessions.first()).toBeVisible({ timeout: 3000 })

  const sessionCount = await sessions.count()
  for (let i = 0; i < sessionCount; i++) {
    const sessionName = await sessions.nth(i).locator('[data-testid="session-name"]').textContent()
    if (sessionName?.includes('tp-session-001')) {
      await sessions.nth(i).click()
      break
    }
  }

  // Recent file items should have operation badges
  const badges = appWindow.locator('[data-testid="operation-badge"]')
  await expect(badges.first()).toBeVisible({ timeout: 3000 })
  const badgeCount = await badges.count()
  expect(badgeCount).toBeGreaterThanOrEqual(1)

  // Each badge should have a non-transparent background color
  const firstBadgeBg = await badges.first().evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(firstBadgeBg).not.toBe('rgba(0, 0, 0, 0)')
})

// --- I2: Terminal Persistence ---

test('I2: terminal persists when Viewer opens and closes', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Type something in the terminal first
  const terminal = appWindow.locator('.xterm')
  await terminal.click()
  await appWindow.keyboard.type('echo __VIEWER_PERSIST_TEST__')
  await appWindow.keyboard.press('Enter')
  await expect(terminal).toContainText('__VIEWER_PERSIST_TEST__', { timeout: 5000 })

  // Now select a session to open the Viewer
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

  const session = appWindow.locator('[data-testid="session-item"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  await session.click()

  // Viewer should be visible
  const viewer = appWindow.locator('[data-testid="viewer-panel"]')
  await expect(viewer).toBeVisible({ timeout: 3000 })

  // Terminal should STILL contain the previous output
  await expect(terminal).toContainText('__VIEWER_PERSIST_TEST__', { timeout: 3000 })

  // Terminal should still be visible (not unmounted)
  await expect(terminal).toBeVisible()
  const termBox = await terminal.boundingBox()
  expect(termBox).toBeTruthy()
  expect(termBox!.width).toBeGreaterThan(50)

  // Now close the Viewer
  const closeBtn = appWindow.locator('[data-testid="viewer-close"]')
  await closeBtn.click()

  // Viewer should be gone
  await expect(viewer).not.toBeVisible({ timeout: 3000 })

  // Terminal should STILL contain the previous output after Viewer closes
  await expect(terminal).toContainText('__VIEWER_PERSIST_TEST__', { timeout: 3000 })
  await expect(terminal).toBeVisible()
})

// --- V4: Design System Polish ---

test('V4: viewer panel width is 340px', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Open a session
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

  const session = appWindow.locator('[data-testid="session-item"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  await session.click()

  const viewer = appWindow.locator('[data-testid="viewer-panel"]')
  await expect(viewer).toBeVisible({ timeout: 3000 })

  const box = await viewer.boundingBox()
  expect(box).toBeTruthy()
  expect(box!.width).toBeGreaterThanOrEqual(335)
  expect(box!.width).toBeLessThanOrEqual(345)
})

test('V4: close button has aria-label', async ({ appWindow }) => {
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

  const session = appWindow.locator('[data-testid="session-item"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  await session.click()

  const closeBtn = appWindow.locator('[data-testid="viewer-close"]')
  await expect(closeBtn).toBeVisible({ timeout: 3000 })
  const ariaLabel = await closeBtn.getAttribute('aria-label')
  expect(ariaLabel).toBe('Close viewer')
})

test('V4: primary tabs use 12px font-size and are not uppercase', async ({ appWindow }) => {
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

  const session = appWindow.locator('[data-testid="session-item"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  await session.click()

  const filesTab = appWindow.locator('[data-testid="tab-files"]')
  await expect(filesTab).toBeVisible({ timeout: 3000 })

  const fontSize = await filesTab.evaluate((el) => getComputedStyle(el).fontSize)
  expect(fontSize).toBe('12px')

  const textTransform = await filesTab.evaluate((el) => getComputedStyle(el).textTransform)
  expect(textTransform).toBe('none')
})

test('V4: file entry rows have 28px height and 13px font', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Close any existing viewer
  const viewer = appWindow.locator('[data-testid="viewer-panel"]')
  if (await viewer.isVisible()) {
    const closeBtn = appWindow.locator('[data-testid="viewer-close"]')
    await closeBtn.click()
    await appWindow.waitForTimeout(300)
  }

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

  const session = appWindow.locator('[data-testid="session-item"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  await session.click()

  const fileEntries = appWindow.locator('[data-testid="file-entry"]')
  await expect(fileEntries.first()).toBeVisible({ timeout: 5000 })

  const entryBox = await fileEntries.first().boundingBox()
  expect(entryBox).toBeTruthy()
  expect(entryBox!.height).toBeGreaterThanOrEqual(27)
  expect(entryBox!.height).toBeLessThanOrEqual(30)

  const fontSize = await fileEntries.first().evaluate((el) => getComputedStyle(el).fontSize)
  expect(fontSize).toBe('13px')
})

test('V4: file entries use text icons instead of emoji', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Close any existing viewer
  const viewer = appWindow.locator('[data-testid="viewer-panel"]')
  if (await viewer.isVisible()) {
    const closeBtn = appWindow.locator('[data-testid="viewer-close"]')
    await closeBtn.click()
    await appWindow.waitForTimeout(300)
  }

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

  const session = appWindow.locator('[data-testid="session-item"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  await session.click()

  const fileEntries = appWindow.locator('[data-testid="file-entry"]')
  await expect(fileEntries.first()).toBeVisible({ timeout: 5000 })

  // Directory entry should use ▸ (U+25B8) not 📁 emoji
  const dirEntry = appWindow.locator('[data-testid="file-entry"][data-is-directory="true"]').first()
  await expect(dirEntry).toBeVisible({ timeout: 3000 })
  const dirText = await dirEntry.textContent()
  expect(dirText).toContain('\u25B8')
  expect(dirText).not.toContain('\uD83D\uDCC1')

  // File entry should use ≡ (U+2261) not 📄 emoji
  const fileEntry = appWindow.locator('[data-testid="file-entry"][data-is-directory="false"]').first()
  await expect(fileEntry).toBeVisible({ timeout: 3000 })
  const fileText = await fileEntry.textContent()
  expect(fileText).toContain('\u2261')
  expect(fileText).not.toContain('\uD83D\uDCC4')
})

// --- V6: MarkdownRenderer + ImageRenderer Design System ---

test('V6a: markdown renderer wrapper uses design-system text color (--text-primary)', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Close any existing viewer to reset state
  const viewer = appWindow.locator('[data-testid="viewer-panel"]')
  if (await viewer.isVisible()) {
    const closeBtn = appWindow.locator('[data-testid="viewer-close"]')
    await closeBtn.click()
    await appWindow.waitForTimeout(300)
  }

  // Expand Team Pulse and click first session
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

  const session = appWindow.locator('[data-testid="session-item"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  await session.click()

  // Click README.md
  const fileEntries = appWindow.locator('[data-testid="file-entry"]')
  await expect(fileEntries.first()).toBeVisible({ timeout: 5000 })
  const readmeEntry = appWindow.locator('[data-testid="file-entry"]', { hasText: 'README.md' })
  await expect(readmeEntry).toBeVisible({ timeout: 3000 })
  await readmeEntry.click()

  // Markdown renderer should appear
  const mdRenderer = appWindow.locator('[data-testid="markdown-renderer"]')
  await expect(mdRenderer).toBeVisible({ timeout: 5000 })

  // Text color should be --text-primary (#1C1A16 = rgb(28, 26, 22))
  const color = await mdRenderer.evaluate((el) => getComputedStyle(el).color)
  expect(color).toBe('rgb(28, 26, 22)')
})

test('V6a: markdown h1 is 18px and fenced code blocks use dark background', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Close any existing viewer
  const viewer = appWindow.locator('[data-testid="viewer-panel"]')
  if (await viewer.isVisible()) {
    const closeBtn = appWindow.locator('[data-testid="viewer-close"]')
    await closeBtn.click()
    await appWindow.waitForTimeout(300)
  }

  // Expand Team Pulse and click first session
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

  const session = appWindow.locator('[data-testid="session-item"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  await session.click()

  // Click README.md
  const fileEntries = appWindow.locator('[data-testid="file-entry"]')
  await expect(fileEntries.first()).toBeVisible({ timeout: 5000 })
  const readmeEntry = appWindow.locator('[data-testid="file-entry"]', { hasText: 'README.md' })
  await expect(readmeEntry).toBeVisible({ timeout: 3000 })
  await readmeEntry.click()

  const mdRenderer = appWindow.locator('[data-testid="markdown-renderer"]')
  await expect(mdRenderer).toBeVisible({ timeout: 5000 })

  // h1 should be 18px (was 20px)
  const h1 = mdRenderer.locator('h1').first()
  await expect(h1).toBeVisible({ timeout: 5000 })
  const h1FontSize = await h1.evaluate((el) => getComputedStyle(el).fontSize)
  expect(h1FontSize).toBe('18px')

  // pre blocks should have dark background (#0F0E0C = rgb(15, 14, 12))
  const pre = mdRenderer.locator('pre').first()
  await expect(pre).toBeVisible({ timeout: 5000 })
  const preBg = await pre.evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(preBg).toBe('rgb(15, 14, 12)')
})

test('V6b: image renderer img uses 60vh max height', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Close any existing viewer
  const viewer = appWindow.locator('[data-testid="viewer-panel"]')
  if (await viewer.isVisible()) {
    const closeBtn = appWindow.locator('[data-testid="viewer-close"]')
    await closeBtn.click()
    await appWindow.waitForTimeout(300)
  }

  // Expand Team Pulse and click first session
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

  const session = appWindow.locator('[data-testid="session-item"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  await session.click()

  // Navigate to assets/
  const fileEntries = appWindow.locator('[data-testid="file-entry"]')
  await expect(fileEntries.first()).toBeVisible({ timeout: 5000 })
  const assetsFolder = appWindow.locator('[data-testid="file-entry"][data-is-directory="true"]', { hasText: 'assets' })
  await expect(assetsFolder).toBeVisible({ timeout: 3000 })
  await assetsFolder.click()
  await appWindow.waitForTimeout(500)

  // Click logo.png
  const logoEntry = appWindow.locator('[data-testid="file-entry"]', { hasText: 'logo.png' })
  await expect(logoEntry).toBeVisible({ timeout: 5000 })
  await logoEntry.click()

  // Image renderer should appear
  const imageRenderer = appWindow.locator('[data-testid="image-renderer"]')
  await expect(imageRenderer).toBeVisible({ timeout: 5000 })

  // img maxHeight should be 60vh (was 80vh)
  const img = imageRenderer.locator('img')
  await expect(img).toBeVisible({ timeout: 5000 })
  const maxHeight = await img.evaluate((el) => (el as HTMLImageElement).style.maxHeight)
  expect(maxHeight).toBe('60vh')
})