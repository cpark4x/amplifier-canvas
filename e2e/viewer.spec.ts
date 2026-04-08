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

test('V1: Viewer panel shows session info in header', async ({ appWindow }) => {
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

  // Viewer header should show project name and session ID
  const viewerHeader = appWindow.locator('[data-testid="viewer-header"]')
  await expect(viewerHeader).toBeVisible({ timeout: 3000 })

  const headerText = await viewerHeader.textContent()
  expect(headerText).toContain('Team Pulse')
  expect(headerText).toContain('tp-session-')
})

test('V1: Viewer panel shows status dot', async ({ appWindow }) => {
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

  const viewerDot = appWindow.locator('[data-testid="viewer-status-dot"]')
  await expect(viewerDot).toBeVisible({ timeout: 3000 })
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