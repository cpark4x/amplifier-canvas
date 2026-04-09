# Act 2 Phase 1 — Viewer Wiring Implementation Plan

> **Execution:** Use the subagent-driven-development workflow to implement this plan.

**Goal:** Wire the Act 2 viewer shell so it opens, animates, tracks provenance, and shows recent files — completing Scenes 2.1–2.4 of the STORYBOARD.

**Architecture:** The committed viewer shell (`eb5b9b2`) has tabs, file management, and browse button — but nothing triggers it. This plan wires `openViewer()` from sidebar session clicks and external `__canvasOpenFile` calls, converts the viewer from conditional render to width-animated always-mounted panel, adds provenance labels ("Opened by Amplifier" / "Opened by you"), and builds the recent-files section from session file activity data. Scene 2.5 (App Preview) is deferred to Phase 2.

**Tech Stack:** Electron 36 + React 19 + TypeScript + Zustand + Playwright E2E tests

**CSS Oracle:** `canvas.html` — the self-contained HTML/CSS prototype. All dimension/style values come from there.

---

### Task 1: Fix CSS Dimensions to Match canvas.html

**Files:**
- Modify: `src/renderer/src/components/Viewer.tsx:76-100,147-158,218-222`
- Test: `e2e/viewer.spec.ts` (existing V4 test: "viewer panel width is 340px")

**Step 1: Run existing V4 width test to see it fail**

Run: `npx playwright test e2e/viewer.spec.ts -g "viewer panel width is 340px" --workers=1`

Expected: FAIL — viewer width is 400px, not 340px. (The test currently fails because `openViewer()` isn't wired yet, so the viewer never appears. It will time out waiting for the viewer panel. That's expected — we'll wire it in Task 4.)

**Step 2: Update Viewer panel width from 400 to 340**

In `src/renderer/src/components/Viewer.tsx`, update the root `<div>` style (currently at line 76–87):

```tsx
    <div
      data-testid="viewer-panel"
      style={{
        width: 340,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-right)',
        borderLeft: '1px solid var(--border)',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
```

Changes from current:
- `width: 400` → `width: 340` (canvas.html `.right-panel { width: 340px }`)
- Remove `minWidth: 340` (not needed with flexShrink: 0)
- Add `flexShrink: 0` (prevent flex layout from compressing the viewer)

**Step 3: Update primary tab row height from 32 to 36**

In the primary tab row `<div>` (currently at line 90–100), change:

```tsx
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          height: 36,
          borderBottom: '1px solid var(--border)',
          backgroundColor: 'var(--bg-header)',
          padding: '0 12px',
          gap: 20,
          flexShrink: 0,
        }}
```

Changes from current:
- `height: 32` → `height: 36` (canvas.html `.tab-row-primary { height: 36px }`)
- `alignItems: 'center'` → `alignItems: 'flex-end'` (canvas.html `.tab-row-primary { align-items: flex-end }`)
- `padding: '0 8px'` → `padding: '0 12px'` (canvas.html `.tab-row-primary { padding: 0 12px }`)
- `gap: 0` → `gap: 20` (canvas.html `.tab-row-primary { gap: 20px }`)
- Add `flexShrink: 0`

**Step 4: Update secondary tab row height from 28 to 30**

In the secondary tab row `<div>` (currently at line 147–158), change:

```tsx
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 30,
          borderBottom: '1px solid var(--border)',
          backgroundColor: 'var(--bg-header)',
          padding: '0 8px',
          gap: 2,
          overflowX: 'auto',
          flexShrink: 0,
        }}
```

Changes:
- `height: 28` → `height: 30` (canvas.html `.tab-row-secondary { height: 30px }`)
- Add `flexShrink: 0`

**Step 5: Update panel content padding**

In the panel content `<div>` (currently at line 219–221), change:

```tsx
        style={{ flex: 1, overflow: 'auto', padding: 16 }}
```

Change: `padding: '10px 12px'` → `padding: 16` (canvas.html `.panel-content { padding: 16px }`)

**Step 6: Commit**

```bash
git add src/renderer/src/components/Viewer.tsx && git commit -m "fix(viewer): align CSS dimensions to canvas.html spec (340px, 36/30px tabs, 16px padding)"
```

---

### Task 2: Fix Primary Tab + File Tab Styling

**Files:**
- Modify: `src/renderer/src/components/Viewer.tsx:102-123,160-215`

**Step 1: Write failing test for tab styling**

Add this test to `e2e/viewer.spec.ts` right after the existing `V4: close button has aria-label` test (around line 822):

```typescript
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

  const viewer = appWindow.locator('[data-testid="viewer-panel"]')
  await expect(viewer).toBeVisible({ timeout: 3000 })

  const tab = appWindow.locator('[data-testid="tab-files"]')
  await expect(tab).toBeVisible({ timeout: 3000 })

  const fontSize = await tab.evaluate((el) => getComputedStyle(el).fontSize)
  expect(fontSize).toBe('12px')

  const textTransform = await tab.evaluate((el) => getComputedStyle(el).textTransform)
  expect(textTransform).toBe('none')
})
```

**Step 2: Run test to verify it fails**

Run: `npx playwright test e2e/viewer.spec.ts -g "primary tabs use 12px" --workers=1`

Expected: FAIL (viewer not visible because openViewer() isn't wired — will fully pass after Task 4)

**Step 3: Update primary tab button styles**

Replace each primary tab `<button>` style (currently at line 107–119) with:

```tsx
            style={{
              fontSize: '12px',
              fontWeight: 500,
              paddingBottom: 8,
              color: primaryTab === tab ? 'var(--text-primary)' : 'var(--text-very-muted)',
              borderBottom: primaryTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
              background: 'none',
              border: 'none',
              borderBottomStyle: 'solid',
              borderBottomWidth: 2,
              borderBottomColor: primaryTab === tab ? 'var(--accent)' : 'transparent',
              cursor: 'pointer',
              whiteSpace: 'nowrap' as const,
              marginBottom: -1,
            }}
```

Wait — the shorthand `border: 'none'` would override `borderBottom`. Use explicit border properties instead:

```tsx
            style={{
              fontSize: '12px',
              fontWeight: 500,
              paddingBottom: 8,
              paddingLeft: 0,
              paddingRight: 0,
              paddingTop: 0,
              color: primaryTab === tab ? 'var(--text-primary)' : 'var(--text-very-muted)',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              borderBottom: primaryTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
              background: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap' as const,
              marginBottom: -1,
            }}
```

Changes from current:
- `fontSize: '10px'` → `'12px'` (canvas.html `.tab-primary { font-size: 12px }`)
- `fontWeight: 600` → `500` (canvas.html `.tab-primary { font-weight: 500 }`)
- Remove `letterSpacing: '0.06em'` (canvas.html has no letter-spacing on .tab-primary)
- Remove `textTransform: 'uppercase'` (canvas.html .tab-primary is normal case)
- `padding: '0 10px'` → `paddingBottom: 8` (canvas.html `.tab-primary { padding-bottom: 8px }`)
- Remove `height: '100%'` (tabs sit at bottom via flex-end)
- Add `marginBottom: -1` (canvas.html `.tab-primary { margin-bottom: -1px }`)
- Use explicit border properties instead of shorthand `border: 'none'`

**Step 4: Update browse button styles**

In the browse button (currently at line 160–180), update:

```tsx
            <button
              data-testid="browse-btn"
              onClick={() => setShowBrowser(!showBrowser)}
              title="Browse files"
              style={{
                fontSize: '13px',
                width: 22,
                height: 22,
                border: 'none',
                borderRadius: 3,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                background: 'transparent',
                color: showBrowser ? 'var(--amber)' : 'var(--text-very-muted)',
              }}
            >
```

Changes:
- `width: 24` → `22` (canvas.html `.browse-btn { width: 22px }`)
- `background: showBrowser ? 'rgba(0,0,0,0.08)' : 'none'` → `background: 'transparent'` (canvas.html `.browse-btn { background: transparent }`)
- `color: showBrowser ? 'var(--text-primary)' : 'var(--text-muted)'` → `color: showBrowser ? 'var(--amber)' : 'var(--text-very-muted)'` (canvas.html `.browse-btn.active { color: var(--amber) }`)

**Step 5: Update file tab styles**

For each file tab `<div>` (currently at line 181–215), update:

```tsx
              <div
                key={file.path}
                data-testid="file-tab"
                onClick={() => { setActiveFileIdx(idx); setShowBrowser(false) }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 8px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  color: idx === activeFileIdx && !showBrowser ? 'var(--text-primary)' : 'var(--text-very-muted)',
                  fontWeight: idx === activeFileIdx && !showBrowser ? 500 : 400,
                  borderBottom: idx === activeFileIdx && !showBrowser ? '2px solid var(--amber)' : '2px solid transparent',
                  marginBottom: -1,
                }}
              >
```

Changes:
- `fontSize: '10px'` → `'11px'` (canvas.html `.file-tab { font-size: 11px }`)
- `borderRadius: 3` → remove (canvas.html uses border-bottom, not background)
- `backgroundColor: ...` → remove (use border-bottom indicator instead)
- `color: ... 'var(--text-muted)'` → `'var(--text-very-muted)'` (canvas.html `.file-tab { color: var(--text-very-muted) }`)
- `fontWeight: ... 600` → `500` (canvas.html `.file-tab.active { font-weight: 500 }`)
- Add `borderBottom` with amber for active tab (canvas.html `.file-tab.active { border-bottom-color: var(--amber) }`)
- Add `marginBottom: -1` (canvas.html `.file-tab { margin-bottom: -1px }`)

**Step 6: Commit**

```bash
git add src/renderer/src/components/Viewer.tsx e2e/viewer.spec.ts && git commit -m "fix(viewer): align tab styling to canvas.html spec (12px tabs, amber indicators)"
```

---

### Task 3: Rewrite Stale V1 Tests for Act 2 Tab Design

The old tests reference `viewer-header`, `viewer-status-dot`, and truncated session IDs that no longer exist in the tab-based design. The STORYBOARD is the source of truth.

**Files:**
- Modify: `e2e/viewer.spec.ts:33-89,766-795`

**Step 1: Rewrite V1:2 test (viewer-header → primary-tabs)**

Replace the test at lines 33–63 with:

```typescript
test('V1: Viewer panel shows primary tabs when session selected', async ({ appWindow }) => {
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

  // Primary tabs should be visible
  const primaryTabs = appWindow.locator('[data-testid="primary-tabs"]')
  await expect(primaryTabs).toBeVisible({ timeout: 3000 })

  // FILES tab should be active by default
  const filesTab = appWindow.locator('[data-testid="tab-files"]')
  await expect(filesTab).toBeVisible({ timeout: 3000 })
  const filesColor = await filesTab.evaluate((el) => getComputedStyle(el).color)
  // Active tab uses --text-primary (#1C1A16 = rgb(28, 26, 22) or close)
  expect(filesColor).not.toBe(await appWindow.locator('[data-testid="tab-app"]').evaluate((el) => getComputedStyle(el).color))
})
```

**Step 2: Rewrite V1:3 test (viewer-status-dot → four primary tabs exist)**

Replace the test at lines 65–89 with:

```typescript
test('V1: Viewer panel has four primary tabs', async ({ appWindow }) => {
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

  // All four primary tabs should exist
  await expect(appWindow.locator('[data-testid="tab-files"]')).toBeVisible({ timeout: 3000 })
  await expect(appWindow.locator('[data-testid="tab-app"]')).toBeVisible({ timeout: 3000 })
  await expect(appWindow.locator('[data-testid="tab-analysis"]')).toBeVisible({ timeout: 3000 })
  await expect(appWindow.locator('[data-testid="tab-changes"]')).toBeVisible({ timeout: 3000 })
})
```

**Step 3: Remove V4:viewer-header test (truncated session ID)**

Delete the test at lines 766–795 entirely ("V4: viewer header shows truncated 8-char session ID"). This test checked for `viewer-header` with a truncated session ID — the tab design doesn't show session IDs in the viewer.

**Step 4: Run rewritten tests to confirm they fail (openViewer not wired yet)**

Run: `npx playwright test e2e/viewer.spec.ts -g "V1:" --workers=1`

Expected: All V1 tests FAIL because `openViewer()` is never called — viewer panel never appears.

**Step 5: Commit test rewrites**

```bash
git add e2e/viewer.spec.ts && git commit -m "test(viewer): rewrite V1 tests for Act 2 tab-based design"
```

---

### Task 4: Wire openViewer() in Sidebar on Session Click

This makes all V1 tests pass.

**Files:**
- Modify: `src/renderer/src/components/Sidebar.tsx:29,197`
- Test: `e2e/viewer.spec.ts` (V1 tests)

**Step 1: Run V1 tests to confirm they fail**

Run: `npx playwright test e2e/viewer.spec.ts -g "V1:" --workers=1`

Expected: ALL V1 tests fail — viewer never appears.

**Step 2: Add openViewer to Sidebar**

In `src/renderer/src/components/Sidebar.tsx`, add the `openViewer` action to the store selectors (after line 31):

```typescript
  const openViewer = useCanvasStore((s) => s.openViewer)
```

**Step 3: Call openViewer when session is clicked**

Update the session `onClick` handler (currently at line 197):

From:
```tsx
onClick={() => selectSession(session.id)}
```

To:
```tsx
onClick={() => { selectSession(session.id); openViewer() }}
```

**Step 4: Run V1 tests to verify they pass**

Run: `npx playwright test e2e/viewer.spec.ts -g "V1:" --workers=1`

Expected: ALL 5 V1 tests PASS:
- `V1: selecting a session shows the Viewer panel` ✓
- `V1: Viewer panel shows primary tabs when session selected` ✓
- `V1: Viewer panel has four primary tabs` ✓
- `V1: terminal remains visible when Viewer opens` ✓
- `V1: close button dismisses the Viewer panel` ✓

**Step 5: Also run V4 width test**

Run: `npx playwright test e2e/viewer.spec.ts -g "viewer panel width is 340px" --workers=1`

Expected: PASS (width is now 340 from Task 1)

**Step 6: Commit**

```bash
git add src/renderer/src/components/Sidebar.tsx && git commit -m "feat(viewer): wire openViewer() on session click — viewer opens for the first time"
```

---

### Task 5: Convert Viewer to Width-Animated Panel

The STORYBOARD Design Decision #4 says: "The full-width terminal in Scene 2.1 isn't a different layout — it's the same layout with the right panel at width 0. The transition to two-panel in Scene 2.2 is a width animation, not a layout swap."

Currently the Viewer returns `null` when closed (unmounting it entirely). This prevents:
1. The smooth width animation described in the storyboard
2. External callers (`__canvasOpenFile`) from triggering the viewer to open (because the component isn't mounted, the window hook doesn't exist)

We convert to always-mounted with width 0/340 + CSS transition.

**Files:**
- Modify: `src/renderer/src/components/Viewer.tsx:13-35,40-52,69-71,75-88`

**Step 1: Write test for CSS transition**

Add this test to `e2e/viewer.spec.ts` after the V4 tests section:

```typescript
test('V4: viewer panel has CSS transition on width', async ({ appWindow }) => {
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

  const viewer = appWindow.locator('[data-testid="viewer-panel"]')
  await expect(viewer).toBeVisible({ timeout: 3000 })

  // Viewer should have a CSS transition that includes width
  const transition = await viewer.evaluate((el) => getComputedStyle(el).transition)
  expect(transition).toContain('width')
})
```

**Step 2: Run test to verify it fails**

Run: `npx playwright test e2e/viewer.spec.ts -g "CSS transition on width" --workers=1`

Expected: FAIL — current viewer has no CSS transition property.

**Step 3: Remove the early return null**

In `src/renderer/src/components/Viewer.tsx`, remove line 35:

```tsx
  // DELETE THIS LINE:
  if (!viewerOpen) return null
```

**Step 4: Update the openFile function to also call openViewer**

This is needed so external callers (`__canvasOpenFile`) can trigger the viewer to open. Update the `openFile` function (currently at line 40):

```tsx
  const openViewer = useCanvasStore((s) => s.openViewer)

  function openFile(path: string): void {
    const name = path.split('/').pop() || path
    const existingIdx = openFiles.findIndex((f) => f.path === path)
    if (existingIdx >= 0) {
      setActiveFileIdx(existingIdx)
    } else {
      const newFiles = [...openFiles, { path, name }]
      setOpenFiles(newFiles)
      setActiveFileIdx(newFiles.length - 1)
    }
    setShowBrowser(false)
    setPrimaryTab('FILES')
    openViewer()
  }
```

Note: You also need to add `openViewer` to the store selectors at the top of the component. Currently line 15 already has `closeViewer`. Add after it:

```tsx
  const openViewer = useCanvasStore((s) => s.openViewer)
```

**Step 5: Update root div to use conditional width + transition**

Replace the root `<div>` style (updated in Task 1) with:

```tsx
    <div
      data-testid="viewer-panel"
      style={{
        width: viewerOpen ? 340 : 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-right)',
        borderLeft: viewerOpen ? '1px solid var(--border)' : 'none',
        overflow: 'hidden',
        flexShrink: 0,
        transition: 'width 0.2s ease',
      }}
    >
```

Changes from current (Task 1 version):
- `width: 340` → `width: viewerOpen ? 340 : 0` (progressive disclosure)
- `borderLeft: '1px solid var(--border)'` → `borderLeft: viewerOpen ? '1px solid var(--border)' : 'none'` (no border line at width 0)
- Add `transition: 'width 0.2s ease'` (smooth animation)

**Step 6: Run tests to verify**

Run: `npx playwright test e2e/viewer.spec.ts -g "V1:|CSS transition" --workers=1`

Expected: ALL PASS. The `not.toBeVisible()` checks still work because Playwright treats width-0 elements as not visible.

**Step 7: Commit**

```bash
git add src/renderer/src/components/Viewer.tsx e2e/viewer.spec.ts && git commit -m "feat(viewer): width animation — progressive disclosure per storyboard Design Decision #4"
```

---

### Task 6: Update V2 Tests for Browse-Button Flow

The old V2 tests assumed the file browser was immediately visible when a session was selected. In the Act 2 design, the file browser is behind the browse button toggle. Users must click the browse button to see it (Scene 2.3).

**Files:**
- Modify: `e2e/viewer.spec.ts` (V2 tests, lines 159–328)

**Step 1: Run V2 tests to see them fail**

Run: `npx playwright test e2e/viewer.spec.ts -g "V2:" --workers=1`

Expected: FAIL — file browser is not immediately visible after session selection.

**Step 2: Update V2:1 to click browse button first**

Replace lines 159–186 with:

```typescript
test('V2: clicking browse button shows file browser', async ({ appWindow }) => {
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

  // Viewer opens but file browser is NOT visible yet
  const viewer = appWindow.locator('[data-testid="viewer-panel"]')
  await expect(viewer).toBeVisible({ timeout: 3000 })
  const fileBrowser = appWindow.locator('[data-testid="file-browser"]')
  await expect(fileBrowser).not.toBeVisible()

  // Click the browse button
  const browseBtn = appWindow.locator('[data-testid="browse-btn"]')
  await browseBtn.click()

  // File browser should now be visible
  await expect(fileBrowser).toBeVisible({ timeout: 5000 })
})
```

**Step 3: Add browse-btn click to V2:2 test**

Replace lines 188–219. The test name and setup are the same, but add a browse button click before checking entries:

```typescript
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

  // Click browse button to open file browser
  const browseBtn = appWindow.locator('[data-testid="browse-btn"]')
  await expect(browseBtn).toBeVisible({ timeout: 3000 })
  await browseBtn.click()

  // Wait for file entries to appear
  const fileEntries = appWindow.locator('[data-testid="file-entry"]')
  await expect(fileEntries.first()).toBeVisible({ timeout: 5000 })

  // Should see README.md, src/, assets/
  const entryTexts = await fileEntries.allTextContents()
  const allText = entryTexts.join(' ')
  expect(allText).toContain('README.md')
  expect(allText).toContain('src')
})
```

**Step 4: Add browse-btn click to V2:3 test (clicking folder navigates)**

In the test "V2: clicking a folder navigates into it" (lines 221–265), add the browse button click after the session click. Insert this block after `await session.click()`:

```typescript
  // Click browse button first
  const browseBtn = appWindow.locator('[data-testid="browse-btn"]')
  await expect(browseBtn).toBeVisible({ timeout: 3000 })
  await browseBtn.click()
```

**Step 5: Add browse-btn click to V2:4 test (back button)**

In the test "V2: back button navigates up one level" (lines 267–328), add the browse button click after the session click. Insert after `await session.click()`:

```typescript
  // Click browse button first
  const browseBtn = appWindow.locator('[data-testid="browse-btn"]')
  await expect(browseBtn).toBeVisible({ timeout: 3000 })
  await browseBtn.click()
```

**Step 6: Run V2 tests to verify they pass**

Run: `npx playwright test e2e/viewer.spec.ts -g "V2:" --workers=1`

Expected: ALL 4 V2 tests PASS.

**Step 7: Commit**

```bash
git add e2e/viewer.spec.ts && git commit -m "test(viewer): update V2 tests for browse-button flow (Act 2 Scene 2.3)"
```

---

### Task 7: Add Provenance Tracking and Labels

The STORYBOARD says: "The 'Opened by Amplifier' label is key — it tells you who caused this and why." (Scene 2.2) and "The distinction between 'Opened by Amplifier' and 'Opened by you' creates a subtle but meaningful provenance signal." (Scene 2.4)

**Files:**
- Modify: `src/renderer/src/components/Viewer.tsx:8-11,40-52,69-71,222-241`
- Test: `e2e/viewer.spec.ts` (new provenance tests)

**Step 1: Write provenance test for Amplifier-opened files**

Add this test to `e2e/viewer.spec.ts` after the V4 section:

```typescript
// --- P1: Provenance Labels ---

test('P1: file opened via __canvasOpenFile shows "Opened by Amplifier" label', async ({ appWindow }) => {
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

  // Simulate Amplifier opening a file via the global hook
  await appWindow.evaluate(() => {
    const openFile = (window as Record<string, unknown>).__canvasOpenFile as ((path: string) => void) | undefined
    if (openFile) openFile('README.md')
  })

  // Provenance label should say "Opened by Amplifier"
  const provenance = appWindow.locator('[data-testid="provenance-label"]')
  await expect(provenance).toBeVisible({ timeout: 3000 })
  const text = await provenance.textContent()
  expect(text).toContain('Opened by Amplifier')
})

test('P1: file opened via file browser shows "Opened by you" label', async ({ appWindow }) => {
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

  await expect(viewer).toBeVisible({ timeout: 3000 })

  // Open file browser
  const browseBtn = appWindow.locator('[data-testid="browse-btn"]')
  await browseBtn.click()

  // Click README.md
  const readmeEntry = appWindow.locator('[data-testid="file-entry"]', { hasText: 'README.md' })
  await expect(readmeEntry).toBeVisible({ timeout: 5000 })
  await readmeEntry.click()

  // Provenance label should say "Opened by you"
  const provenance = appWindow.locator('[data-testid="provenance-label"]')
  await expect(provenance).toBeVisible({ timeout: 3000 })
  const text = await provenance.textContent()
  expect(text).toContain('Opened by you')
})
```

**Step 2: Run tests to verify they fail**

Run: `npx playwright test e2e/viewer.spec.ts -g "P1:" --workers=1`

Expected: FAIL — no `provenance-label` element exists yet.

**Step 3: Add openedBy field to OpenFile interface**

In `src/renderer/src/components/Viewer.tsx`, update the `OpenFile` interface (line 8–11):

```tsx
interface OpenFile {
  path: string
  name: string
  openedBy: 'amplifier' | 'user'
}
```

**Step 4: Update openFile function to accept and store openedBy**

```tsx
  function openFile(path: string, openedBy: 'amplifier' | 'user' = 'user'): void {
    const name = path.split('/').pop() || path
    const existingIdx = openFiles.findIndex((f) => f.path === path)
    if (existingIdx >= 0) {
      setActiveFileIdx(existingIdx)
    } else {
      const newFiles = [...openFiles, { path, name, openedBy }]
      setOpenFiles(newFiles)
      setActiveFileIdx(newFiles.length - 1)
    }
    setShowBrowser(false)
    setPrimaryTab('FILES')
    openViewer()
  }
```

**Step 5: Wire __canvasOpenFile to pass 'amplifier' provenance**

Update the window hook assignment (currently at line 70):

```tsx
  ;(window as Record<string, unknown>).__canvasOpenFile = (path: string) => openFile(path, 'amplifier')
```

**Step 6: Wire FileBrowser to pass 'user' provenance**

Update the FileBrowser `onSelectFile` callback (currently at line 227):

```tsx
              <FileBrowser
                rootPath={workDir}
                onSelectFile={(filePath) => openFile(filePath, 'user')}
              />
```

(This already passes 'user' by default from the function signature, but making it explicit is clearer.)

**Step 7: Render provenance label above file content**

In the panel content area, update the `activeFile` rendering (currently around line 228–229) to include the provenance label:

```tsx
            ) : activeFile ? (
              <>
                <div
                  data-testid="provenance-label"
                  style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-ui)',
                    color: 'var(--text-very-muted)',
                    marginBottom: 8,
                  }}
                >
                  {activeFile.openedBy === 'amplifier' ? 'Opened by Amplifier' : 'Opened by you'}
                </div>
                <FileRenderer filePath={activeFile.path} />
              </>
```

The style values come from canvas.html line 1551: `font:10px var(--font-ui);color:var(--text-very-muted);margin-bottom:8px;`

**Step 8: Run provenance tests**

Run: `npx playwright test e2e/viewer.spec.ts -g "P1:" --workers=1`

Expected: BOTH PASS.

**Step 9: Run all tests so far**

Run: `npx playwright test e2e/viewer.spec.ts -g "V1:|V2:|P1:|V4:" --workers=1`

Expected: ALL PASS.

**Step 10: Commit**

```bash
git add src/renderer/src/components/Viewer.tsx e2e/viewer.spec.ts && git commit -m "feat(viewer): provenance labels — 'Opened by Amplifier' / 'Opened by you' (Scenes 2.2, 2.4)"
```

---

### Task 8: Build Recent-Files Section

When the viewer opens on the FILES tab with no file selected and the browser not showing, the session's recent file activity should be displayed. This data comes from `session.recentFiles` (populated by the main process from events.jsonl tool_call events).

**Files:**
- Modify: `src/renderer/src/components/Viewer.tsx:218-241`
- Test: `e2e/viewer.spec.ts` (existing I1 tests)

**Step 1: Run existing I1 test to see it fail**

Run: `npx playwright test e2e/viewer.spec.ts -g "I1: session with recent files" --workers=1`

Expected: FAIL — no `recent-files` element exists yet.

**Step 2: Build the recent-files section**

In `src/renderer/src/components/Viewer.tsx`, replace the panel content area (the `{showBrowser ? ... : activeFile ? ... : ...}` block, currently around line 222–241) with:

```tsx
          <div
            data-testid="panel-content"
            style={{ flex: 1, overflow: 'auto', padding: 16 }}
          >
            {showBrowser && workDir ? (
              <FileBrowser
                rootPath={workDir}
                onSelectFile={(filePath) => openFile(filePath, 'user')}
              />
            ) : activeFile ? (
              <>
                <div
                  data-testid="provenance-label"
                  style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-ui)',
                    color: 'var(--text-very-muted)',
                    marginBottom: 8,
                  }}
                >
                  {activeFile.openedBy === 'amplifier' ? 'Opened by Amplifier' : 'Opened by you'}
                </div>
                <FileRenderer filePath={activeFile.path} />
              </>
            ) : session?.recentFiles && session.recentFiles.length > 0 ? (
              <div data-testid="recent-files">
                <div
                  style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.08em',
                    color: 'var(--text-very-muted)',
                    marginBottom: 8,
                  }}
                >
                  Recent files
                </div>
                {session.recentFiles.map((file, idx) => {
                  const fileName = file.path.split('/').pop() || file.path
                  return (
                    <div
                      key={`${file.path}-${file.timestamp}-${idx}`}
                      data-testid="recent-file-item"
                      onClick={() => openFile(
                        workDir ? `${workDir}/${file.path}` : file.path,
                        'amplifier'
                      )}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '4px 0',
                        cursor: 'pointer',
                        fontSize: '12px',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {fileName}
                      </span>
                      <span
                        data-testid="operation-badge"
                        style={{
                          fontSize: '9px',
                          fontWeight: 600,
                          textTransform: 'uppercase' as const,
                          letterSpacing: '0.04em',
                          padding: '1px 5px',
                          borderRadius: 3,
                          flexShrink: 0,
                          background: operationBadgeColor(file.operation).bg,
                          color: operationBadgeColor(file.operation).text,
                        }}
                      >
                        {file.operation}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div
                style={{
                  color: 'var(--text-very-muted)',
                  fontSize: '11px',
                  textAlign: 'center',
                  marginTop: 60,
                }}
              >
                Click {'\u25A6'} to browse files
              </div>
            )}
          </div>
```

**Step 3: Add the operationBadgeColor helper**

Add this function inside the `Viewer` component, before the return statement:

```tsx
  function operationBadgeColor(op: string): { bg: string; text: string } {
    switch (op) {
      case 'read':
        return { bg: 'rgba(59, 130, 246, 0.12)', text: 'rgb(59, 130, 246)' }
      case 'write':
        return { bg: 'rgba(245, 158, 11, 0.12)', text: 'rgb(245, 158, 11)' }
      case 'edit':
        return { bg: 'rgba(168, 85, 247, 0.12)', text: 'rgb(168, 85, 247)' }
      case 'create':
        return { bg: 'rgba(34, 197, 94, 0.12)', text: 'rgb(34, 197, 94)' }
      case 'delete':
        return { bg: 'rgba(239, 68, 68, 0.12)', text: 'rgb(239, 68, 68)' }
      default:
        return { bg: 'rgba(0, 0, 0, 0.06)', text: 'var(--text-muted)' }
    }
  }
```

**Step 4: Run I1 test**

Run: `npx playwright test e2e/viewer.spec.ts -g "I1: session with recent files" --workers=1`

Expected: PASS — recent-files section appears with file items from tp-session-001's tool_call events.

**Step 5: Commit**

```bash
git add src/renderer/src/components/Viewer.tsx && git commit -m "feat(viewer): recent-files section from session file activity (Scene 2.2 empty state)"
```

---

### Task 9: Wire Recent File Click + Operation Badges

**Files:**
- Test: `e2e/viewer.spec.ts` (existing I1 tests for badges and click-to-open)

**Step 1: Run I1 click-to-open test**

Run: `npx playwright test e2e/viewer.spec.ts -g "I1: clicking a recent file" --workers=1`

Expected: PASS — the `onClick` handler in the recent-file-item already calls `openFile()` from Task 8.

**Step 2: Run I1 operation badges test**

Run: `npx playwright test e2e/viewer.spec.ts -g "I1: recent file items show operation badges" --workers=1`

Expected: PASS — operation badges are already rendered from Task 8.

**Step 3: Run all I1 tests together**

Run: `npx playwright test e2e/viewer.spec.ts -g "I1:" --workers=1`

Expected: ALL 3 I1 tests PASS:
- `I1: session with recent files shows recent-files section` ✓
- `I1: clicking a recent file link opens it in FileRenderer` ✓
- `I1: recent file items show operation badges` ✓

If any fail, debug and fix. The most likely issue is the file path construction in the `onClick` handler — the `file.path` from events.jsonl is relative (e.g., `src/app.ts`) and needs to be resolved against the session's workDir for the FileRenderer.

**Step 4: Commit (if any fixes were needed)**

```bash
git add src/renderer/src/components/Viewer.tsx && git commit -m "fix(viewer): recent file interaction and operation badges"
```

If all tests passed without changes, skip the commit.

---

### Task 10: Update V3/V4/V5/V6 Tests for Browse-Button Flow

Several tests in the V3–V6 and V5 groups open files by clicking entries in the file browser. These tests assumed the file browser was auto-visible. Now they need a browse-btn click first.

**Files:**
- Modify: `e2e/viewer.spec.ts` (V3, V4, V5, V6 tests that use file browser)

**Step 1: Identify affected tests**

Run the full test suite to find failures:

Run: `npx playwright test e2e/viewer.spec.ts --workers=1`

Expected: Tests that navigate the file browser will fail because they don't click the browse button first. These are:
- `V3: clicking a markdown file renders it` (line ~332)
- `V4: clicking a TypeScript file shows syntax-highlighted code` (line ~376)
- `V4b: code renderer uses dark theme background` (line ~434)
- `V5: clicking an image file shows the image renderer` (line ~493)
- `V6a: markdown renderer wrapper uses design-system text color` (line ~914)
- `V6a: markdown h1 is 18px and fenced code blocks use dark background` (line ~960)
- `V6b: image renderer img uses 60vh max height` (line ~1013)
- `V4: file entry rows have 28px height and 13px font` (line ~824)
- `V4: file entries use text icons instead of emoji` (line ~865)

**Step 2: Add browse-btn click to each failing test**

For each test above, after the `await session.click()` line and before the first `fileEntries` locator, add:

```typescript
  // Open file browser
  const browseBtn = appWindow.locator('[data-testid="browse-btn"]')
  await expect(browseBtn).toBeVisible({ timeout: 3000 })
  await browseBtn.click()
```

The pattern is always the same — insert the browse-btn click between the session click and the first file entry interaction.

**Step 3: Run full test suite**

Run: `npx playwright test e2e/viewer.spec.ts --workers=1`

Expected: ALL tests PASS.

**Step 4: Commit**

```bash
git add e2e/viewer.spec.ts && git commit -m "test(viewer): add browse-btn click to all file browser tests"
```

---

### Task 11: Integration Test — Terminal Persistence

**Files:**
- Test: `e2e/viewer.spec.ts` (existing I2 test)

**Step 1: Run I2 terminal persistence test**

Run: `npx playwright test e2e/viewer.spec.ts -g "I2:" --workers=1`

Expected: PASS — the terminal component is never unmounted. The viewer width animation doesn't affect the terminal's flex layout.

If it fails, the most likely cause is a timing issue with the width animation — the terminal might briefly have width 0 during the transition. Fix by adding a small wait:

```typescript
  // After opening viewer, wait for animation to settle
  await appWindow.waitForTimeout(300)
```

**Step 2: Run the full test suite one final time**

Run: `npx playwright test e2e/viewer.spec.ts --workers=1 2>&1 | tail -20`

Expected: ALL tests PASS. Note the exact count and report any failures.

**Step 3: Commit if any fixes were needed**

```bash
git add -A && git commit -m "fix(viewer): integration test fixes for terminal persistence"
```

If all tests passed without changes, no commit needed.

---

### Task 12: Full Verification + Final Commit

**Step 1: Run the entire e2e test suite**

Run: `npx playwright test --workers=1 2>&1 | tail -30`

This runs ALL spec files (not just viewer.spec.ts). Ensure no regressions in the welcome/sidebar tests.

Expected: ALL PASS.

**Step 2: Run TypeScript type check**

Run: `npx tsc --noEmit`

Expected: No errors.

**Step 3: Verify git status is clean**

Run: `git status && git log --oneline -8`

Expected: Clean working tree. Recent commits should show the Act 2 Phase 1 work:
```
<hash> fix(viewer): integration test fixes for terminal persistence
<hash> test(viewer): add browse-btn click to all file browser tests
<hash> fix(viewer): recent file interaction and operation badges
<hash> feat(viewer): recent-files section from session file activity
<hash> feat(viewer): provenance labels — 'Opened by Amplifier' / 'Opened by you'
<hash> test(viewer): update V2 tests for browse-button flow (Act 2 Scene 2.3)
<hash> feat(viewer): width animation — progressive disclosure per storyboard
<hash> feat(viewer): wire openViewer() on session click
<hash> test(viewer): rewrite V1 tests for Act 2 tab-based design
<hash> fix(viewer): align tab styling to canvas.html spec
<hash> fix(viewer): align CSS dimensions to canvas.html spec
<hash> eb5b9b2 feat(viewer): complete Act 2 viewer structural shell
```

**Step 4: Done**

Phase 1 complete. The viewer now:
- ✅ Opens when you click a session (Scene 2.2 trigger)
- ✅ Slides in with width animation (Design Decision #4)
- ✅ Shows correct CSS dimensions from canvas.html
- ✅ Has four primary tabs (FILES, APP, ANALYSIS, CHANGES)
- ✅ Shows provenance: "Opened by Amplifier" / "Opened by you" (Scenes 2.2, 2.4)
- ✅ Has browse button with amber active state (Scene 2.3)
- ✅ Closes with ✕ button
- ✅ Shows recent files from session activity
- ✅ Terminal persists across viewer open/close
- ❌ Scene 2.5 (App Preview) deferred to Phase 2

---

## Appendix: Key File Reference

| File | Role | Lines |
|------|------|-------|
| `src/renderer/src/components/Viewer.tsx` | Main viewer component | ~324 |
| `src/renderer/src/components/Sidebar.tsx` | Sidebar with session list | ~289 |
| `src/renderer/src/store.ts` | Zustand store (viewerOpen, openViewer) | ~106 |
| `src/renderer/src/App.tsx` | Layout (sidebar + terminal + viewer) | ~205 |
| `src/renderer/src/components/FileBrowser.tsx` | File browser component | ~186 |
| `src/renderer/src/components/FileRenderer.tsx` | File type routing | ~45 |
| `src/shared/types.ts` | SessionState, FileActivity types | ~47 |
| `e2e/viewer.spec.ts` | All viewer E2E tests | ~1065 |
| `e2e/fixtures.ts` | Playwright Electron fixtures | ~46 |
| `canvas.html` | CSS reference (the oracle) | — |
| `STORYBOARD.md` | Design source of truth | ~325 |

## Appendix: canvas.html CSS Values Used

```css
.right-panel        { width: 340px; flex-shrink: 0 }
.tab-row-primary    { height: 36px; align-items: flex-end; padding: 0 12px; gap: 20px }
.tab-primary        { font-size: 12px; font-weight: 500; padding-bottom: 8px; margin-bottom: -1px }
.tab-primary.active { color: var(--text-primary); border-bottom-color: var(--amber) }
.tab-row-secondary  { height: 30px; padding: 0 8px; gap: 2px }
.browse-btn         { width: 22px; height: 22px; color: var(--text-very-muted) }
.browse-btn.active  { color: var(--amber) }
.file-tab           { font-size: 11px; padding: 3px 8px; margin-bottom: -1px; color: var(--text-very-muted) }
.file-tab.active    { color: var(--text-primary); font-weight: 500; border-bottom-color: var(--amber) }
.panel-content      { padding: 16px }
/* provenance label */ font: 10px var(--font-ui); color: var(--text-very-muted); margin-bottom: 8px
```

## Appendix: Test Fixture Data

Session `tp-session-001` events:
```jsonl
{"type":"session:start","data":{"cwd":"../../workdir"}}
{"type":"tool_call","data":{"tool":"read_file","args":{"path":"src/app.ts"}}}
{"type":"tool_call","data":{"tool":"write_file","args":{"path":"src/app.ts"}}}
{"type":"tool_call","data":{"tool":"edit_file","args":{"path":"src/utils.ts"}}}
{"type":"session:end","data":{"exitCode":0}}
```

This produces `recentFiles`: `[{path:"src/app.ts", op:"read"}, {path:"src/app.ts", op:"write"}, {path:"src/utils.ts", op:"edit"}]`

Session `tp-session-002` events:
```jsonl
{"type":"session:start","data":{"cwd":"../../workdir"}}
{"type":"tool_call","data":{"tool":"create_file","args":{"path":"src/new-feature.ts"}}}
```

Both sessions resolve `workDir` to the `e2e/fixtures/amplifier-home/projects/team-pulse/workdir/` directory.
