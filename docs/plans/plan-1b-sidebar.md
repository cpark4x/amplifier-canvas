# Plan 1B: Sidebar — Implementation Plan

> **Execution:** Use the subagent-driven-development workflow to implement this plan.

**Goal:** Implement the sidebar layer (S1-S5), producing a left panel that shows all Amplifier sessions grouped by project with real-time status updates.

**Architecture:** The sidebar is a read-only view over Amplifier's session data on disk. The main process discovers sessions by scanning `~/.amplifier/projects/*/sessions/*/`, parses `events.jsonl` files to derive session status, and pushes a canonical `SessionState[]` to the renderer via IPC. The renderer stores this in Zustand and renders it as a collapsible sidebar with status dots. Real-time updates come from dual event ingestion: a canvas-relay hook module for Canvas-started sessions (~10ms latency) and chokidar file watchers for external sessions (~500ms latency). Session lifecycle is persisted in SQLite (canvas.db). When events arrive (via hook or file watcher), the state-aggregator updates canvas.db and pushes canonical state to the renderer via IPC.

**Tech Stack:** Electron (from Plan 1A), React, TypeScript, Zustand 5, better-sqlite3 (installed in Plan 1A), chokidar 4 (file watching), Playwright (E2E testing)

**This is Plan 1B of 3.** Plan 1A (Scaffold + Terminal) is the prerequisite. Plan 1C (Viewer + Integration) follows.

**Design document:** `docs/plans/2026-04-03-canvas-phase1-design.md`
**Architecture reference:** `ARCHITECTURE.md`
**Prerequisite:** `docs/plans/plan-1a-scaffold-terminal.md` — must be complete before starting

**Design tokens (from `components.html`):**
```
--bg-sidebar:        #F0EBE3      (sidebar background)
--bg-sidebar-active: #E8E0D4      (selected item)
--bg-terminal:       #0F0E0C      (terminal background)
--text-primary:      #1C1A16      (main text)
--text-muted:        #8A8278      (secondary text)
--text-very-muted:   #A09888      (tertiary text)
--border:            rgba(0,0,0,0.08)
--amber:             #F59E0B      (running status)
--blue:              #5B8FD4      (needs input status)
--green:             #3D9A65      (done status)
--red:               #CC5555      (failed status)
--font-ui:           -apple-system, BlinkMacSystemFont, 'Inter', sans-serif
--font-mono:         'SFMono-Regular', Menlo, Consolas, monospace
```

**Amplifier session data layout (real on-disk structure):**
```
~/.amplifier/projects/
  <slug>/                            # path-encoded working dir, e.g. -Users-chrispark-Projects-myapp
    sessions/
      <uuid>/                        # e.g. 248f2f14-8c70-4042-82f5-a3d54e9563db
        events.jsonl                 # event stream (one JSON object per line)
        metadata.json                # { session_id, created, bundle, model, turn_count }
        transcript.jsonl             # conversation transcript
```

**events.jsonl line format:**
```json
{"ts":"2026-01-21T19:29:07.834+00:00","lvl":"INFO","schema":{"name":"amplifier.log","ver":"1.0.0"},"event":"session:start","session_id":"...","data":{"parent_id":null}}
```

**Key event types for status derivation:**
- `session:start` — session began
- `session:end` — session ended (done)
- `prompt:submit` — user sent input
- `prompt:complete` — AI finished responding (if last event = waiting for user)
- `tool:pre` / `tool:post` — tool calls (running indicator)
- `execution:start` / `execution:end` — execution lifecycle

---

## Section 0: Infrastructure — SQLite + Hook Receiver (Tasks 0a–0c)

**Feature:** Initialize the SQLite data layer and hook event receiver that the sidebar will build on. These provide the persistence and real-time event ingestion that the state-aggregator (Section 2) consumes.

---

### Task 0a: Create SQLite state store

**Files:**
- Create: `src/main/state-store.ts`
- Modify: `src/shared/constants.ts`

**Step 1: Update `src/shared/constants.ts`**

Add after the existing `AMPLIFIER_PROJECTS_DIR` constant:

```typescript
import { app } from 'electron'

export const CANVAS_DATA_DIR = join(app.getPath('userData'), 'canvas')
export const CANVAS_DB_PATH = join(CANVAS_DATA_DIR, 'canvas.db')
export const HOOK_RECEIVER_PORT = 19542
```

> **Note:** `app.getPath('userData')` resolves to `~/.config/amplifier-canvas` on Linux, `~/Library/Application Support/amplifier-canvas` on macOS. The `canvas.db` file lives inside Canvas's own data directory, never inside `~/.amplifier/`.

**Step 2: Create `src/main/state-store.ts`**

```typescript
import Database from 'better-sqlite3'
import { mkdirSync, existsSync } from 'fs'
import { dirname } from 'path'
import { CANVAS_DB_PATH } from '../shared/constants'

let db: Database.Database | null = null

export function initDb(): Database.Database {
  if (db) return db

  // Ensure directory exists
  const dir = dirname(CANVAS_DB_PATH)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  db = new Database(CANVAS_DB_PATH)

  // WAL mode for crash safety and concurrent reads
  db.pragma('journal_mode = WAL')

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      last_activity TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_slug TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      started_by TEXT NOT NULL DEFAULT 'external',
      byte_offset INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      bundle TEXT,
      model TEXT,
      turn_count INTEGER DEFAULT 0,
      FOREIGN KEY (project_slug) REFERENCES projects(slug)
    );

    CREATE TABLE IF NOT EXISTS ui_preferences (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  return db
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized. Call initDb() first.')
  return db
}

// --- Project CRUD ---

export function upsertProject(slug: string, name: string, path: string): void {
  const stmt = getDb().prepare(`
    INSERT INTO projects (slug, name, path, last_activity)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(slug) DO UPDATE SET
      name = excluded.name,
      path = excluded.path,
      last_activity = datetime('now')
  `)
  stmt.run(slug, name, path)
}

export function getProjects(): Array<{ slug: string; name: string; path: string; last_activity: string | null }> {
  return getDb().prepare('SELECT * FROM projects ORDER BY last_activity DESC').all() as any[]
}

// --- Session CRUD ---

export function upsertSession(
  id: string,
  projectSlug: string,
  startedAt: string,
  startedBy: 'canvas' | 'external' = 'external'
): void {
  const stmt = getDb().prepare(`
    INSERT INTO sessions (id, project_slug, started_at, started_by)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      started_by = CASE WHEN sessions.started_by = 'canvas' THEN 'canvas' ELSE excluded.started_by END
  `)
  stmt.run(id, projectSlug, startedAt, startedBy)
}

export function getSessionsByProject(projectSlug: string): Array<{
  id: string; project_slug: string; started_at: string; ended_at: string | null;
  started_by: string; byte_offset: number; status: string; bundle: string | null;
  model: string | null; turn_count: number;
}> {
  return getDb().prepare(
    'SELECT * FROM sessions WHERE project_slug = ? ORDER BY started_at DESC'
  ).all(projectSlug) as any[]
}

export function updateByteOffset(sessionId: string, offset: number): void {
  getDb().prepare('UPDATE sessions SET byte_offset = ? WHERE id = ?').run(offset, sessionId)
}

export function updateSessionStatus(sessionId: string, status: string, endedAt?: string): void {
  if (endedAt) {
    getDb().prepare('UPDATE sessions SET status = ?, ended_at = ? WHERE id = ?').run(status, endedAt, sessionId)
  } else {
    getDb().prepare('UPDATE sessions SET status = ? WHERE id = ?').run(status, sessionId)
  }
}

export function getByteOffset(sessionId: string): number {
  const row = getDb().prepare('SELECT byte_offset FROM sessions WHERE id = ?').get(sessionId) as any
  return row?.byte_offset ?? 0
}

// --- UI Preferences ---

export function setPreference(key: string, value: string): void {
  getDb().prepare(
    'INSERT INTO ui_preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value)
}

export function getPreference(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM ui_preferences WHERE key = ?').get(key) as any
  return row?.value ?? null
}

// --- Recovery ---

export function isDbPopulated(): boolean {
  const row = getDb().prepare('SELECT COUNT(*) as count FROM projects').get() as any
  return row.count > 0
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}

// --- Watcher helpers ---

export function getExternalActiveSessions(): Array<{ id: string; project_slug: string }> {
  return getDb().prepare(
    "SELECT id, project_slug FROM sessions WHERE started_by = 'external' AND status NOT IN ('done', 'failed')"
  ).all() as any[]
}
```

**Step 3: Verify the build**

```bash
npm run build
```

Expected: Build succeeds. The `better-sqlite3` native module should already be built from Plan 1A's postinstall script.

---

### Task 0b: Create hook event receiver

**Files:**
- Create: `src/main/hook-receiver.ts`

**Step 1: Create `src/main/hook-receiver.ts`**

```typescript
import { createServer, IncomingMessage, ServerResponse } from 'http'
import { HOOK_RECEIVER_PORT } from '../shared/constants'

export interface HookEvent {
  sessionId: string
  event: string
  data?: Record<string, unknown>
}

type HookEventHandler = (event: HookEvent) => void

let handler: HookEventHandler = () => {} // No-op until wired

export function setHookEventHandler(fn: HookEventHandler): void {
  handler = fn
}

export function startHookReceiver(): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      // Only accept POST /event
      if (req.method !== 'POST' || req.url !== '/event') {
        res.writeHead(404)
        res.end()
        return
      }

      // Only accept localhost connections
      const remoteAddr = req.socket.remoteAddress
      if (remoteAddr !== '127.0.0.1' && remoteAddr !== '::1' && remoteAddr !== '::ffff:127.0.0.1') {
        res.writeHead(403)
        res.end()
        return
      }

      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        try {
          const event = JSON.parse(body) as HookEvent
          if (!event.sessionId || !event.event) {
            res.writeHead(400)
            res.end(JSON.stringify({ error: 'Missing sessionId or event' }))
            return
          }
          handler(event)
          res.writeHead(200)
          res.end(JSON.stringify({ ok: true }))
        } catch {
          res.writeHead(400)
          res.end(JSON.stringify({ error: 'Invalid JSON' }))
        }
      })
    })

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        // Port already in use — another Canvas instance may be running
        console.warn(`Hook receiver port ${HOOK_RECEIVER_PORT} already in use. Hook events will not be received.`)
        resolve() // Graceful degradation — don't crash
      } else {
        reject(err)
      }
    })

    server.listen(HOOK_RECEIVER_PORT, '127.0.0.1', () => {
      console.log(`Hook receiver listening on 127.0.0.1:${HOOK_RECEIVER_PORT}`)
      resolve()
    })
  })
}
```

**Step 2: Verify the build**

```bash
npm run build
```

Expected: Build succeeds.

---

### Task 0c: Integrate infrastructure into main process

**Files:**
- Modify: `src/main/index.ts`

**Step 1: Update `src/main/index.ts`**

Add imports at the top:

```typescript
import { initDb, closeDb, upsertSession, updateSessionStatus } from './state-store'
import { startHookReceiver, setHookEventHandler } from './hook-receiver'
import { pushSessionUpdate } from './ipc'
```

In the `app.whenReady()` block, BEFORE creating the window, add:

```typescript
  // Initialize infrastructure
  initDb()
  startHookReceiver().catch((err) => {
    console.error('Failed to start hook receiver:', err)
    // Graceful degradation — Canvas works without hook
  })
```

After the window is created and IPC handlers are registered, wire the hook event handler:

```typescript
  // Wire hook events to state aggregator
  setHookEventHandler((event) => {
    switch (event.event) {
      case 'session:start':
        // canvas-relay sends project_slug in data; fall back to 'unknown' if missing
        upsertSession(
          event.sessionId,
          (event.data?.project_slug as string) || 'unknown',
          (event.data?.startedAt as string) || new Date().toISOString(),
          'canvas'
        )
        break
      case 'session:end':
        updateSessionStatus(event.sessionId, 'done', new Date().toISOString())
        break
      default:
        // Other events (tool:pre, tool:post, prompt:submit, etc.) — status stays unchanged
        break
    }
    // Push updated state to renderer
    pushSessionUpdate(mainWindow)
  })
```

In `app.on('before-quit')` (or create one if it doesn't exist):

```typescript
app.on('before-quit', () => {
  closeDb()
})
```

**Step 2: Verify build and test**

```bash
npm run build && npx playwright test
```

Expected: All existing tests pass. The SQLite database file should be created at the Canvas data directory. Hook receiver should be listening (check console output).

**Step 3: Commit**

```bash
git add -A
git commit -m "feat(infra): add SQLite state store and hook event receiver

- state-store.ts: better-sqlite3 with WAL mode, projects/sessions/preferences tables
- hook-receiver.ts: localhost HTTP server for canvas-relay hook events
- Both initialized in main process on app.whenReady()
- Graceful degradation: hook receiver is optional, SQLite recovers from deletion"
```

---

## Section 1: S1 — Sidebar Shell (Tasks 1–3)

**Feature:** 200px left panel alongside the terminal, collapsible via toggle button. Matches warm design tokens from the component library.

---

### Task 1: Write E2E tests for sidebar shell

**Files:**
- Create: `e2e/sidebar.spec.ts`

**Step 1: Create `e2e/sidebar.spec.ts`**

```typescript
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  app = await electron.launch({
    args: ['.'],
    env: { ...process.env, NODE_ENV: 'test' },
  })
  page = await app.firstWindow()
})

test.afterAll(async () => {
  await app.close()
})

// --- S1: Sidebar Shell ---

test('S1: sidebar element exists in the layout', async () => {
  const sidebar = page.locator('[data-testid="sidebar"]')
  await expect(sidebar).toBeVisible({ timeout: 5000 })
})

test('S1: sidebar has approximately 200px width', async () => {
  const sidebar = page.locator('[data-testid="sidebar"]')
  const box = await sidebar.boundingBox()
  expect(box).toBeTruthy()
  // Allow some tolerance (190-250px)
  expect(box!.width).toBeGreaterThanOrEqual(190)
  expect(box!.width).toBeLessThanOrEqual(250)
})

test('S1: sidebar has correct background color (warm palette)', async () => {
  const sidebar = page.locator('[data-testid="sidebar"]')
  const bgColor = await sidebar.evaluate((el) => {
    return window.getComputedStyle(el).backgroundColor
  })
  // --bg-sidebar: #F0EBE3 = rgb(240, 235, 227)
  expect(bgColor).toBe('rgb(240, 235, 227)')
})

test('S1: sidebar collapse toggle exists and works', async () => {
  const toggle = page.locator('[data-testid="sidebar-toggle"]')
  await expect(toggle).toBeVisible()

  // Click to collapse
  await toggle.click()

  // Sidebar should be hidden or have zero/minimal width
  const sidebar = page.locator('[data-testid="sidebar"]')
  const box = await sidebar.boundingBox()
  // When collapsed, width should be 0 or very small
  expect(box === null || box.width < 10).toBeTruthy()

  // Click to expand
  await toggle.click()

  // Sidebar should be back to ~200px
  const expandedBox = await sidebar.boundingBox()
  expect(expandedBox).toBeTruthy()
  expect(expandedBox!.width).toBeGreaterThanOrEqual(190)
})

test('S1: terminal still exists alongside sidebar', async () => {
  // Terminal must not be disrupted by sidebar
  const terminal = page.locator('.xterm')
  await expect(terminal).toBeVisible({ timeout: 5000 })
})
```

**Step 2: Build and run test to verify it fails**

```bash
npm run build && npx playwright test e2e/sidebar.spec.ts
```

Expected: FAIL — no `[data-testid="sidebar"]` element exists yet.

---

### Task 2: Implement Sidebar shell component and update App layout

**Files:**
- Create: `src/renderer/src/components/Sidebar.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/App.css`

**Step 1: Create `src/renderer/src/components/Sidebar.tsx`**

```tsx
import { useState } from 'react'

function Sidebar(): React.ReactElement {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <>
      <div
        data-testid="sidebar"
        style={{
          width: collapsed ? 0 : 220,
          minWidth: collapsed ? 0 : 220,
          height: '100%',
          backgroundColor: '#F0EBE3',
          borderRight: '1px solid rgba(0, 0, 0, 0.08)',
          overflow: 'hidden',
          transition: 'width 0.15s ease, min-width 0.15s ease',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
          color: '#1C1A16',
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: '#8A8278',
            borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
          }}
        >
          Sessions
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {/* Session list will be rendered here in S2 */}
        </div>
      </div>
      <button
        data-testid="sidebar-toggle"
        onClick={() => setCollapsed((c) => !c)}
        style={{
          position: 'absolute',
          left: collapsed ? 4 : 210,
          top: 40,
          zIndex: 10,
          width: 20,
          height: 20,
          border: '1px solid rgba(0, 0, 0, 0.08)',
          borderRadius: 4,
          backgroundColor: '#F0EBE3',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '10px',
          color: '#8A8278',
          transition: 'left 0.15s ease',
          padding: 0,
        }}
        title={collapsed ? 'Show sidebar' : 'Hide sidebar'}
      >
        {collapsed ? '▸' : '◂'}
      </button>
    </>
  )
}

export default Sidebar
```

**Step 2: Update `src/renderer/src/App.tsx`**

Replace the entire file:

```tsx
import TerminalComponent from './components/Terminal'
import Sidebar from './components/Sidebar'

function App(): React.ReactElement {
  return (
    <div
      id="app"
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'row',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <Sidebar />
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          padding: '4px',
        }}
      >
        <TerminalComponent />
      </div>
    </div>
  )
}

export default App
```

**Step 3: Update `src/renderer/src/App.css`**

Add after the existing `.xterm` rule:

```css
/* Sidebar scrollbar styling */
[data-testid="sidebar"]::-webkit-scrollbar {
  width: 4px;
}

[data-testid="sidebar"]::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
  border-radius: 2px;
}
```

**Step 4: Build and run all tests**

```bash
npm run build && npx playwright test
```

Expected: All tests pass, including new S1 sidebar tests and existing terminal tests.

---

### Task 3: Commit S1 and update STATE.yaml

**Step 1: Update `STATE.yaml`**

Add sidebar features to the features section:

```yaml
  DB:
    name: SQLite state store
    status: done
    depends_on: []
    blockers: []
  HK:
    name: Hook event receiver
    status: done
    depends_on: [DB]
    blockers: []
  S1:
    name: Sidebar shell
    status: done
    depends_on: [T1]
    blockers: []
  S2:
    name: Session list
    status: ready
    depends_on: [S1, DB, HK]
    blockers: []
  S3:
    name: Session status
    status: ready
    depends_on: [S2]
    blockers: []
  S4:
    name: Project grouping
    status: ready
    depends_on: [S2]
    blockers: []
  S5:
    name: Real-time updates
    status: ready
    depends_on: [S3, HK]
    blockers: []
```

Change `phase` to `"1B — Sidebar"` and `next_action` to `"Implement S2: Session list"`.

**Step 2: Pre-commit gate**

```bash
npm run build && npx playwright test
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat(S1): sidebar shell — 220px left panel with collapse toggle, warm palette"
```

---

## Section 2: S2 — Session List (Tasks 4–8)

**Feature:** Sidebar reads `~/.amplifier/projects/*/sessions/*/` to discover sessions and displays them as a list. This introduces the full data pipeline: main process reads disk → state-aggregator builds model → IPC push → Zustand store → React render.

---

### Task 4: Install chokidar and add shared session types

**Files:**
- Modify: `package.json` (install chokidar)
- Modify: `src/shared/types.ts` (add session types)
- Modify: `src/shared/constants.ts` (add session paths)

**Step 1: Install chokidar**

```bash
npm install chokidar@latest
```

**Step 2: Update `src/shared/types.ts`**

Add the following after the existing `IPC_CHANNELS` definition:

```typescript
// Add to IPC_CHANNELS:
export const IPC_CHANNELS = {
  // Main → Renderer (push)
  TERMINAL_DATA: 'terminal:data',
  SESSIONS_CHANGED: 'state:sessions-changed',
  // Renderer → Main (request)
  TERMINAL_INPUT: 'terminal:input',
  TERMINAL_RESIZE: 'terminal:resize',
} as const

// Session status
export type SessionStatus = 'running' | 'needs_input' | 'done' | 'failed' | 'active'

// Session model (renderer-side)
export interface Session {
  id: string
  name: string
  status: SessionStatus
  startedAt: string       // ISO 8601 timestamp
  elapsed?: string        // e.g. "48m" for running sessions
  outcome?: string        // e.g. "PR #48" for done sessions
  error?: string          // for failed sessions
  bundle?: string         // e.g. "bundle:foundation"
  model?: string          // e.g. "anthropic/claude-opus-4-6"
  turnCount?: number
  startedBy: 'canvas' | 'external'  // How this session was initiated
  byteOffset: number                  // Last read position in events.jsonl
}

// Project model (renderer-side)
export interface Project {
  id: string              // slug from disk, e.g. "-Users-chrispark-Projects-myapp"
  name: string            // human-readable, derived from slug
  path: string            // decoded working directory path
  sessions: Session[]
  lastActivity: string    // ISO 8601 of most recent session event
}

// What main process sends to renderer
export interface SessionsUpdate {
  projects: Project[]
}
```

**Step 3: Update `src/shared/constants.ts`**

Add after the existing constants:

```typescript
import os from 'os'
import { join } from 'path'

export const AMPLIFIER_HOME = process.env.AMPLIFIER_HOME || join(os.homedir(), '.amplifier')
export const AMPLIFIER_PROJECTS_DIR = join(AMPLIFIER_HOME, 'projects')
```

> **Note:** The `AMPLIFIER_HOME` env var override is essential for E2E testing — tests use fixture data instead of the user's real sessions.

**Step 4: Verify the build still works**

```bash
npm run build
```

Expected: Build succeeds with no errors.

---

### Task 5: Create E2E test fixtures and write session list test

**Files:**
- Create: `e2e/fixtures/amplifier-home/projects/-test-project-alpha/sessions/session-aaa-111/events.jsonl`
- Create: `e2e/fixtures/amplifier-home/projects/-test-project-alpha/sessions/session-aaa-111/metadata.json`
- Create: `e2e/fixtures/amplifier-home/projects/-test-project-alpha/sessions/session-aaa-222/events.jsonl`
- Create: `e2e/fixtures/amplifier-home/projects/-test-project-alpha/sessions/session-aaa-222/metadata.json`
- Create: `e2e/fixtures/amplifier-home/projects/-test-project-beta/sessions/session-bbb-111/events.jsonl`
- Create: `e2e/fixtures/amplifier-home/projects/-test-project-beta/sessions/session-bbb-111/metadata.json`
- Modify: `e2e/sidebar.spec.ts`

**Step 1: Create fixture directories**

```bash
mkdir -p e2e/fixtures/amplifier-home/projects/-test-project-alpha/sessions/session-aaa-111
mkdir -p e2e/fixtures/amplifier-home/projects/-test-project-alpha/sessions/session-aaa-222
mkdir -p e2e/fixtures/amplifier-home/projects/-test-project-beta/sessions/session-bbb-111
```

**Step 2: Create fixture `session-aaa-111` (running session)**

Create `e2e/fixtures/amplifier-home/projects/-test-project-alpha/sessions/session-aaa-111/events.jsonl`:

```jsonl
{"ts":"2026-04-03T10:00:00.000+00:00","lvl":"INFO","schema":{"name":"amplifier.log","ver":"1.0.0"},"event":"session:start","session_id":"session-aaa-111","data":{"parent_id":null}}
{"ts":"2026-04-03T10:00:01.000+00:00","lvl":"INFO","schema":{"name":"amplifier.log","ver":"1.0.0"},"event":"prompt:submit","session_id":"session-aaa-111","data":{"parent_id":null,"prompt":"build the sidebar"}}
{"ts":"2026-04-03T10:00:05.000+00:00","lvl":"INFO","schema":{"name":"amplifier.log","ver":"1.0.0"},"event":"tool:pre","session_id":"session-aaa-111","data":{"parent_id":null,"tool":"write_file"}}
{"ts":"2026-04-03T10:00:06.000+00:00","lvl":"INFO","schema":{"name":"amplifier.log","ver":"1.0.0"},"event":"tool:post","session_id":"session-aaa-111","data":{"parent_id":null,"tool":"write_file"}}
```

Create `e2e/fixtures/amplifier-home/projects/-test-project-alpha/sessions/session-aaa-111/metadata.json`:

```json
{
  "session_id": "session-aaa-111",
  "created": "2026-04-03T10:00:00.000+00:00",
  "bundle": "bundle:foundation",
  "model": "anthropic/claude-opus-4-6",
  "turn_count": 1
}
```

**Step 3: Create fixture `session-aaa-222` (done session)**

Create `e2e/fixtures/amplifier-home/projects/-test-project-alpha/sessions/session-aaa-222/events.jsonl`:

```jsonl
{"ts":"2026-04-03T09:00:00.000+00:00","lvl":"INFO","schema":{"name":"amplifier.log","ver":"1.0.0"},"event":"session:start","session_id":"session-aaa-222","data":{"parent_id":null}}
{"ts":"2026-04-03T09:00:01.000+00:00","lvl":"INFO","schema":{"name":"amplifier.log","ver":"1.0.0"},"event":"prompt:submit","session_id":"session-aaa-222","data":{"parent_id":null,"prompt":"fix the tests"}}
{"ts":"2026-04-03T09:05:00.000+00:00","lvl":"INFO","schema":{"name":"amplifier.log","ver":"1.0.0"},"event":"prompt:complete","session_id":"session-aaa-222","data":{"parent_id":null}}
{"ts":"2026-04-03T09:10:00.000+00:00","lvl":"INFO","schema":{"name":"amplifier.log","ver":"1.0.0"},"event":"session:end","session_id":"session-aaa-222","data":{"parent_id":null}}
```

Create `e2e/fixtures/amplifier-home/projects/-test-project-alpha/sessions/session-aaa-222/metadata.json`:

```json
{
  "session_id": "session-aaa-222",
  "created": "2026-04-03T09:00:00.000+00:00",
  "bundle": "bundle:foundation",
  "model": "anthropic/claude-opus-4-6",
  "turn_count": 3
}
```

**Step 4: Create fixture `session-bbb-111` (needs input session)**

Create `e2e/fixtures/amplifier-home/projects/-test-project-beta/sessions/session-bbb-111/events.jsonl`:

```jsonl
{"ts":"2026-04-03T08:00:00.000+00:00","lvl":"INFO","schema":{"name":"amplifier.log","ver":"1.0.0"},"event":"session:start","session_id":"session-bbb-111","data":{"parent_id":null}}
{"ts":"2026-04-03T08:00:01.000+00:00","lvl":"INFO","schema":{"name":"amplifier.log","ver":"1.0.0"},"event":"prompt:submit","session_id":"session-bbb-111","data":{"parent_id":null,"prompt":"refactor the auth module"}}
{"ts":"2026-04-03T08:05:00.000+00:00","lvl":"INFO","schema":{"name":"amplifier.log","ver":"1.0.0"},"event":"prompt:complete","session_id":"session-bbb-111","data":{"parent_id":null}}
```

Create `e2e/fixtures/amplifier-home/projects/-test-project-beta/sessions/session-bbb-111/metadata.json`:

```json
{
  "session_id": "session-bbb-111",
  "created": "2026-04-03T08:00:00.000+00:00",
  "bundle": "bundle:foundation",
  "model": "anthropic/claude-sonnet-4-20250514",
  "turn_count": 2
}
```

**Step 5: Update `e2e/sidebar.spec.ts` — add S2 tests**

Replace the existing `test.beforeAll` block to use fixture data, then append S2 tests after the S1 tests:

```typescript
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { resolve } from 'path'

let app: ElectronApplication
let page: Page

const FIXTURE_HOME = resolve(__dirname, 'fixtures', 'amplifier-home')

test.beforeAll(async () => {
  app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      AMPLIFIER_HOME: FIXTURE_HOME,
    },
  })
  page = await app.firstWindow()
})

test.afterAll(async () => {
  await app.close()
})

// --- S1: Sidebar Shell --- (keep existing S1 tests unchanged)

// ... (S1 tests from Task 1 go here, unchanged)

// --- S2: Session List ---

test('S2: sidebar shows session items', async () => {
  // Wait for sessions to load from fixtures
  const sessionItems = page.locator('[data-testid="session-item"]')
  await expect(sessionItems.first()).toBeVisible({ timeout: 10000 })

  // Should have 3 sessions total (2 in alpha, 1 in beta)
  const count = await sessionItems.count()
  expect(count).toBe(3)
})

test('S2: session items display session ID or name', async () => {
  const sessionItems = page.locator('[data-testid="session-item"]')
  // At least one item should contain text
  const firstText = await sessionItems.first().textContent()
  expect(firstText).toBeTruthy()
  expect(firstText!.length).toBeGreaterThan(0)
})
```

**Step 6: Build and run test to verify it fails**

```bash
npm run build && npx playwright test e2e/sidebar.spec.ts -g "S2"
```

Expected: FAIL — no `[data-testid="session-item"]` elements exist yet.

---

### Task 6: Implement state-aggregator and IPC handlers in main process

**Files:**
- Create: `src/main/state-aggregator.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`

**Step 1: Create `src/main/state-aggregator.ts`**

```typescript
import { readdirSync, readFileSync, existsSync, openSync, fstatSync, readSync, closeSync } from 'fs'
import { join } from 'path'
import { AMPLIFIER_PROJECTS_DIR } from '../shared/constants'
import type { Project, Session, SessionStatus } from '../shared/types'
import {
  isDbPopulated, getProjects, getSessionsByProject,
  upsertProject, upsertSession, updateByteOffset,
  updateSessionStatus, getByteOffset
} from './state-store'

/**
 * Decode a project slug back to a filesystem path.
 * e.g. "-Users-chrispark-Projects-myapp" → "/Users/chrispark/Projects/myapp"
 *
 * The slug format uses hyphens as separators. The leading hyphen
 * represents the root "/". We restore slashes and handle the edge cases.
 */
function decodeSlug(slug: string): string {
  // The slug starts with "-" representing "/", then path segments separated by "-"
  // But path segments themselves may contain hyphens — this is lossy.
  // For display purposes, we just replace leading "-" with "/" and internal "-" with "/"
  if (slug.startsWith('-')) {
    return '/' + slug.slice(1).replace(/-/g, '/')
  }
  return slug.replace(/-/g, '/')
}

/**
 * Derive a human-readable project name from the decoded path.
 * Takes the last path segment. e.g. "/Users/chris/Projects/myapp" → "myapp"
 */
function projectNameFromPath(decodedPath: string): string {
  const segments = decodedPath.split('/').filter(Boolean)
  return segments[segments.length - 1] || decodedPath
}

/**
 * Derive session status from events.jsonl content using tail-reading.
 * Reads only new bytes since the last known offset, updates the offset in canvas.db.
 * On first call (offset = 0), reads the full file.
 */
function deriveSessionStatus(eventsPath: string, sessionId: string): { status: SessionStatus; startedAt: string; elapsed?: string; outcome?: string } {
  const defaultResult = { status: 'active' as SessionStatus, startedAt: new Date().toISOString() }

  if (!existsSync(eventsPath)) {
    return defaultResult
  }

  try {
    const offset = getByteOffset(sessionId)
    const fd = openSync(eventsPath, 'r')
    const stats = fstatSync(fd)

    let content = ''
    if (stats.size > offset) {
      // Read only new bytes since last offset
      const buffer = Buffer.alloc(stats.size - offset)
      readSync(fd, buffer, 0, buffer.length, offset)
      content = buffer.toString('utf-8')
      updateByteOffset(sessionId, stats.size)
    }
    closeSync(fd)

    // If no new content and we have an existing offset, we have no new events
    if (!content && offset > 0) {
      // Return current DB status — caller should read from DB instead
      return defaultResult
    }

    // If first read (offset was 0) but file is empty, return default
    const lines = content.trim().split('\n').filter(Boolean)
    if (lines.length === 0) {
      return defaultResult
    }

    let startedAt = ''
    let hasSessionEnd = false
    let lastEventType = ''
    let lastTimestamp = ''

    for (const line of lines) {
      try {
        const event = JSON.parse(line)
        const eventType = event.event || ''
        const ts = event.ts || ''

        if (eventType === 'session:start' && !startedAt) {
          startedAt = ts
        }
        if (eventType === 'session:end') {
          hasSessionEnd = true
        }

        lastEventType = eventType
        lastTimestamp = ts
      } catch {
        // Skip malformed lines
      }
    }

    if (!startedAt) {
      startedAt = lastTimestamp || new Date().toISOString()
    }

    // Status derivation logic:
    // 1. Has session:end → done
    // 2. Last event is prompt:complete (no subsequent prompt:submit) → needs_input
    // 3. Otherwise → running (session started, not ended)
    let status: SessionStatus
    if (hasSessionEnd) {
      status = 'done'
    } else if (lastEventType === 'prompt:complete') {
      status = 'needs_input'
    } else if (startedAt) {
      status = 'running'
    } else {
      status = 'active'
    }

    // Persist the derived status back to canvas.db
    if (hasSessionEnd) {
      updateSessionStatus(sessionId, status, lastTimestamp || undefined)
    } else {
      updateSessionStatus(sessionId, status)
    }

    // Calculate elapsed time for running sessions
    let elapsed: string | undefined
    if (status === 'running' && startedAt) {
      const startMs = new Date(startedAt).getTime()
      const elapsedMs = Date.now() - startMs
      const minutes = Math.floor(elapsedMs / 60000)
      if (minutes < 60) {
        elapsed = `${minutes}m`
      } else {
        const hours = Math.floor(minutes / 60)
        elapsed = `${hours}h ${minutes % 60}m`
      }
    }

    return { status, startedAt, elapsed }
  } catch {
    return defaultResult
  }
}

/**
 * Read optional metadata.json for a session.
 */
function readSessionMetadata(metadataPath: string): { bundle?: string; model?: string; turnCount?: number } {
  if (!existsSync(metadataPath)) {
    return {}
  }
  try {
    const content = readFileSync(metadataPath, 'utf-8')
    const data = JSON.parse(content)
    return {
      bundle: data.bundle,
      model: data.model,
      turnCount: data.turn_count,
    }
  } catch {
    return {}
  }
}

/**
 * Public entry point. On startup checks canvas.db — if populated, reads from DB (fast path).
 * On cold start (empty DB), does a full disk scan and persists to canvas.db.
 */
export function discoverSessions(): Project[] {
  // Fast path: read from canvas.db if populated
  if (isDbPopulated()) {
    return loadFromDb()
  }

  // Cold start: full disk scan, then populate canvas.db
  const projects = scanDisk()
  persistToDb(projects)
  return projects
}

/**
 * Read projects and sessions from SQLite and return the Project[] structure.
 * Used on warm startup when canvas.db is already populated.
 */
function loadFromDb(): Project[] {
  const dbProjects = getProjects()
  const projects: Project[] = []

  for (const dbProject of dbProjects) {
    const dbSessions = getSessionsByProject(dbProject.slug)
    const decodedPath = decodeSlug(dbProject.slug)

    const sessions: Session[] = dbSessions.map((s) => ({
      id: s.id,
      name: s.id.slice(0, 8),
      status: s.status as SessionStatus,
      startedAt: s.started_at,
      elapsed: undefined, // Recalculated on next event
      bundle: s.bundle ?? undefined,
      model: s.model ?? undefined,
      turnCount: s.turn_count ?? undefined,
      startedBy: s.started_by as 'canvas' | 'external',
      byteOffset: s.byte_offset,
    }))

    projects.push({
      id: dbProject.slug,
      name: projectNameFromPath(decodedPath),
      path: decodedPath,
      sessions,
      lastActivity: dbProject.last_activity || new Date().toISOString(),
    })
  }

  return projects
}

/**
 * Write discovered projects/sessions to canvas.db for future warm reads.
 */
function persistToDb(projects: Project[]): void {
  for (const project of projects) {
    upsertProject(project.id, project.name, project.path)
    for (const session of project.sessions) {
      upsertSession(session.id, project.id, session.startedAt, 'external')
      updateSessionStatus(session.id, session.status)
    }
  }
}

/**
 * Full disk scan — used only on cold start (empty canvas.db).
 * Discovers all projects and sessions from ~/.amplifier/projects/*/sessions/*/
 */
function scanDisk(): Project[] {
  const projectsDir = AMPLIFIER_PROJECTS_DIR

  if (!existsSync(projectsDir)) {
    return []
  }

  const projects: Project[] = []

  try {
    const projectSlugs = readdirSync(projectsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)

    for (const slug of projectSlugs) {
      const sessionsDir = join(projectsDir, slug, 'sessions')
      if (!existsSync(sessionsDir)) continue

      const sessionDirs = readdirSync(sessionsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)

      if (sessionDirs.length === 0) continue

      const sessions: Session[] = []

      for (const sessionId of sessionDirs) {
        const sessionPath = join(sessionsDir, sessionId)
        const eventsPath = join(sessionPath, 'events.jsonl')
        const metadataPath = join(sessionPath, 'metadata.json')

        const { status, startedAt, elapsed } = deriveSessionStatus(eventsPath, sessionId)
        const metadata = readSessionMetadata(metadataPath)

        sessions.push({
          id: sessionId,
          name: sessionId.slice(0, 8), // Short ID for display
          status,
          startedAt,
          elapsed,
          bundle: metadata.bundle,
          model: metadata.model,
          turnCount: metadata.turnCount,
          startedBy: 'external',
          byteOffset: 0,
        })
      }

      // Sort sessions by startedAt descending (newest first)
      sessions.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())

      const decodedPath = decodeSlug(slug)
      const lastActivity = sessions[0]?.startedAt || new Date().toISOString()

      projects.push({
        id: slug,
        name: projectNameFromPath(decodedPath),
        path: decodedPath,
        sessions,
        lastActivity,
      })
    }
  } catch {
    // If scanning fails, return empty — degrade gracefully
  }

  // Sort projects by last activity descending
  projects.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())

  return projects
}
```

**Step 2: Update `src/main/ipc.ts`**

Add session IPC handlers. Keep the existing terminal handlers and add:

```typescript
import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../shared/types'
import { spawnPty, writeToPty, resizePty, killPty } from './pty'
import { discoverSessions } from './state-aggregator'

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  // --- Terminal handlers (existing from Plan 1A) ---
  const ptyProcess = spawnPty(80, 24)

  ptyProcess.onData((data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.TERMINAL_DATA, data)
    }
  })

  ipcMain.on(IPC_CHANNELS.TERMINAL_INPUT, (_event, data: string) => {
    writeToPty(data)
  })

  ipcMain.on(IPC_CHANNELS.TERMINAL_RESIZE, (_event, { cols, rows }: { cols: number; rows: number }) => {
    resizePty(cols, rows)
  })

  // --- Session handlers (new for Plan 1B) ---

  // Initial session scan — send to renderer once it's ready
  mainWindow.webContents.on('did-finish-load', () => {
    const projects = discoverSessions()
    mainWindow.webContents.send(IPC_CHANNELS.SESSIONS_CHANGED, { projects })
  })

  // Clean up on window close
  mainWindow.on('closed', () => {
    killPty()
  })
}

/**
 * Push a fresh session scan to the given window.
 * Called by the watcher when session files change (S5).
 */
export function pushSessionUpdate(mainWindow: BrowserWindow): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const projects = discoverSessions()
    mainWindow.webContents.send(IPC_CHANNELS.SESSIONS_CHANGED, { projects })
  }
}
```

**Step 3: Update `src/preload/index.ts`**

Add session-related API to the preload bridge. Add after the existing terminal methods:

```typescript
import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/types'
import type { SessionsUpdate } from '../shared/types'

const api = {
  // Terminal: send input to PTY
  sendTerminalInput: (data: string): void => {
    ipcRenderer.send(IPC_CHANNELS.TERMINAL_INPUT, data)
  },

  // Terminal: resize PTY
  sendTerminalResize: (cols: number, rows: number): void => {
    ipcRenderer.send(IPC_CHANNELS.TERMINAL_RESIZE, { cols, rows })
  },

  // Terminal: receive data from PTY
  onTerminalData: (callback: (data: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: string): void => {
      callback(data)
    }
    ipcRenderer.on(IPC_CHANNELS.TERMINAL_DATA, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.TERMINAL_DATA, handler)
    }
  },

  // Sessions: receive session updates from main process
  onSessionsChanged: (callback: (update: SessionsUpdate) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, update: SessionsUpdate): void => {
      callback(update)
    }
    ipcRenderer.on(IPC_CHANNELS.SESSIONS_CHANGED, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.SESSIONS_CHANGED, handler)
    }
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api
```

**Step 4: Verify the build still works**

```bash
npm run build
```

Expected: Build succeeds with no errors.

---

### Task 7: Implement session store and SessionItem component in renderer

**Files:**
- Create: `src/renderer/src/stores/session-store.ts`
- Create: `src/renderer/src/components/SessionItem.tsx`
- Modify: `src/renderer/src/components/Sidebar.tsx`

**Step 1: Create `src/renderer/src/stores/session-store.ts`**

```typescript
import { create } from 'zustand'
import type { Project, SessionsUpdate } from '../../../shared/types'

interface SessionStore {
  projects: Project[]
  setProjects: (projects: Project[]) => void
}

export const useSessionStore = create<SessionStore>((set) => ({
  projects: [],
  setProjects: (projects) => set({ projects }),
}))

/**
 * Initialize the session store listener.
 * Call this once when the app starts to wire up IPC → Zustand.
 */
export function initSessionListener(): () => void {
  if (!window.electronAPI?.onSessionsChanged) {
    return () => {}
  }

  const cleanup = window.electronAPI.onSessionsChanged((update: SessionsUpdate) => {
    useSessionStore.getState().setProjects(update.projects)
  })

  return cleanup
}
```

**Step 2: Create `src/renderer/src/components/SessionItem.tsx`**

```tsx
import type { Session } from '../../../../shared/types'

interface SessionItemProps {
  session: Session
}

function SessionItem({ session }: SessionItemProps): React.ReactElement {
  return (
    <div
      data-testid="session-item"
      style={{
        padding: '6px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        cursor: 'pointer',
        fontSize: '13px',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
        color: '#1C1A16',
      }}
    >
      <span style={{ fontSize: '12px' }}>{session.name}</span>
    </div>
  )
}

export default SessionItem
```

**Step 3: Update `src/renderer/src/components/Sidebar.tsx`**

Wire up the session store and render SessionItems:

```tsx
import { useState, useEffect } from 'react'
import { useSessionStore, initSessionListener } from '../stores/session-store'
import SessionItem from './SessionItem'

function Sidebar(): React.ReactElement {
  const [collapsed, setCollapsed] = useState(false)
  const projects = useSessionStore((state) => state.projects)

  useEffect(() => {
    const cleanup = initSessionListener()
    return cleanup
  }, [])

  // Flatten all sessions for S2 (project grouping comes in S4)
  const allSessions = projects.flatMap((p) => p.sessions)

  return (
    <>
      <div
        data-testid="sidebar"
        style={{
          width: collapsed ? 0 : 220,
          minWidth: collapsed ? 0 : 220,
          height: '100%',
          backgroundColor: '#F0EBE3',
          borderRight: '1px solid rgba(0, 0, 0, 0.08)',
          overflow: 'hidden',
          transition: 'width 0.15s ease, min-width 0.15s ease',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
          color: '#1C1A16',
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: '#8A8278',
            borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
          }}
        >
          Sessions
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {allSessions.map((session) => (
            <SessionItem key={session.id} session={session} />
          ))}
          {allSessions.length === 0 && (
            <div style={{ padding: '16px', fontSize: '12px', color: '#A09888', textAlign: 'center' }}>
              No sessions found
            </div>
          )}
        </div>
      </div>
      <button
        data-testid="sidebar-toggle"
        onClick={() => setCollapsed((c) => !c)}
        style={{
          position: 'absolute',
          left: collapsed ? 4 : 210,
          top: 40,
          zIndex: 10,
          width: 20,
          height: 20,
          border: '1px solid rgba(0, 0, 0, 0.08)',
          borderRadius: 4,
          backgroundColor: '#F0EBE3',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '10px',
          color: '#8A8278',
          transition: 'left 0.15s ease',
          padding: 0,
        }}
        title={collapsed ? 'Show sidebar' : 'Hide sidebar'}
      >
        {collapsed ? '▸' : '◂'}
      </button>
    </>
  )
}

export default Sidebar
```

**Step 4: Build and run all tests**

```bash
npm run build && npx playwright test
```

Expected: All tests pass, including S2 session list tests (sidebar shows 3 session items from fixtures).

---

### Task 8: Commit S2 and update STATE.yaml

**Step 1: Update `STATE.yaml`**

Change S2 status to `done` and `next_action` to `"Implement S3: Session status"`.

```yaml
  S2:
    name: Session list
    status: done
    depends_on: [S1, DB, HK]
    blockers: []
```

**Step 2: Pre-commit gate**

```bash
npm run build && npx playwright test
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat(S2): session list — state-aggregator scans disk, IPC pushes to renderer, sidebar renders sessions"
```

---

## Section 3: S3 — Session Status (Tasks 9–11)

**Feature:** Each session row shows a colored status dot and a contextual label based on events.jsonl parsing.

| State | Dot | Label |
|-------|-----|-------|
| Running | Amber (pulsing) | Elapsed time (e.g., `48m`) |
| Needs input | Blue (pulsing) | `needs input` |
| Done | Green (static) | `done` |
| Failed | Red (static) | Error message |
| Paused | Gray (static) | `paused` |

---

### Task 9: Write E2E tests for session status display

**Files:**
- Modify: `e2e/sidebar.spec.ts`

**Step 1: Add S3 tests to `e2e/sidebar.spec.ts`**

Append after S2 tests:

```typescript
// --- S3: Session Status ---

test('S3: running session shows amber status dot', async () => {
  // session-aaa-111 is running (has session:start, no session:end)
  const runningItem = page.locator('[data-testid="session-item"]').filter({
    has: page.locator('text=session-a'),
  }).first()
  await expect(runningItem).toBeVisible({ timeout: 10000 })

  // Check for amber dot
  const dot = runningItem.locator('[data-testid="status-dot"]')
  await expect(dot).toBeVisible()
  const bgColor = await dot.evaluate((el) => window.getComputedStyle(el).backgroundColor)
  // --amber: #F59E0B = rgb(245, 158, 11)
  expect(bgColor).toBe('rgb(245, 158, 11)')
})

test('S3: done session shows green status dot', async () => {
  // session-aaa-222 is done (has session:end)
  const doneItems = page.locator('[data-testid="status-dot"][data-status="done"]')
  await expect(doneItems.first()).toBeVisible({ timeout: 10000 })

  const bgColor = await doneItems.first().evaluate((el) => window.getComputedStyle(el).backgroundColor)
  // --green: #3D9A65 = rgb(61, 154, 101)
  expect(bgColor).toBe('rgb(61, 154, 101)')
})

test('S3: needs-input session shows blue status dot', async () => {
  // session-bbb-111 has prompt:complete as last event (needs input)
  const needsInputDots = page.locator('[data-testid="status-dot"][data-status="needs_input"]')
  await expect(needsInputDots.first()).toBeVisible({ timeout: 10000 })

  const bgColor = await needsInputDots.first().evaluate((el) => window.getComputedStyle(el).backgroundColor)
  // --blue: #5B8FD4 = rgb(91, 143, 212)
  expect(bgColor).toBe('rgb(91, 143, 212)')
})

test('S3: session items show status labels', async () => {
  // At least one session should show a label (elapsed time, "done", "needs input")
  const labels = page.locator('[data-testid="status-label"]')
  await expect(labels.first()).toBeVisible({ timeout: 10000 })
  const count = await labels.count()
  expect(count).toBeGreaterThanOrEqual(3)
})
```

**Step 2: Build and run test to verify it fails**

```bash
npm run build && npx playwright test e2e/sidebar.spec.ts -g "S3"
```

Expected: FAIL — no status dots or labels exist yet.

---

### Task 10: Implement status dots and labels in SessionItem

**Files:**
- Modify: `src/renderer/src/components/SessionItem.tsx`

**Step 1: Update `src/renderer/src/components/SessionItem.tsx`**

Replace the entire file:

```tsx
import type { Session, SessionStatus } from '../../../../shared/types'

interface SessionItemProps {
  session: Session
}

const STATUS_COLORS: Record<SessionStatus, string> = {
  running: '#F59E0B',     // amber
  needs_input: '#5B8FD4', // blue
  done: '#3D9A65',        // green
  failed: '#CC5555',      // red
  paused: '#A09888',      // gray
}

const PULSING_STATUSES: Set<SessionStatus> = new Set(['running', 'needs_input'])

function getStatusLabel(session: Session): string {
  switch (session.status) {
    case 'running':
      return session.elapsed || 'running'
    case 'needs_input':
      return 'needs input'
    case 'done':
      return session.outcome || 'done'
    case 'failed':
      return session.error || 'failed'
    case 'paused':
      return 'paused'
    default:
      return 'unknown'
  }
}

function SessionItem({ session }: SessionItemProps): React.ReactElement {
  const dotColor = STATUS_COLORS[session.status] || '#A09888'
  const isPulsing = PULSING_STATUSES.has(session.status)
  const label = getStatusLabel(session)

  return (
    <div
      data-testid="session-item"
      style={{
        padding: '6px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        cursor: 'pointer',
        fontSize: '13px',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
        color: '#1C1A16',
      }}
    >
      <span
        data-testid="status-dot"
        data-status={session.status}
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: dotColor,
          flexShrink: 0,
          animation: isPulsing ? 'pulse 2s ease-in-out infinite' : 'none',
        }}
      />
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {session.name}
      </span>
      <span
        data-testid="status-label"
        style={{
          fontSize: '11px',
          color: '#8A8278',
          flexShrink: 0,
        }}
      >
        {label}
      </span>
    </div>
  )
}

export default SessionItem
```

**Step 2: Add pulse animation to `src/renderer/src/App.css`**

Append:

```css
/* Status dot pulse animation */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
```

**Step 3: Build and run all tests**

```bash
npm run build && npx playwright test
```

Expected: All tests pass, including S3 status dot and label tests.

---

### Task 11: Commit S3 and update STATE.yaml

**Step 1: Update `STATE.yaml`**

Change S3 status to `done` and `next_action` to `"Implement S4: Project grouping"`.

```yaml
  S3:
    name: Session status
    status: done
    depends_on: [S2]
    blockers: []
```

**Step 2: Pre-commit gate**

```bash
npm run build && npx playwright test
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat(S3): session status — colored dots (amber/blue/green/red/gray), pulsing animation, contextual labels"
```

---

## Section 4: S4 — Project Grouping (Tasks 12–14)

**Feature:** Sessions are grouped by project (working directory). Each project shows as a collapsible section header with its sessions listed underneath.

---

### Task 12: Write E2E tests for project grouping

**Files:**
- Modify: `e2e/sidebar.spec.ts`

**Step 1: Add S4 tests to `e2e/sidebar.spec.ts`**

Append:

```typescript
// --- S4: Project Grouping ---

test('S4: sessions are grouped under project headers', async () => {
  const projectHeaders = page.locator('[data-testid="project-header"]')
  await expect(projectHeaders.first()).toBeVisible({ timeout: 10000 })

  // Should have 2 project groups (alpha and beta from fixtures)
  const count = await projectHeaders.count()
  expect(count).toBe(2)
})

test('S4: project headers show project name', async () => {
  const projectHeaders = page.locator('[data-testid="project-header"]')
  const texts = await projectHeaders.allTextContents()

  // Project names are derived from slug last segment
  // -test-project-alpha → "alpha"
  // -test-project-beta → "beta"
  const allText = texts.join(' ')
  expect(allText).toContain('alpha')
  expect(allText).toContain('beta')
})

test('S4: project group shows correct session count', async () => {
  // alpha project has 2 sessions, beta has 1
  const alphaGroup = page.locator('[data-testid="project-group"]').filter({
    has: page.locator('text=alpha'),
  })
  const alphaItems = alphaGroup.locator('[data-testid="session-item"]')
  await expect(alphaItems.first()).toBeVisible({ timeout: 10000 })
  expect(await alphaItems.count()).toBe(2)

  const betaGroup = page.locator('[data-testid="project-group"]').filter({
    has: page.locator('text=beta'),
  })
  const betaItems = betaGroup.locator('[data-testid="session-item"]')
  await expect(betaItems.first()).toBeVisible({ timeout: 10000 })
  expect(await betaItems.count()).toBe(1)
})
```

**Step 2: Build and run test to verify it fails**

```bash
npm run build && npx playwright test e2e/sidebar.spec.ts -g "S4"
```

Expected: FAIL — no `[data-testid="project-header"]` elements exist yet (sessions are currently shown in a flat list).

---

### Task 13: Implement project grouping in Sidebar

**Files:**
- Modify: `src/renderer/src/components/Sidebar.tsx`

**Step 1: Update `src/renderer/src/components/Sidebar.tsx`**

Replace the session rendering section to group by project:

```tsx
import { useState, useEffect } from 'react'
import { useSessionStore, initSessionListener } from '../stores/session-store'
import SessionItem from './SessionItem'

function Sidebar(): React.ReactElement {
  const [collapsed, setCollapsed] = useState(false)
  const projects = useSessionStore((state) => state.projects)

  useEffect(() => {
    const cleanup = initSessionListener()
    return cleanup
  }, [])

  return (
    <>
      <div
        data-testid="sidebar"
        style={{
          width: collapsed ? 0 : 220,
          minWidth: collapsed ? 0 : 220,
          height: '100%',
          backgroundColor: '#F0EBE3',
          borderRight: '1px solid rgba(0, 0, 0, 0.08)',
          overflow: 'hidden',
          transition: 'width 0.15s ease, min-width 0.15s ease',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
          color: '#1C1A16',
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: '#8A8278',
            borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
          }}
        >
          Sessions
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {projects.map((project) => (
            <div key={project.id} data-testid="project-group">
              <div
                data-testid="project-header"
                style={{
                  padding: '8px 16px 4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#8A8278',
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={project.path}
              >
                {project.name}
              </div>
              {project.sessions.map((session) => (
                <SessionItem key={session.id} session={session} />
              ))}
            </div>
          ))}
          {projects.length === 0 && (
            <div style={{ padding: '16px', fontSize: '12px', color: '#A09888', textAlign: 'center' }}>
              No sessions found
            </div>
          )}
        </div>
      </div>
      <button
        data-testid="sidebar-toggle"
        onClick={() => setCollapsed((c) => !c)}
        style={{
          position: 'absolute',
          left: collapsed ? 4 : 210,
          top: 40,
          zIndex: 10,
          width: 20,
          height: 20,
          border: '1px solid rgba(0, 0, 0, 0.08)',
          borderRadius: 4,
          backgroundColor: '#F0EBE3',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '10px',
          color: '#8A8278',
          transition: 'left 0.15s ease',
          padding: 0,
        }}
        title={collapsed ? 'Show sidebar' : 'Hide sidebar'}
      >
        {collapsed ? '▸' : '◂'}
      </button>
    </>
  )
}

export default Sidebar
```

**Step 2: Build and run all tests**

```bash
npm run build && npx playwright test
```

Expected: All tests pass, including S4 project grouping tests.

---

### Task 14: Commit S4 and update STATE.yaml

**Step 1: Update `STATE.yaml`**

Change S4 status to `done` and `next_action` to `"Implement S5: Real-time updates"`.

```yaml
  S4:
    name: Project grouping
    status: done
    depends_on: [S2]
    blockers: []
```

**Step 2: Pre-commit gate**

```bash
npm run build && npx playwright test
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat(S4): project grouping — sessions grouped by project with collapsible headers"
```

---

## Section 5: S5 — Real-Time Updates (Tasks 15–17)

**Feature:** When an `events.jsonl` file changes on disk, the sidebar updates within 2 seconds. Uses chokidar to watch the Amplifier projects directory.

---

### Task 15: Write E2E test for real-time updates

**Files:**
- Modify: `e2e/sidebar.spec.ts`

**Step 1: Add S5 tests to `e2e/sidebar.spec.ts`**

Add this import at the top of the file:

```typescript
import { writeFileSync, appendFileSync, mkdirSync } from 'fs'
import { join } from 'path'
```

Append after S4 tests:

```typescript
// --- S5: Real-Time Updates ---

test('S5: adding a new session directory updates sidebar', async () => {
  // Count current sessions
  const beforeCount = await page.locator('[data-testid="session-item"]').count()

  // Create a new session in the fixture directory
  const newSessionDir = join(FIXTURE_HOME, 'projects', '-test-project-alpha', 'sessions', 'session-aaa-333')
  mkdirSync(newSessionDir, { recursive: true })

  const eventsContent = [
    '{"ts":"2026-04-03T11:00:00.000+00:00","lvl":"INFO","schema":{"name":"amplifier.log","ver":"1.0.0"},"event":"session:start","session_id":"session-aaa-333","data":{"parent_id":null}}',
  ].join('\n')

  writeFileSync(join(newSessionDir, 'events.jsonl'), eventsContent)
  writeFileSync(
    join(newSessionDir, 'metadata.json'),
    JSON.stringify({ session_id: 'session-aaa-333', created: '2026-04-03T11:00:00.000+00:00', bundle: 'test', model: 'test', turn_count: 0 })
  )

  // Wait for the watcher to detect and sidebar to update (within 2 seconds)
  await page.waitForTimeout(3000)

  const afterCount = await page.locator('[data-testid="session-item"]').count()
  expect(afterCount).toBe(beforeCount + 1)
})

test('S5: modifying events.jsonl updates session status', async () => {
  // session-aaa-333 is currently "running" (only has session:start)
  // Append session:end to make it "done"
  const eventsPath = join(FIXTURE_HOME, 'projects', '-test-project-alpha', 'sessions', 'session-aaa-333', 'events.jsonl')

  appendFileSync(eventsPath, '\n{"ts":"2026-04-03T11:05:00.000+00:00","lvl":"INFO","schema":{"name":"amplifier.log","ver":"1.0.0"},"event":"session:end","session_id":"session-aaa-333","data":{"parent_id":null}}')

  // Wait for the watcher to detect the change
  await page.waitForTimeout(3000)

  // The session should now show a green (done) dot
  const doneDots = page.locator('[data-testid="status-dot"][data-status="done"]')
  // We should have at least 2 done sessions now (aaa-222 was already done, aaa-333 is now done)
  const count = await doneDots.count()
  expect(count).toBeGreaterThanOrEqual(2)
})
```

**Step 2: Build and run test to verify it fails**

```bash
npm run build && npx playwright test e2e/sidebar.spec.ts -g "S5"
```

Expected: FAIL — no file watcher is active yet, so adding/modifying files doesn't trigger updates.

---

### Task 16: Implement chokidar watcher and wire to state-aggregator

**Files:**
- Create: `src/main/watcher.ts`
- Modify: `src/main/index.ts`

**Step 1: Create `src/main/watcher.ts`**

```typescript
import { watch } from 'chokidar'
import type { FSWatcher } from 'chokidar'
import { BrowserWindow } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { AMPLIFIER_PROJECTS_DIR } from '../shared/constants'
import { pushSessionUpdate } from './ipc'
import { getExternalActiveSessions } from './state-store'

/**
 * File watchers are the FALLBACK event path for external sessions.
 * Canvas-started sessions receive events via the hook receiver (~10ms).
 * External sessions (started in a regular terminal) use file watchers (~500ms).
 *
 * Ownership rule: each session has exactly one primary event source.
 * Deduplication: if both paths deliver the same event, the state-aggregator
 * deduplicates by byte offset (same offset = same event = skip).
 */

let watcher: FSWatcher | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Start watching events.jsonl files for external sessions only.
 * Canvas-started sessions are handled by the hook receiver — no watcher needed.
 * When a session file changes, re-scan and push updates to the renderer.
 */
export function startSessionWatcher(mainWindow: BrowserWindow): void {
  if (!existsSync(AMPLIFIER_PROJECTS_DIR)) {
    // If the directory doesn't exist yet, don't crash — just skip watching
    console.log(`[watcher] Projects directory not found: ${AMPLIFIER_PROJECTS_DIR}`)
    return
  }

  // Only watch external sessions — Canvas-started sessions use hook events
  const externalSessions = getExternalActiveSessions()

  // Sparse watcher: watch only the specific events.jsonl files we care about,
  // plus the top-level projects directory for new external session discovery
  const pathsToWatch = [
    AMPLIFIER_PROJECTS_DIR, // watch for new project/session directories
    ...externalSessions.map((s) =>
      join(AMPLIFIER_PROJECTS_DIR, s.project_slug, 'sessions', s.id, 'events.jsonl')
    ),
  ].filter(existsSync)

  watcher = watch(pathsToWatch, {
    depth: 4, // projects/<slug>/sessions/<id>/events.jsonl = 4 levels (for directory watching)
    ignoreInitial: true,
    persistent: true,
    // Debounce rapid changes (e.g., events.jsonl appends)
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100,
    },
  })

  const debouncedUpdate = (): void => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }
    debounceTimer = setTimeout(() => {
      pushSessionUpdate(mainWindow)
    }, 500) // 500ms debounce — well within the 2s requirement
  }

  watcher.on('add', debouncedUpdate)
  watcher.on('change', debouncedUpdate)
  watcher.on('addDir', debouncedUpdate)

  watcher.on('error', (error) => {
    console.error('[watcher] Error:', error)
  })

  console.log(`[watcher] Watching ${externalSessions.length} external session(s) + project directory`)
}

/**
 * Stop the file watcher. Call on app shutdown.
 */
export function stopSessionWatcher(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  if (watcher) {
    watcher.close()
    watcher = null
  }
}
```

**Step 2: Update `src/main/index.ts`**

Add watcher initialization after IPC handler registration. Find the line:

```typescript
  registerIpcHandlers(mainWindow)
```

Add after it:

```typescript
  // Start watching Amplifier session files for real-time updates
  startSessionWatcher(mainWindow)
```

Add the import at the top of the file:

```typescript
import { startSessionWatcher, stopSessionWatcher } from './watcher'
```

In the `window-all-closed` handler, add watcher cleanup:

```typescript
app.on('window-all-closed', () => {
  stopSessionWatcher()
  app.quit()
})
```

**Step 3: Configure electron-vite to externalize chokidar**

Update `electron.vite.config.ts` main section — add `chokidar` to the external list alongside `node-pty`:

```typescript
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: ['node-pty', 'chokidar']
      }
    }
  },
```

**Step 4: Build and run all tests**

```bash
npm run build && npx playwright test
```

Expected: All tests pass, including S5 real-time update tests.

> **Troubleshooting:** If the S5 test for new session detection takes longer than 3 seconds, increase the `waitForTimeout` in the test to 5000ms. The chokidar `awaitWriteFinish` adds stabilization delay.

---

### Task 17: Commit S5 and update STATE.yaml

**Step 1: Clean up test fixture artifacts**

The S5 test created `session-aaa-333` in the fixtures directory. Remove it so tests start clean:

```bash
rm -rf e2e/fixtures/amplifier-home/projects/-test-project-alpha/sessions/session-aaa-333
```

> **Note:** The E2E test creates this directory at runtime. It should not be committed to git. Add a `.gitkeep` note or handle cleanup in a `test.afterAll` block. For robustness, update the S5 tests to clean up in an `afterAll`:

Add to the top of the S5 test section in `e2e/sidebar.spec.ts`:

```typescript
import { rmSync } from 'fs'

// Add this after the S5 tests:
test.afterAll(async () => {
  // Clean up dynamic fixtures created during S5 tests
  const dynamicSession = join(FIXTURE_HOME, 'projects', '-test-project-alpha', 'sessions', 'session-aaa-333')
  try {
    rmSync(dynamicSession, { recursive: true, force: true })
  } catch {
    // Ignore cleanup errors
  }
})
```

**Step 2: Update `STATE.yaml`**

Change S5 status to `done` and `next_action` to `"Sidebar layer review (antagonistic review checkpoint)"`.

```yaml
  S5:
    name: Real-time updates
    status: done
    depends_on: [S3, HK]
    blockers: []
```

**Step 3: Pre-commit gate**

```bash
npm run build && npx playwright test
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat(S5): real-time updates — chokidar watches session files, sidebar refreshes within 2s"
```

---

## Section 6: Sidebar Layer Review (Task 18)

### Task 18: Full regression check and review preparation

**Step 1: Run the complete E2E suite**

```bash
npm run build && npx playwright test --reporter=list
```

Expected: ALL tests pass. The output should show terminal tests (T1-T5) and sidebar tests (S1-S5):

```
  ✓ T1: window has correct title
  ✓ T1: window has minimum dimensions
  ✓ T1: app launches in under 2 seconds
  ✓ T1: window shows no unexpected chrome
  ✓ T2: terminal element exists in the window
  ✓ T2: terminal takes up the full app area
  ✓ T3: typing a command produces output
  ✓ T3: shell persists after command completes
  ...
  ✓ S1: sidebar element exists in the layout
  ✓ S1: sidebar has approximately 200px width
  ✓ S1: sidebar has correct background color
  ✓ S1: sidebar collapse toggle exists and works
  ✓ S1: terminal still exists alongside sidebar
  ✓ S2: sidebar shows session items
  ✓ S2: session items display session ID or name
  ✓ S3: running session shows amber status dot
  ✓ S3: done session shows green status dot
  ✓ S3: needs-input session shows blue status dot
  ✓ S3: session items show status labels
  ✓ S4: sessions are grouped under project headers
  ✓ S4: project headers show project name
  ✓ S4: project group shows correct session count
  ✓ S5: adding a new session directory updates sidebar
  ✓ S5: modifying events.jsonl updates session status
```

**Step 2: Verify sidebar definition of done**

Cross-reference with the design document's sidebar checklist:

| Requirement | Test(s) | Status |
|---|---|---|
| Shows sessions grouped by project | S4: project grouping tests | Covered |
| Status is correct: running/done/waiting/failed | S3: status dot tests | Covered |
| Updates within 2 seconds | S5: real-time update tests | Covered |
| Clicking a session doesn't disrupt the terminal | S1: terminal still exists alongside sidebar | Covered |
| Collapsible | S1: collapse toggle test | Covered |

**Step 3: Verify terminal regression (sidebar didn't break it)**

Run terminal tests explicitly:

```bash
npx playwright test e2e/terminal.spec.ts --reporter=list
```

Expected: All terminal tests still pass. The sidebar addition must not have broken terminal keyboard focus or rendering.

**Step 4: Update `STATE.yaml` to mark Plan 1B complete**

```yaml
# Amplifier Canvas — Build State (Track B)
# Read this at every session start.

phase: "1B — Sidebar (COMPLETE)"

features:
  T1:
    name: Electron shell
    status: done
    depends_on: []
    blockers: []
  T2:
    name: xterm.js terminal
    status: done
    depends_on: [T1]
    blockers: []
  T3:
    name: PTY pipe
    status: done
    depends_on: [T2]
    blockers: []
  T4:
    name: CLI launch command
    status: done
    depends_on: [T1]
    blockers: []
  T5:
    name: Keyboard fidelity
    status: done
    depends_on: [T3]
    blockers: []
  DB:
    name: SQLite state store
    status: done
    depends_on: []
    blockers: []
  HK:
    name: Hook event receiver
    status: done
    depends_on: [DB]
    blockers: []
  S1:
    name: Sidebar shell
    status: done
    depends_on: [T1]
    blockers: []
  S2:
    name: Session list
    status: done
    depends_on: [S1, DB, HK]
    blockers: []
  S3:
    name: Session status
    status: done
    depends_on: [S2]
    blockers: []
  S4:
    name: Project grouping
    status: done
    depends_on: [S2]
    blockers: []
  S5:
    name: Real-time updates
    status: done
    depends_on: [S3, HK]
    blockers: []

next_action: "Antagonistic review of sidebar layer, then begin Plan 1C (Viewer + Integration)"
```

**Step 5: Update `AGENTS.md` plan reference**

Update the plan structure section:

```markdown
## Plan Structure

This is Plan 1B of 3:
- **Plan 1A:** Scaffold + Terminal (T1-T5) ✓ complete
- **Plan 1B:** Sidebar (S1-S5) ✓ complete ← you are here
- **Plan 1C:** Viewer + Integration (V1-V5, I1-I3)
```

**Step 6: Final commit**

```bash
npm run build && npx playwright test
git add -A
git commit -m "chore: complete Plan 1B — all sidebar features done, E2E tests covering S1-S5"
```