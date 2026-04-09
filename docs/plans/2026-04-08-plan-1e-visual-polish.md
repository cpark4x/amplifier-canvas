# Phase 1E: Visual Polish Implementation Plan

> **Execution:** Use the subagent-driven-development workflow to implement this plan.

**Goal:** Align every component to the `canvas.html` design system — correct colors, typography, spacing, and structural elements. No new features.

**Architecture:** This is a pure CSS/styling pass across 10 files. We define CSS custom properties in `App.css`, then sweep through every component replacing hardcoded hex values with design-system tokens. We also add missing structural elements (pane title bar, sidebar border, active indicator) and fix the code renderer from light to dark theme.

**Tech Stack:** React inline styles with CSS variable references (`'var(--token)'`), CSS custom properties in `App.css`, xterm.js theme configuration, highlight.js custom color palette.

---

## Pre-flight Checklist

Before starting ANY task, confirm you're in the right directory and tests pass:

```bash
cd /Users/chrispark/Projects/amplifier-canvas
npm run build && npx playwright test
```

All 61 tests should pass. If they don't, stop and fix before proceeding.

---

## Critical Note: Tests That Must Be Updated

Several existing e2e tests assert the OLD color values. Each task below identifies exactly which test assertions need updating. The pattern is always: update the source file, then update the test expectation to match. **All 61 tests must pass after every task.**

---

## Task 1: CSS Variables + Global Token Alignment

**Files:**
- Modify: `src/renderer/src/App.css` (full rewrite)
- Modify: `src/renderer/src/App.tsx:33-47` (header bar styles)
- Modify: `src/renderer/src/App.tsx:63-68` (terminal container padding)
- Modify: `src/main/index.ts:55` (BrowserWindow background color)
- Modify: `e2e/terminal.spec.ts:76` (background color assertion)
- Modify: `e2e/sidebar.spec.ts:18-23` (sidebar bg assertion)
- Modify: `e2e/sidebar.spec.ts:157-163` (header bg assertion)

This is the foundation. Every subsequent task references these variables.

**Step 1: Replace the entire contents of `src/renderer/src/App.css`**

Replace the full file with:

```css
/* ============================================================
   DESIGN SYSTEM — CSS VARIABLES (from canvas.html)
   ============================================================ */
:root {
  --bg-page:           #F0EBE3;
  --bg-header:         #E8E2D8;
  --bg-sidebar:        #F0EBE3;
  --bg-sidebar-active: #E8E0D4;
  --bg-pane-title:     #DDD5C8;
  --bg-terminal:       #0F0E0C;
  --bg-right:          #F7F4EF;
  --bg-modal:          #FAF8F4;
  --border:            #DDD5C8;
  --text-primary:      #1C1A16;
  --text-muted:        #8A8278;
  --text-very-muted:   #A09888;
  --text-terminal:     #C8C4BC;
  --amber:             #F59E0B;
  --green:             #4CAF74;
  --red:               #EF4444;
  --font-ui:           -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
  --font-mono:         'SFMono-Regular', Menlo, Consolas, monospace;
}

/* ============================================================
   RESET + BASE
   ============================================================ */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #root {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background-color: var(--bg-page);
  color: var(--text-primary);
  font-family: var(--font-ui);
}

.xterm {
  height: 100%;
}
```

**Step 2: Update the header bar in `src/renderer/src/App.tsx`**

Find this block (lines 33-47):

```tsx
        style={{
          height: 32,
          minHeight: 32,
          backgroundColor: '#F5F3EE',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 80, // room for macOS traffic lights
          WebkitAppRegion: 'drag' as unknown as string,
          fontSize: '11px',
          color: '#8B8B90',
          letterSpacing: '0.04em',
        }}
```

Replace with:

```tsx
        style={{
          height: 38,
          minHeight: 38,
          backgroundColor: 'var(--bg-header)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 80, // room for macOS traffic lights
          WebkitAppRegion: 'drag' as unknown as string,
          fontSize: '13px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          letterSpacing: '0.04em',
        }}
```

**Step 3: Remove terminal container padding in `src/renderer/src/App.tsx`**

Find this block (lines 63-68):

```tsx
        <div style={{
          flex: 1,
          overflow: 'hidden',
          padding: '4px',
        }}>
```

Replace with:

```tsx
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column' as const,
          overflow: 'hidden',
        }}>
```

Note: We add `display: 'flex'` and `flexDirection: 'column'` because Task 2 will add a pane title bar as a sibling of the terminal inside this container. The flex column ensures the title bar sits above and the terminal fills the rest.

**Step 4: Update BrowserWindow background color in `src/main/index.ts`**

Find line 55:

```ts
    backgroundColor: '#F2F0EB',
```

Replace with:

```ts
    backgroundColor: '#F0EBE3',
```

**Step 5: Update e2e test — terminal background color**

In `e2e/terminal.spec.ts`, find lines 75-76:

```ts
  // Should be warm stone (#F2F0EB) — Electron returns uppercase hex with alpha
  expect(bgColor?.toLowerCase()).toContain('f2f0eb')
```

Replace with:

```ts
  // Should be warm stone (#F0EBE3) — Electron returns uppercase hex with alpha
  expect(bgColor?.toLowerCase()).toContain('f0ebe3')
```

**Step 6: Update e2e test — sidebar background color**

In `e2e/sidebar.spec.ts`, find lines 18-23:

```ts
test('S1: sidebar has warm stone background', async ({ appWindow }) => {
  const sidebar = appWindow.locator('[data-testid="sidebar"]')
  const bg = await sidebar.evaluate((el) => getComputedStyle(el).backgroundColor)
  // #F2F0EB = rgb(242, 240, 235)
  expect(bg).toBe('rgb(242, 240, 235)')
})
```

Replace with:

```ts
test('S1: sidebar has warm stone background', async ({ appWindow }) => {
  const sidebar = appWindow.locator('[data-testid="sidebar"]')
  const bg = await sidebar.evaluate((el) => getComputedStyle(el).backgroundColor)
  // #F0EBE3 = rgb(240, 235, 227)
  expect(bg).toBe('rgb(240, 235, 227)')
})
```

**Step 7: Update e2e test — header bar background color**

In `e2e/sidebar.spec.ts`, find lines 157-163:

```ts
test('S5: header bar exists with correct background', async ({ appWindow }) => {
  const header = appWindow.locator('[data-testid="header-bar"]')
  await expect(header).toBeVisible({ timeout: 5000 })
  const bg = await header.evaluate((el) => getComputedStyle(el).backgroundColor)
  // #F5F3EE = rgb(245, 243, 238)
  expect(bg).toBe('rgb(245, 243, 238)')
})
```

Replace with:

```ts
test('S5: header bar exists with correct background', async ({ appWindow }) => {
  const header = appWindow.locator('[data-testid="header-bar"]')
  await expect(header).toBeVisible({ timeout: 5000 })
  const bg = await header.evaluate((el) => getComputedStyle(el).backgroundColor)
  // #E8E2D8 = rgb(232, 226, 216)
  expect(bg).toBe('rgb(232, 226, 216)')
})
```

**Step 8: Build and test**

```bash
cd /Users/chrispark/Projects/amplifier-canvas
npm run build && npx playwright test
```

Expected: All 61 tests pass.

**Step 9: Commit**

```bash
git add src/renderer/src/App.css src/renderer/src/App.tsx src/main/index.ts e2e/terminal.spec.ts e2e/sidebar.spec.ts && git commit -m "style: define CSS custom properties and align global tokens to design system"
```

---

## Task 2: Terminal Theme + Pane Title Bar

**Files:**
- Modify: `src/renderer/src/components/Terminal.tsx:14-24` (xterm theme + font)
- Modify: `src/renderer/src/App.tsx:63-69` (add pane title bar above terminal)

**Step 1: Update the xterm configuration in `src/renderer/src/components/Terminal.tsx`**

Find lines 14-24:

```tsx
    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1a1a1a',
        foreground: '#e0e0e0',
        cursor: '#e0e0e0',
      },
      allowProposedApi: true,
    })
```

Replace with:

```tsx
    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'SFMono-Regular', Menlo, Consolas, monospace",
      lineHeight: 1.65,
      theme: {
        background: '#0F0E0C',
        foreground: '#C8C4BC',
        cursor: '#F59E0B',
        cursorAccent: '#0F0E0C',
        selectionBackground: 'rgba(245, 158, 11, 0.25)',
      },
      allowProposedApi: true,
    })
```

Key details:
- `fontSize: 13` (was 14)
- `fontFamily` uses SFMono-Regular first, then Menlo, Consolas (was Menlo, Monaco, Courier New)
- `lineHeight: 1.65` (new — matches canvas.html terminal)
- `background: '#0F0E0C'` — warm near-black (was generic dark)
- `foreground: '#C8C4BC'` — warm light gray (was #e0e0e0)
- `cursor: '#F59E0B'` — **AMBER** (was white — this is the signature design detail)
- `cursorAccent: '#0F0E0C'` — cursor text color (matches background)
- `selectionBackground` — amber-tinted selection

**Step 2: Add the pane title bar above the terminal in `src/renderer/src/App.tsx`**

In `App.tsx`, find the terminal container div (after Task 1 changes, it looks like this):

```tsx
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column' as const,
          overflow: 'hidden',
        }}>
          <TerminalComponent />
        </div>
```

Replace with:

```tsx
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column' as const,
          overflow: 'hidden',
        }}>
          {/* Pane title bar above terminal */}
          <div
            data-testid="pane-title"
            style={{
              height: 28,
              minHeight: 28,
              backgroundColor: 'var(--bg-pane-title)',
              display: 'flex',
              alignItems: 'center',
              paddingLeft: 12,
              paddingRight: 12,
              fontSize: '11px',
              color: 'var(--text-muted)',
              flexShrink: 0,
            }}
          >
            Terminal
          </div>
          <TerminalComponent />
        </div>
```

This matches the canvas.html `.pane-title` class: 28px height, `--bg-pane-title` (#DDD5C8), 11px text, `--text-muted` (#8A8278).

**Step 3: Build and test**

```bash
cd /Users/chrispark/Projects/amplifier-canvas
npm run build && npx playwright test
```

Expected: All 61 tests pass. The pane title bar adds 28px above the terminal but the terminal tests use loose size checks (> 50% of viewport height) so they should still pass.

**Step 4: Commit**

```bash
git add src/renderer/src/components/Terminal.tsx src/renderer/src/App.tsx && git commit -m "style: terminal warm dark theme with amber cursor + pane title bar"
```

---

## Task 3: Sidebar Polish

**Files:**
- Modify: `src/renderer/src/components/Sidebar.tsx` (full style overhaul)
- Modify: `e2e/sidebar.spec.ts:39-43` (border-right assertion)
- Modify: `e2e/sidebar.spec.ts:57-63` (project name font size assertion)

**Step 1: Update STATUS_COLORS in `src/renderer/src/components/Sidebar.tsx`**

Find lines 16-22:

```tsx
const STATUS_COLORS: Record<SessionStatus, string> = {
  running: '#3B82F6',
  active: '#3B82F6',
  needs_input: '#F59E0B',
  done: '#10B981',
  failed: '#EF4444',
}
```

Replace with:

```tsx
const STATUS_COLORS: Record<SessionStatus, string> = {
  running: '#F59E0B',
  active: '#F59E0B',
  needs_input: '#F59E0B',
  done: '#4CAF74',
  failed: '#EF4444',
}
```

Key change: `running` and `active` change from blue (#3B82F6) to amber (#F59E0B). `done` changes from #10B981 to #4CAF74.

**Step 2: Update sidebar container styles**

Find lines 52-62:

```tsx
      style={{
        width: collapsed ? 28 : 200,
        minWidth: collapsed ? 28 : 200,
        height: '100%',
        backgroundColor: '#F2F0EB',
        borderRight: '0px solid transparent',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'width 0.15s ease, min-width 0.15s ease',
      }}
```

Replace with:

```tsx
      style={{
        width: collapsed ? 28 : 200,
        minWidth: collapsed ? 28 : 200,
        height: '100%',
        backgroundColor: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'width 0.15s ease, min-width 0.15s ease',
      }}
```

**Step 3: Update toggle button styles**

Find lines 69-78:

```tsx
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '6px 8px',
            fontSize: '10px',
            color: '#8B8B90',
            textAlign: 'left',
            letterSpacing: '0.08em',
            textTransform: 'uppercase' as const,
          }}
```

Replace with:

```tsx
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '6px 8px',
            fontSize: '10px',
            color: 'var(--text-very-muted)',
            textAlign: 'left',
            letterSpacing: '0.08em',
            textTransform: 'uppercase' as const,
          }}
```

**Step 4: Update project label styles**

Find lines 92-104 (the project item and project name):

```tsx
                style={{
                  cursor: 'pointer',
                  padding: '3px 0',
                }}
              >
                <span
                  data-testid="project-name"
                  style={{
                    fontSize: '11px',
                    fontWeight: 500,
                    color:
                      selectedProjectSlug === project.slug ? '#2C2825' : '#8B8B90',
                  }}
```

Replace with:

```tsx
                style={{
                  cursor: 'pointer',
                  padding: '3px 0',
                }}
              >
                <span
                  data-testid="project-name"
                  style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.1em',
                    color:
                      selectedProjectSlug === project.slug ? 'var(--text-primary)' : 'var(--text-very-muted)',
                  }}
```

Key changes: 10px (was 11px), fontWeight 600 (was 500), uppercase, letter-spacing 0.1em, uses CSS variables.

**Step 5: Update session row styles**

Find lines 119-130 (session item styles):

```tsx
                      style={{
                        padding: '2px 4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        backgroundColor:
                          selectedSessionId === session.id
                            ? 'rgba(0, 0, 0, 0.06)'
                            : 'transparent',
                        borderRadius: '3px',
                      }}
```

Replace with:

```tsx
                      style={{
                        height: 36,
                        padding: '0 12px 0 14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        position: 'relative' as const,
                        backgroundColor:
                          selectedSessionId === session.id
                            ? 'var(--bg-sidebar-active)'
                            : 'transparent',
                        borderLeft:
                          selectedSessionId === session.id
                            ? '2px solid var(--amber)'
                            : '2px solid transparent',
                        transition: 'background 0.12s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (selectedSessionId !== session.id) {
                          ;(e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(0,0,0,0.03)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        ;(e.currentTarget as HTMLDivElement).style.backgroundColor =
                          selectedSessionId === session.id ? '#E8E0D4' : 'transparent'
                      }}
```

Key changes:
- height: 36px (was auto)
- padding: `0 12px 0 14px` (was `2px 4px`)
- Active state uses `--bg-sidebar-active` (#E8E0D4) instead of rgba
- Active indicator: 2px amber left border (transparent when not active)
- Hover transition: background 0.12s ease
- Hover state: rgba(0,0,0,0.03) on non-active rows
- Removed borderRadius (design system doesn't use it for session rows)

**Step 6: Update session name display**

Find lines 144-156 (session name span):

```tsx
                      <span
                        data-testid="session-name"
                        style={{
                          fontSize: '10px',
                          color:
                            selectedSessionId === session.id ? '#2C2825' : '#8B8B90',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {session.id}
                      </span>
```

Replace with:

```tsx
                      <span
                        data-testid="session-name"
                        style={{
                          fontSize: '12px',
                          color:
                            selectedSessionId === session.id ? 'var(--text-primary)' : 'var(--text-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1,
                        }}
                      >
                        {session.id.slice(0, 8)}
                      </span>
```

Key changes:
- fontSize 12px (was 10px, matching canvas.html `.session-name` at 12px)
- Show truncated session ID: first 8 chars instead of full UUID
- Uses CSS variables for colors
- Added `flex: 1` to fill remaining space

**Step 7: Remove the session list left padding**

Find line 112:

```tsx
                <div style={{ paddingLeft: '8px' }}>
```

Replace with:

```tsx
                <div style={{ paddingLeft: 0 }}>
```

The session rows now have their own padding (0 12px 0 14px) so the wrapping div doesn't need extra indent.

**Step 8: Update e2e test — sidebar border-right**

In `e2e/sidebar.spec.ts`, find lines 39-43:

```ts
test('S1: no visible border between sidebar and terminal', async ({ appWindow }) => {
  const sidebar = appWindow.locator('[data-testid="sidebar"]')
  const borderRight = await sidebar.evaluate((el) => getComputedStyle(el).borderRightWidth)
  expect(borderRight).toBe('0px')
})
```

Replace with:

```ts
test('S1: sidebar has 1px border separating it from terminal', async ({ appWindow }) => {
  const sidebar = appWindow.locator('[data-testid="sidebar"]')
  const borderRight = await sidebar.evaluate((el) => getComputedStyle(el).borderRightWidth)
  expect(borderRight).toBe('1px')
})
```

**Step 9: Update e2e test — project name font size**

In `e2e/sidebar.spec.ts`, find lines 57-63:

```ts
test('S2: project names have correct font size', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)
  const project = appWindow.locator('[data-testid="project-name"]').first()
  await expect(project).toBeVisible({ timeout: 5000 })
  const fontSize = await project.evaluate((el) => getComputedStyle(el).fontSize)
  expect(fontSize).toBe('11px')
})
```

Replace with:

```ts
test('S2: project names have correct font size', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)
  const project = appWindow.locator('[data-testid="project-name"]').first()
  await expect(project).toBeVisible({ timeout: 5000 })
  const fontSize = await project.evaluate((el) => getComputedStyle(el).fontSize)
  expect(fontSize).toBe('10px')
})
```

**Step 10: Update e2e test — session name font size**

In `e2e/sidebar.spec.ts`, find lines 96-110 (the session name font size test):

```ts
test('S3: session names have correct font size', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)
  const project = appWindow.locator('[data-testid="project-item"]').first()
  await expect(project).toBeVisible({ timeout: 5000 })
  // Ensure sessions are visible
  const selected = await project.getAttribute('data-selected')
  if (selected !== 'true') {
    await project.click()
    await appWindow.waitForTimeout(200)
  }
  const session = appWindow.locator('[data-testid="session-name"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  const fontSize = await session.evaluate((el) => getComputedStyle(el).fontSize)
  expect(fontSize).toBe('10px')
})
```

Replace with:

```ts
test('S3: session names have correct font size', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)
  const project = appWindow.locator('[data-testid="project-item"]').first()
  await expect(project).toBeVisible({ timeout: 5000 })
  // Ensure sessions are visible
  const selected = await project.getAttribute('data-selected')
  if (selected !== 'true') {
    await project.click()
    await appWindow.waitForTimeout(200)
  }
  const session = appWindow.locator('[data-testid="session-name"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  const fontSize = await session.evaluate((el) => getComputedStyle(el).fontSize)
  expect(fontSize).toBe('12px')
})
```

**Step 11: Build and test**

```bash
cd /Users/chrispark/Projects/amplifier-canvas
npm run build && npx playwright test
```

Expected: All 61 tests pass.

**Step 12: Commit**

```bash
git add src/renderer/src/components/Sidebar.tsx e2e/sidebar.spec.ts && git commit -m "style: sidebar polish — amber status dots, active indicator, design-system tokens"
```

---

## Task 4: Viewer + FileBrowser Polish

**Files:**
- Modify: `src/renderer/src/components/Viewer.tsx` (colors, width, button styles)
- Modify: `src/renderer/src/components/FileBrowser.tsx` (row height, icons, breadcrumbs)

**Step 1: Update STATUS_COLORS in `src/renderer/src/components/Viewer.tsx`**

Find lines 7-13:

```tsx
const STATUS_COLORS: Record<SessionStatus, string> = {
  running: '#3B82F6',
  active: '#3B82F6',
  needs_input: '#F59E0B',
  done: '#10B981',
  failed: '#EF4444',
}
```

Replace with:

```tsx
const STATUS_COLORS: Record<SessionStatus, string> = {
  running: '#F59E0B',
  active: '#F59E0B',
  needs_input: '#F59E0B',
  done: '#4CAF74',
  failed: '#EF4444',
}
```

**Step 2: Update Viewer panel container styles**

Find lines 42-51:

```tsx
      style={{
        width: 350,
        minWidth: 350,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#F2F0EB',
        borderLeft: '1px solid rgba(0,0,0,0.08)',
        overflow: 'hidden',
      }}
```

Replace with:

```tsx
      style={{
        width: 340,
        minWidth: 340,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-right)',
        borderLeft: '1px solid var(--border)',
        overflow: 'hidden',
      }}
```

**Step 3: Update Viewer header styles**

Find lines 57-59:

```tsx
          padding: '10px 12px',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
          display: 'flex',
```

Replace with:

```tsx
          padding: '10px 12px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
```

**Step 4: Update Viewer header text colors**

Find the project name style (line 81):

```tsx
              color: '#2C2825',
```

Replace with:

```tsx
              color: 'var(--text-primary)',
```

Find the session ID style (line 92):

```tsx
              color: '#8B8B90',
```

Replace with:

```tsx
              color: 'var(--text-muted)',
```

**Step 5: Update close button with hover support**

Find lines 101-113 (close button):

```tsx
        <button
          data-testid="viewer-close"
          onClick={() => selectSession(null)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            color: '#8B8B90',
            padding: '2px 4px',
            lineHeight: 1,
          }}
        >
```

Replace with:

```tsx
        <button
          data-testid="viewer-close"
          aria-label="Close viewer"
          onClick={() => selectSession(null)}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#1C1A16' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#8A8278' }}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            color: 'var(--text-muted)',
            padding: '2px 4px',
            lineHeight: 1,
          }}
        >
```

**Step 6: Update recent files section border**

Find line 124:

```tsx
            borderBottom: '1px solid rgba(0,0,0,0.08)',
```

Replace with:

```tsx
            borderBottom: '1px solid var(--border)',
```

**Step 7: Update recent file item text color**

Find line 171:

```tsx
                  <span style={{ color: '#2C2825' }}>{fileName}</span>
```

Replace with:

```tsx
                  <span style={{ color: 'var(--text-primary)' }}>{fileName}</span>
```

**Step 8: Update back button style**

Find lines 193-199 (back to files button):

```tsx
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '11px',
                color: '#3B82F6',
                padding: '4px 0 8px 0',
              }}
```

Replace with:

```tsx
              aria-label="Back to files"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '11px',
                color: 'var(--text-muted)',
                padding: '4px 0 8px 0',
              }}
```

**Step 9: Update file name heading and border**

Find lines 205-207:

```tsx
                color: '#2C2825',
                marginBottom: '8px',
                paddingBottom: '6px',
                borderBottom: '1px solid rgba(0,0,0,0.08)',
```

Replace with:

```tsx
                color: 'var(--text-primary)',
                marginBottom: '8px',
                paddingBottom: '6px',
                borderBottom: '1px solid var(--border)',
```

**Step 10: Update "No project directory" color**

Find line 225:

```tsx
              color: '#8B8B90',
```

Replace with:

```tsx
              color: 'var(--text-muted)',
```

**Step 11: Update FileBrowser — root font size and breadcrumb colors**

In `src/renderer/src/components/FileBrowser.tsx`, find line 67:

```tsx
    <div data-testid="file-browser" style={{ fontSize: '12px' }}>
```

Replace with:

```tsx
    <div data-testid="file-browser" style={{ fontSize: '13px' }}>
```

**Step 12: Update breadcrumb colors**

Find line 76:

```tsx
          color: '#8B8B90',
```

Replace with:

```tsx
          color: 'var(--text-muted)',
```

Find line 83 (root link color):

```tsx
          style={{ cursor: 'pointer', color: '#3B82F6' }}
```

Replace with:

```tsx
          style={{ cursor: 'pointer', color: 'var(--text-primary)' }}
```

Find line 97 (breadcrumb part color):

```tsx
                  color: i === breadcrumbParts.length - 1 ? '#2C2825' : '#3B82F6',
```

Replace with:

```tsx
                  color: i === breadcrumbParts.length - 1 ? 'var(--text-primary)' : 'var(--text-primary)',
```

**Step 13: Update file entry styles — row height, icon, hover**

Find lines 149-165 (file entry div):

```tsx
            style={{
              padding: '3px 4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              borderRadius: '3px',
              fontSize: '11px',
              color: '#2C2825',
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLDivElement).style.backgroundColor =
                'rgba(44, 40, 37, 0.06)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'
            }}
```

Replace with:

```tsx
            style={{
              height: 28,
              padding: '0 4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              borderRadius: '3px',
              fontSize: '13px',
              color: 'var(--text-primary)',
              transition: 'background 0.12s ease',
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLDivElement).style.backgroundColor = '#E8E0D4'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'
            }}
```

Key changes: height 28px, fontSize 13px, hover color is `--bg-sidebar-active` (#E8E0D4), transition added.

**Step 14: Replace emoji icons with text indicators**

Find lines 167-169:

```tsx
            <span style={{ fontSize: '12px', width: '16px', textAlign: 'center' }}>
              {entry.isDirectory ? '\uD83D\uDCC1' : '\uD83D\uDCC4'}
            </span>
```

Replace with:

```tsx
            <span style={{ fontSize: '13px', width: '16px', textAlign: 'center', color: 'var(--text-very-muted)', fontFamily: 'var(--font-mono)' }}>
              {entry.isDirectory ? '\u25B8' : '\u2261'}
            </span>
```

This replaces:
- 📁 (folder emoji) with ▸ (U+25B8, right-pointing triangle — like canvas.html folder indicator)
- 📄 (document emoji) with ≡ (U+2261, triple bar — matching canvas.html `.file-icon`)

**Step 15: Update loading/empty state colors**

Find every instance of `color: '#8B8B90'` in FileBrowser.tsx (lines 128, 135) and replace each with:

```tsx
color: 'var(--text-muted)'
```

Similarly update line 115:
```tsx
            color: '#8B8B90',
```
to:
```tsx
            color: 'var(--text-muted)',
```

**Step 16: Build and test**

```bash
cd /Users/chrispark/Projects/amplifier-canvas
npm run build && npx playwright test
```

Expected: All 61 tests pass. File browser tests use `data-testid="file-entry"` with `hasText` for file names, so changing icons from emoji to text doesn't affect them.

**Step 17: Commit**

```bash
git add src/renderer/src/components/Viewer.tsx src/renderer/src/components/FileBrowser.tsx && git commit -m "style: viewer + file browser polish — design-system tokens, text icons, hover states"
```

---

## Task 5: Code Renderer Dark Theme

**Files:**
- Modify: `src/renderer/src/components/CodeRenderer.tsx` (complete visual overhaul)

**Step 1: Update the loading state color**

Find line 88:

```tsx
      <div style={{ color: '#8B8B90', fontSize: '11px', padding: '8px 0' }}>
```

Replace with:

```tsx
      <div style={{ color: 'var(--text-muted)', fontSize: '11px', padding: '8px 0' }}>
```

**Step 2: Replace the `<style>` block with dark theme colors**

Find lines 98-114 (the inline style block):

```tsx
      <style>{`
        [data-testid="code-renderer"] .hljs-keyword { color: #CF222E; }
        [data-testid="code-renderer"] .hljs-string { color: #0A3069; }
        [data-testid="code-renderer"] .hljs-number { color: #0550AE; }
        [data-testid="code-renderer"] .hljs-comment { color: #6E7781; font-style: italic; }
        [data-testid="code-renderer"] .hljs-function { color: #8250DF; }
        [data-testid="code-renderer"] .hljs-title { color: #8250DF; }
        [data-testid="code-renderer"] .hljs-type { color: #953800; }
        [data-testid="code-renderer"] .hljs-built_in { color: #0550AE; }
        [data-testid="code-renderer"] .hljs-attr { color: #0550AE; }
        [data-testid="code-renderer"] .hljs-variable { color: #953800; }
        [data-testid="code-renderer"] .hljs-params { color: #953800; }
        [data-testid="code-renderer"] .hljs-meta { color: #CF222E; }
        [data-testid="code-renderer"] .hljs-selector-class { color: #0550AE; }
        [data-testid="code-renderer"] .hljs-selector-tag { color: #116329; }
        [data-testid="code-renderer"] .hljs-property { color: #0550AE; }
      `}</style>
```

Replace with:

```tsx
      <style>{`
        [data-testid="code-renderer"] .hljs-keyword { color: #C4784A; }
        [data-testid="code-renderer"] .hljs-string { color: #4CAF74; }
        [data-testid="code-renderer"] .hljs-number { color: #A09888; }
        [data-testid="code-renderer"] .hljs-comment { color: #5A6855; font-style: italic; }
        [data-testid="code-renderer"] .hljs-function { color: #F59E0B; }
        [data-testid="code-renderer"] .hljs-title { color: #F59E0B; }
        [data-testid="code-renderer"] .hljs-type { color: #8A9E8A; }
        [data-testid="code-renderer"] .hljs-built_in { color: #5A8A9A; }
        [data-testid="code-renderer"] .hljs-attr { color: #C8C4BC; }
        [data-testid="code-renderer"] .hljs-variable { color: #C8C4BC; }
        [data-testid="code-renderer"] .hljs-params { color: #A09888; }
        [data-testid="code-renderer"] .hljs-meta { color: #C4784A; }
        [data-testid="code-renderer"] .hljs-selector-class { color: #5A8A9A; }
        [data-testid="code-renderer"] .hljs-selector-tag { color: #4CAF74; }
        [data-testid="code-renderer"] .hljs-property { color: #5A8A9A; }
      `}</style>
```

This is a warm dark palette matching the terminal aesthetic:
- Keywords: amber-orange (#C4784A)
- Strings: green (#4CAF74)
- Comments: muted olive (#5A6855), italic
- Numbers: very-muted (#A09888)
- Functions/titles: amber (#F59E0B)
- Types: sage (#8A9E8A)
- Built-ins: teal (#5A8A9A)
- Attrs/variables: terminal text (#C8C4BC)

**Step 3: Update the code container styles to dark theme**

Find lines 115-122:

```tsx
      <div
        style={{
          display: 'flex',
          fontSize: '12px',
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          lineHeight: 1.5,
          overflow: 'auto',
        }}
      >
```

Replace with:

```tsx
      <div
        style={{
          display: 'flex',
          fontSize: '11px',
          fontFamily: "'SFMono-Regular', Menlo, Consolas, monospace",
          lineHeight: 1.65,
          overflow: 'auto',
          backgroundColor: '#0F0E0C',
          color: '#C8C4BC',
          borderRadius: '4px',
          padding: '12px 0',
        }}
      >
```

**Step 4: Update line numbers (gutter) styles**

Find line 125:

```tsx
        <div style={{ color: '#8B8B90', textAlign: 'right', paddingRight: '12px', userSelect: 'none', minWidth: '32px', borderRight: '1px solid #E8E6E1', marginRight: '12px' }}>
```

Replace with:

```tsx
        <div style={{ color: '#C8C4BC', opacity: 0.45, textAlign: 'right', paddingRight: '12px', paddingLeft: '12px', userSelect: 'none', minWidth: '36px', borderRight: '1px solid rgba(255,255,255,0.06)', marginRight: '12px' }}>
```

Key changes: color matches terminal text with 0.45 opacity, wider gutter (36px), subtle border, padding-left added.

**Step 5: Build and test**

```bash
cd /Users/chrispark/Projects/amplifier-canvas
npm run build && npx playwright test
```

Expected: All 61 tests pass. Code renderer tests check `data-testid="code-renderer"` existence, not colors.

**Step 6: Commit**

```bash
git add src/renderer/src/components/CodeRenderer.tsx && git commit -m "style: code renderer dark theme — warm near-black bg with amber syntax palette"
```

---

## Task 6: Markdown Renderer + ImageRenderer + Final Sweep

**Files:**
- Modify: `src/renderer/src/components/MarkdownRenderer.tsx` (text colors, font sizes, code blocks)
- Modify: `src/renderer/src/components/ImageRenderer.tsx` (max-height, error styling)

**Step 1: Update MarkdownRenderer text color**

In `src/renderer/src/components/MarkdownRenderer.tsx`, find lines 39-43:

```tsx
      style={{
        fontSize: '13px',
        lineHeight: 1.6,
        color: '#2C2825',
      }}
```

Replace with:

```tsx
      style={{
        fontSize: '13px',
        lineHeight: 1.6,
        color: 'var(--text-primary)',
      }}
```

**Step 2: Update the MarkdownRenderer `<style>` block**

Find lines 45-55:

```tsx
      <style>{`
        [data-testid="markdown-renderer"] h1 { font-size: 20px; font-weight: 600; margin: 16px 0 8px 0; border-bottom: 1px solid #E8E6E1; padding-bottom: 4px; }
        [data-testid="markdown-renderer"] h2 { font-size: 16px; font-weight: 600; margin: 14px 0 6px 0; }
        [data-testid="markdown-renderer"] h3 { font-size: 14px; font-weight: 600; margin: 12px 0 4px 0; }
        [data-testid="markdown-renderer"] p { margin: 8px 0; }
        [data-testid="markdown-renderer"] ul, [data-testid="markdown-renderer"] ol { padding-left: 20px; margin: 8px 0; }
        [data-testid="markdown-renderer"] li { margin: 2px 0; }
        [data-testid="markdown-renderer"] code { background-color: #F2F0EB; padding: 1px 4px; border-radius: 3px; font-size: 12px; font-family: Menlo, Monaco, 'Courier New', monospace; }
        [data-testid="markdown-renderer"] pre { background-color: #F2F0EB; padding: 12px; border-radius: 4px; overflow-x: auto; }
        [data-testid="markdown-renderer"] pre code { background: none; padding: 0; }
      `}</style>
```

Replace with:

```tsx
      <style>{`
        [data-testid="markdown-renderer"] h1 { font-size: 18px; font-weight: 600; margin: 16px 0 8px 0; border-bottom: 1px solid var(--border); padding-bottom: 4px; }
        [data-testid="markdown-renderer"] h2 { font-size: 15px; font-weight: 600; margin: 14px 0 6px 0; }
        [data-testid="markdown-renderer"] h3 { font-size: 13px; font-weight: 600; margin: 12px 0 4px 0; }
        [data-testid="markdown-renderer"] p { margin: 8px 0; }
        [data-testid="markdown-renderer"] ul, [data-testid="markdown-renderer"] ol { padding-left: 20px; margin: 8px 0; list-style-type: disc; }
        [data-testid="markdown-renderer"] ol { list-style-type: decimal; }
        [data-testid="markdown-renderer"] li { margin: 2px 0; }
        [data-testid="markdown-renderer"] code { background-color: var(--bg-page); padding: 1px 4px; border-radius: 3px; font-size: 12px; font-family: 'SFMono-Regular', Menlo, Consolas, monospace; }
        [data-testid="markdown-renderer"] pre { background-color: #0F0E0C; color: #C8C4BC; padding: 12px; border-radius: 4px; overflow-x: auto; }
        [data-testid="markdown-renderer"] pre code { background: none; padding: 0; color: inherit; font-family: 'SFMono-Regular', Menlo, Consolas, monospace; }
        [data-testid="markdown-renderer"] a { color: var(--text-primary); }
        [data-testid="markdown-renderer"] blockquote { border-left: 2px solid var(--border); padding-left: 12px; color: var(--text-muted); margin: 8px 0; }
      `}</style>
```

Key changes:
- h1: 18px (was 20px), border uses `var(--border)` (was #E8E6E1)
- h2: 15px (was 16px)
- h3: 13px (was 14px)
- Lists use `disc` style (proper bullets, not browser default markers)
- Inline code: bg uses `var(--bg-page)`, font uses SFMono-Regular (was Menlo, Monaco)
- Fenced code blocks (`pre`): DARK background (#0F0E0C), light text (#C8C4BC) — matches terminal/code renderer
- Added link and blockquote styles

**Step 3: Update MarkdownRenderer loading state**

Find line 30:

```tsx
      <div style={{ color: '#8B8B90', fontSize: '11px', padding: '8px 0' }}>
```

Replace with:

```tsx
      <div style={{ color: 'var(--text-muted)', fontSize: '11px', padding: '8px 0' }}>
```

**Step 4: Update ImageRenderer — max height and error styling**

In `src/renderer/src/components/ImageRenderer.tsx`, find lines 23-24:

```tsx
        <div style={{ color: '#8B8B90', fontSize: '11px', textAlign: 'center' }}>
          Failed to load image: {fileName}
```

Replace with:

```tsx
        <div style={{ color: 'var(--text-muted)', fontSize: '11px', textAlign: 'center' }}>
          Failed to load image: {fileName}
```

Find line 46 (max-height):

```tsx
          maxHeight: '80vh',
```

Replace with:

```tsx
          maxHeight: '60vh',
```

A more reasonable max-height prevents images from dominating the viewer panel.

**Step 5: Build and test**

```bash
cd /Users/chrispark/Projects/amplifier-canvas
npm run build && npx playwright test
```

Expected: All 61 tests pass.

**Step 6: Final sweep — verify no remaining hardcoded colors**

Run this grep to find any remaining old hardcoded hex values in renderer source:

```bash
cd /Users/chrispark/Projects/amplifier-canvas
grep -rn '#F2F0EB\|#2C2825\|#8B8B90\|#F5F3EE\|#3B82F6\|#10B981\|#E8E6E1' src/renderer/
```

Expected: No matches. If any remain, update them to use CSS variables:
- `#F2F0EB` → `var(--bg-page)` or `var(--bg-sidebar)`
- `#2C2825` → `var(--text-primary)`
- `#8B8B90` → `var(--text-muted)`
- `#F5F3EE` → `var(--bg-header)`
- `#3B82F6` → `var(--amber)` or `var(--text-muted)` (context-dependent — was used for links/running status)
- `#10B981` → `var(--green)`
- `#E8E6E1` → `var(--border)`

**Step 7: Commit**

```bash
git add src/renderer/src/components/MarkdownRenderer.tsx src/renderer/src/components/ImageRenderer.tsx && git commit -m "style: markdown renderer + image renderer polish, final token sweep"
```

---

## Post-Flight Verification

After all 6 tasks are complete, run the full suite one final time:

```bash
cd /Users/chrispark/Projects/amplifier-canvas
npm run build && npx playwright test
```

All 61 tests must pass. Then verify the visual result:

```bash
cd /Users/chrispark/Projects/amplifier-canvas
npm run dev
```

Eyeball check:
- [ ] Header bar: warm tan (#E8E2D8), 38px, "Amplifier Canvas" in 13px bold
- [ ] Sidebar: #F0EBE3 bg, 1px right border, project labels uppercase 10px
- [ ] Session rows: 36px, amber left bar on active, amber dot for running
- [ ] Pane title bar: 28px, #DDD5C8, "Terminal" in muted 11px
- [ ] Terminal: near-black #0F0E0C, warm text, **AMBER cursor**
- [ ] Viewer: #F7F4EF bg, 340px, left border
- [ ] File browser: 28px rows, ▸ for folders, ≡ for files
- [ ] Code renderer: dark background matching terminal, amber syntax highlights
- [ ] Markdown: dark fenced code blocks, light inline code

---

## Files Changed Summary

| File | Task | Change |
|------|------|--------|
| `src/renderer/src/App.css` | 1 | CSS variables + base styles |
| `src/renderer/src/App.tsx` | 1, 2 | Header bar + pane title bar + terminal container |
| `src/main/index.ts` | 1 | BrowserWindow background color |
| `src/renderer/src/components/Terminal.tsx` | 2 | xterm theme + font |
| `src/renderer/src/components/Sidebar.tsx` | 3 | Full style overhaul |
| `src/renderer/src/components/Viewer.tsx` | 4 | Colors, width, button styles |
| `src/renderer/src/components/FileBrowser.tsx` | 4 | Row height, icons, breadcrumbs |
| `src/renderer/src/components/CodeRenderer.tsx` | 5 | Dark theme overhaul |
| `src/renderer/src/components/MarkdownRenderer.tsx` | 6 | Typography, dark code blocks |
| `src/renderer/src/components/ImageRenderer.tsx` | 6 | Max-height, error styling |
| `e2e/terminal.spec.ts` | 1 | Background color assertion |
| `e2e/sidebar.spec.ts` | 1, 3 | Color + border + font size assertions |

Total: 10 source files + 2 test files across 6 tasks.