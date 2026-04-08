# Phase 1C: Data Infrastructure Implementation Plan

> **Execution:** Use the subagent-driven-development workflow to implement this plan.

**Goal:** Replace hardcoded mock data with a real data pipeline — scan Amplifier's session files from disk, watch for changes, and push live state to the renderer through Zustand.

**Architecture:** Main process scans `~/.amplifier/projects/` at startup, populates a SQLite database (`canvas.db`), then uses chokidar file watchers to detect changes. Session state flows from main → IPC push → Zustand store → React components. The PTY module is refactored from a singleton to a session-keyed map to support multi-session in Phase 1D.

**Tech Stack:** better-sqlite3 (SQLite), chokidar (file watching), zustand (renderer state), node-pty (PTY, already installed)

---

## Pre-flight: Verify Existing Tests Pass

Before touching anything, confirm the baseline:

```bash
cd /Users/chrispark/Projects/amplifier-canvas
npm run build && npx playwright test
```

**Expected:** All tests pass (T1-T5, S1-S5, app, cli, ipc-bridge). If anything fails, stop and fix before proceeding.

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install zustand and chokidar**

```bash
cd /Users/chrispark/Projects/amplifier-canvas
npm install zustand chokidar
```

**Step 2: Install @types/better-sqlite3**

The `better-sqlite3` package is already installed but has no bundled TypeScript types. We need the community type definitions.

```bash
npm install --save-dev @types/better-sqlite3
```

**Step 3: Remove legacy xterm package**

The project has both `xterm` (legacy) and `@xterm/xterm` (current). Only `@xterm/xterm` is used. Remove the legacy one.

```bash
npm uninstall xterm
```

**Step 4: Verify the build still works**

```bash
npm run build && npx playwright test
```

**Expected:** Build succeeds. All existing tests pass. No import errors.

**Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add zustand, chokidar, @types/better-sqlite3; remove legacy xterm"
```

---

### Task 2: Shared Types

**Files:**
- Modify: `src/shared/types.ts`

**Step 1: Expand the types file**

Replace the entire contents of `src/shared/types.ts` with:

```typescript
// IPC channel names shared between the main process and preload bridge

export const IPC_CHANNELS = {
  // Main → Renderer (push)
  TERMINAL_DATA: 'terminal:data',
  TERMINAL_EXIT: 'terminal:exit',
  SESSIONS_CHANGED: 'state:sessions-changed',
  FILES_CHANGED: 'session:files-changed',
  // Renderer → Main (request)
  TERMINAL_INPUT: 'terminal:input',
  TERMINAL_RESIZE: 'terminal:resize',
  // Renderer → Main (invoke/handle)
  LIST_DIR: 'files:list-dir',
  READ_TEXT: 'files:read-text',
} as const

// --- Session types ---

export type SessionStatus = 'running' | 'needs_input' | 'done' | 'failed' | 'active'

export interface FileActivity {
  path: string
  operation: 'read' | 'write' | 'edit' | 'create' | 'delete'
  timestamp: string
}

export interface SessionState {
  id: string
  projectSlug: string
  projectName: string
  status: SessionStatus
  startedAt: string
  startedBy: 'canvas' | 'external'
  byteOffset: number
  recentFiles: FileActivity[]
}

// --- File types ---

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  size: number
  modifiedAt: string
}
```

**Step 2: Verify the build compiles**

```bash
npm run build
```

**Expected:** Build succeeds. The existing code in `ipc.ts` and `preload/index.ts` still imports `IPC_CHANNELS` and the 4 terminal channels haven't changed names, so nothing breaks.

**Step 3: Run all tests**

```bash
npx playwright test
```

**Expected:** All existing tests pass.

**Step 4: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(types): expand IPC channels and add SessionState, FileActivity, FileEntry types"
```

---

### Task 3: E2E Test Fixtures

We create the test fixture directory and data **before** any implementation, so tests can be written test-first for Tasks 4-11.

**Files:**
- Create: `e2e/fixtures/amplifier-home/projects/team-pulse/sessions/tp-session-001/events.jsonl`
- Create: `e2e/fixtures/amplifier-home/projects/team-pulse/sessions/tp-session-002/events.jsonl`
- Create: `e2e/fixtures/amplifier-home/projects/ridecast/sessions/rc-session-001/events.jsonl`
- Modify: `e2e/fixtures.ts`

**Step 1: Create fixture directory structure and event files**

Create the directory and the first events file. This simulates a completed session with file operations.

Create file `e2e/fixtures/amplifier-home/projects/team-pulse/sessions/tp-session-001/events.jsonl`:

```
{"type":"session:start","timestamp":"2026-04-07T10:00:00Z","data":{"sessionId":"tp-session-001","projectSlug":"team-pulse"}}
{"type":"tool_call","timestamp":"2026-04-07T10:00:05Z","data":{"tool":"read_file","args":{"path":"src/app.ts"}}}
{"type":"tool_call","timestamp":"2026-04-07T10:00:10Z","data":{"tool":"write_file","args":{"path":"src/app.ts"}}}
{"type":"tool_call","timestamp":"2026-04-07T10:00:15Z","data":{"tool":"edit_file","args":{"path":"src/utils.ts"}}}
{"type":"assistant_message","timestamp":"2026-04-07T10:00:20Z","data":{"text":"Done. I updated app.ts and utils.ts."}}
{"type":"session:end","timestamp":"2026-04-07T10:00:25Z","data":{"exitCode":0}}
```

Create file `e2e/fixtures/amplifier-home/projects/team-pulse/sessions/tp-session-002/events.jsonl`:

```
{"type":"session:start","timestamp":"2026-04-07T11:00:00Z","data":{"sessionId":"tp-session-002","projectSlug":"team-pulse"}}
{"type":"tool_call","timestamp":"2026-04-07T11:00:05Z","data":{"tool":"create_file","args":{"path":"src/new-feature.ts"}}}
{"type":"assistant_message","timestamp":"2026-04-07T11:00:10Z","data":{"text":"I created the new feature file."}}
```

This second session has no `session:end` — the last event is an assistant message with no pending tool calls, so status should be `needs_input`.

Create file `e2e/fixtures/amplifier-home/projects/ridecast/sessions/rc-session-001/events.jsonl`:

```
{"type":"session:start","timestamp":"2026-04-07T09:00:00Z","data":{"sessionId":"rc-session-001","projectSlug":"ridecast"}}
{"type":"tool_call","timestamp":"2026-04-07T09:00:05Z","data":{"tool":"read_file","args":{"path":"README.md"}}}
{"type":"session:end","timestamp":"2026-04-07T09:00:10Z","data":{"exitCode":0}}
```

**Step 2: Update e2e/fixtures.ts to support AMPLIFIER_HOME override**

Replace the entire contents of `e2e/fixtures.ts` with:

```typescript
import { test as base, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { resolve } from 'path'

const FIXTURES_DIR = resolve(__dirname, 'fixtures', 'amplifier-home')

const ELECTRON_LAUNCH_OPTIONS = {
  args: ['.'],
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: 'test',
    AMPLIFIER_HOME: FIXTURES_DIR,
  }
} as const

type ElectronFixtures = {
  electronApp: ElectronApplication
  appWindow: Page
}

export const test = base.extend<{}, ElectronFixtures>({
  electronApp: [
    async ({}, use) => {
      const electronApp = await electron.launch(ELECTRON_LAUNCH_OPTIONS)

      try {
        await use(electronApp)
      } finally {
        await electronApp.close()
      }
    },
    { scope: 'worker' }
  ],
  appWindow: [
    async ({ electronApp }, use) => {
      const appWindow = await electronApp.firstWindow()
      await appWindow.waitForLoadState('domcontentloaded')
      await use(appWindow)
    },
    { scope: 'worker' }
  ]
})

export { expect } from '@playwright/test'
export { FIXTURES_DIR }
```

**Step 3: Verify build and tests**

```bash
npm run build && npx playwright test
```

**Expected:** All existing tests pass. The `AMPLIFIER_HOME` env var is set but no code reads it yet, so it's a no-op. The fixture files are inert JSON sitting on disk.

**Step 4: Commit**

```bash
git add e2e/fixtures/ e2e/fixtures.ts
git commit -m "feat(test): add e2e fixture directory with fake Amplifier sessions and AMPLIFIER_HOME override"
```

---

### Task 4: SQLite Module

**Files:**
- Create: `src/main/db.ts`
- Test: `e2e/data-layer.spec.ts` (first tests)

**Step 1: Write the failing test**

Create file `e2e/data-layer.spec.ts`:

```typescript
import { test, expect } from './fixtures'

// --- D1: Database initialization ---

test('D1: app starts without crashing when AMPLIFIER_HOME is set to fixtures', async ({ appWindow }) => {
  // The app launched with AMPLIFIER_HOME pointing to e2e/fixtures/amplifier-home.
  // If db.ts or scanner.ts crashes, the window won't load.
  const title = await appWindow.title()
  expect(title).toBe('Amplifier Canvas')
})
```

Run:
```bash
npx playwright test e2e/data-layer.spec.ts -v
```

**Expected:** PASS — this is a sanity test that the app still boots with AMPLIFIER_HOME set. It should pass even before db.ts exists, since nothing reads the env var yet.

**Step 2: Write the SQLite module**

Create file `src/main/db.ts`:

```typescript
import Database from 'better-sqlite3'
import type BetterSqlite3 from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { join } from 'path'
import os from 'os'

let db: BetterSqlite3.Database | null = null

function getAmplifierHome(): string {
  return process.env['AMPLIFIER_HOME'] || join(os.homedir(), '.amplifier')
}

export function getCanvasDbPath(): string {
  const canvasDir = join(getAmplifierHome(), 'canvas')
  mkdirSync(canvasDir, { recursive: true })
  return join(canvasDir, 'canvas.db')
}

export function initDatabase(dbPath?: string): BetterSqlite3.Database {
  const resolvedPath = dbPath || getCanvasDbPath()
  db = new Database(resolvedPath)
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      slug TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      name TEXT NOT NULL,
      addedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      projectSlug TEXT NOT NULL,
      startedBy TEXT NOT NULL DEFAULT 'external',
      startedAt TEXT NOT NULL,
      endedAt TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      byteOffset INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (projectSlug) REFERENCES projects(slug)
    );
  `)

  return db
}

export function getDatabase(): BetterSqlite3.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

export function upsertProject(slug: string, path: string, name: string): void {
  const d = getDatabase()
  d.prepare(`
    INSERT INTO projects (slug, path, name) VALUES (?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET path = excluded.path, name = excluded.name
  `).run(slug, path, name)
}

export function upsertSession(session: {
  id: string
  projectSlug: string
  startedBy: string
  startedAt: string
  status: string
  byteOffset: number
}): void {
  const d = getDatabase()
  d.prepare(`
    INSERT INTO sessions (id, projectSlug, startedBy, startedAt, status, byteOffset)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      byteOffset = excluded.byteOffset
  `).run(session.id, session.projectSlug, session.startedBy, session.startedAt, session.status, session.byteOffset)
}

export function updateSessionStatus(id: string, status: string): void {
  const d = getDatabase()
  d.prepare('UPDATE sessions SET status = ? WHERE id = ?').run(status, id)
}

export function updateByteOffset(id: string, offset: number): void {
  const d = getDatabase()
  d.prepare('UPDATE sessions SET byteOffset = ? WHERE id = ?').run(offset, id)
}

export interface ProjectRow {
  slug: string
  path: string
  name: string
  addedAt: string
}

export interface SessionRow {
  id: string
  projectSlug: string
  startedBy: string
  startedAt: string
  endedAt: string | null
  status: string
  byteOffset: number
}

export function getAllProjects(): ProjectRow[] {
  const d = getDatabase()
  return d.prepare('SELECT * FROM projects ORDER BY name').all() as ProjectRow[]
}

export function getProjectSessions(slug: string): SessionRow[] {
  const d = getDatabase()
  return d.prepare('SELECT * FROM sessions WHERE projectSlug = ? ORDER BY startedAt DESC').all(slug) as SessionRow[]
}

export function getAllSessions(): SessionRow[] {
  const d = getDatabase()
  return d.prepare('SELECT * FROM sessions ORDER BY startedAt DESC').all() as SessionRow[]
}
```

**Step 3: Verify the build compiles**

```bash
npm run build
```

**Expected:** Build succeeds. `db.ts` compiles but isn't imported by anything yet.

**Step 4: Run all tests**

```bash
npx playwright test
```

**Expected:** All tests pass, including the new D1 sanity test.

**Step 5: Commit**

```bash
git add src/main/db.ts e2e/data-layer.spec.ts
git commit -m "feat(db): SQLite module with schema, CRUD operations, and AMPLIFIER_HOME support"
```

---

### Task 5: Events Parser

**Files:**
- Create: `src/main/events-parser.ts`

**Step 1: Write the events parser**

Create file `src/main/events-parser.ts`:

```typescript
import { readFileSync, statSync } from 'fs'
import type { FileActivity, SessionStatus } from '../shared/types'

export interface ParsedEvent {
  type: string
  timestamp: string
  data: Record<string, unknown>
}

export interface TailReadResult {
  events: ParsedEvent[]
  newByteOffset: number
}

export function tailReadEvents(filePath: string, fromByte: number): TailReadResult {
  let fileSize: number
  try {
    fileSize = statSync(filePath).size
  } catch {
    return { events: [], newByteOffset: fromByte }
  }

  if (fileSize <= fromByte) {
    return { events: [], newByteOffset: fromByte }
  }

  const buffer = Buffer.alloc(fileSize - fromByte)
  const fd = require('fs').openSync(filePath, 'r')
  try {
    require('fs').readSync(fd, buffer, 0, buffer.length, fromByte)
  } finally {
    require('fs').closeSync(fd)
  }

  const text = buffer.toString('utf-8')
  const lines = text.split('\n').filter((line) => line.trim().length > 0)
  const events: ParsedEvent[] = []

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as ParsedEvent
      if (parsed.type && parsed.timestamp) {
        events.push(parsed)
      }
    } catch {
      // Skip malformed JSON lines — log and continue
      console.warn(`[events-parser] Skipping malformed line in ${filePath}: ${line.substring(0, 80)}`)
    }
  }

  return { events, newByteOffset: fileSize }
}

export function deriveSessionStatus(events: ParsedEvent[]): SessionStatus {
  if (events.length === 0) {
    return 'active'
  }

  const lastEvent = events[events.length - 1]

  if (lastEvent.type === 'session:end') {
    const exitCode = (lastEvent.data as Record<string, unknown>)?.exitCode
    return exitCode !== 0 ? 'failed' : 'done'
  }

  // If last event is a tool_call, session is running
  if (lastEvent.type === 'tool_call') {
    return 'running'
  }

  // If last event is an assistant message with no pending tool calls
  if (lastEvent.type === 'assistant_message') {
    return 'needs_input'
  }

  // Default: check recency — if last event within 30s, running
  const lastTimestamp = new Date(lastEvent.timestamp).getTime()
  const now = Date.now()
  if (now - lastTimestamp < 30_000) {
    return 'running'
  }

  return 'active'
}

const TOOL_TO_OPERATION: Record<string, FileActivity['operation']> = {
  read_file: 'read',
  write_file: 'write',
  edit_file: 'edit',
  create_file: 'create',
  apply_patch: 'edit',
  delete_file: 'delete',
}

export function extractFileActivity(events: ParsedEvent[]): FileActivity[] {
  const activities: FileActivity[] = []

  for (const event of events) {
    if (event.type !== 'tool_call') continue

    const data = event.data as Record<string, unknown>
    const tool = data.tool as string | undefined
    if (!tool) continue

    const operation = TOOL_TO_OPERATION[tool]
    if (!operation) continue

    const args = data.args as Record<string, unknown> | undefined
    const filePath = args?.path as string | undefined
    if (!filePath) continue

    activities.push({
      path: filePath,
      operation,
      timestamp: event.timestamp,
    })
  }

  return activities
}
```

**Step 2: Verify the build compiles**

```bash
npm run build
```

**Expected:** Build succeeds. `events-parser.ts` compiles but isn't imported by anything yet.

**Step 3: Run all tests**

```bash
npx playwright test
```

**Expected:** All tests pass.

**Step 4: Commit**

```bash
git add src/main/events-parser.ts
git commit -m "feat(parser): events.jsonl tail-reader with status derivation and file activity extraction"
```

---

### Task 6: Startup Scanner

**Files:**
- Create: `src/main/scanner.ts`

**Step 1: Write the startup scanner**

Create file `src/main/scanner.ts`:

```typescript
import { readdirSync, existsSync, statSync } from 'fs'
import { join, basename } from 'path'
import os from 'os'
import { upsertProject, upsertSession } from './db'
import { tailReadEvents, deriveSessionStatus, extractFileActivity } from './events-parser'
import type { SessionState, FileActivity } from '../shared/types'

export function getAmplifierHome(): string {
  return process.env['AMPLIFIER_HOME'] || join(os.homedir(), '.amplifier')
}

export interface ScanResult {
  projectCount: number
  sessionCount: number
  sessions: SessionState[]
}

export function scanProjects(amplifierHome?: string): ScanResult {
  const home = amplifierHome || getAmplifierHome()
  const projectsDir = join(home, 'projects')

  if (!existsSync(projectsDir)) {
    console.log('[scanner] No projects directory found at', projectsDir)
    return { projectCount: 0, sessionCount: 0, sessions: [] }
  }

  const allSessions: SessionState[] = []
  let projectCount = 0

  const projectDirs = readdirSync(projectsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())

  for (const projectDir of projectDirs) {
    const projectSlug = projectDir.name
    const projectPath = join(projectsDir, projectSlug)
    const projectName = slugToName(projectSlug)

    upsertProject(projectSlug, projectPath, projectName)
    projectCount++

    const sessionsDir = join(projectPath, 'sessions')
    if (!existsSync(sessionsDir)) continue

    const sessionDirs = readdirSync(sessionsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())

    for (const sessionDir of sessionDirs) {
      const sessionId = sessionDir.name
      const eventsPath = join(sessionsDir, sessionId, 'events.jsonl')

      if (!existsSync(eventsPath)) continue

      const { events, newByteOffset } = tailReadEvents(eventsPath, 0)
      const status = deriveSessionStatus(events)
      const recentFiles = extractFileActivity(events)

      // Extract startedAt from first event, or fall back to file mtime
      let startedAt: string
      const startEvent = events.find((e) => e.type === 'session:start')
      if (startEvent) {
        startedAt = startEvent.timestamp
      } else {
        startedAt = statSync(eventsPath).mtime.toISOString()
      }

      upsertSession({
        id: sessionId,
        projectSlug,
        startedBy: 'external',
        startedAt,
        status,
        byteOffset: newByteOffset,
      })

      allSessions.push({
        id: sessionId,
        projectSlug,
        projectName,
        status,
        startedAt,
        startedBy: 'external',
        byteOffset: newByteOffset,
        recentFiles,
      })
    }
  }

  console.log(`[scanner] Found ${projectCount} projects, ${allSessions.length} sessions`)
  return { projectCount, sessionCount: allSessions.length, sessions: allSessions }
}

function slugToName(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
```

**Step 2: Verify the build compiles**

```bash
npm run build
```

**Expected:** Build succeeds.

**Step 3: Run all tests**

```bash
npx playwright test
```

**Expected:** All tests pass.

**Step 4: Commit**

```bash
git add src/main/scanner.ts
git commit -m "feat(scanner): startup scanner discovers projects and sessions from disk"
```

---

### Task 7: File Watcher

**Files:**
- Create: `src/main/watcher.ts`

**Step 1: Write the file watcher module**

Create file `src/main/watcher.ts`:

```typescript
import chokidar from 'chokidar'
import type { FSWatcher } from 'chokidar'
import { join, relative, sep } from 'path'
import { existsSync } from 'fs'

export type WatchEventType = 'session-updated' | 'project-added'

export interface WatchEventData {
  projectSlug: string
  sessionId?: string
}

export type WatchCallback = (event: WatchEventType, data: WatchEventData) => void

let watcher: FSWatcher | null = null

// Per-session debounce timers (max 2Hz = 500ms)
const debounceTimers = new Map<string, NodeJS.Timeout>()

export function startWatching(amplifierHome: string, onChange: WatchCallback): void {
  const projectsDir = join(amplifierHome, 'projects')

  if (!existsSync(projectsDir)) {
    console.log('[watcher] Projects directory does not exist, skipping watch:', projectsDir)
    return
  }

  // Watch for events.jsonl changes (session updates)
  // and new directories (new projects/sessions)
  watcher = chokidar.watch(projectsDir, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 200,
    },
    depth: 4, // projects/{slug}/sessions/{id}/events.jsonl
  })

  watcher.on('change', (filePath: string) => {
    if (!filePath.endsWith('events.jsonl')) return

    const parsed = parseEventPath(projectsDir, filePath)
    if (!parsed) return

    // Debounce: max 2Hz per session
    const key = `${parsed.projectSlug}/${parsed.sessionId}`
    const existing = debounceTimers.get(key)
    if (existing) clearTimeout(existing)

    debounceTimers.set(
      key,
      setTimeout(() => {
        debounceTimers.delete(key)
        onChange('session-updated', parsed)
      }, 500)
    )
  })

  watcher.on('addDir', (dirPath: string) => {
    const rel = relative(projectsDir, dirPath)
    const parts = rel.split(sep)

    // New project directory: just one segment, e.g. "my-project"
    if (parts.length === 1 && parts[0].length > 0) {
      onChange('project-added', { projectSlug: parts[0] })
    }
  })

  console.log('[watcher] Watching', projectsDir)
}

export function stopWatching(): void {
  if (watcher) {
    void watcher.close()
    watcher = null
  }
  for (const timer of debounceTimers.values()) {
    clearTimeout(timer)
  }
  debounceTimers.clear()
}

function parseEventPath(
  projectsDir: string,
  filePath: string
): { projectSlug: string; sessionId: string } | null {
  const rel = relative(projectsDir, filePath)
  // Expected: {projectSlug}/sessions/{sessionId}/events.jsonl
  const parts = rel.split(sep)
  if (parts.length === 4 && parts[1] === 'sessions' && parts[3] === 'events.jsonl') {
    return { projectSlug: parts[0], sessionId: parts[2] }
  }
  return null
}
```

**Step 2: Verify the build compiles**

```bash
npm run build
```

**Expected:** Build succeeds.

**Step 3: Run all tests**

```bash
npx playwright test
```

**Expected:** All tests pass.

**Step 4: Commit**

```bash
git add src/main/watcher.ts
git commit -m "feat(watcher): chokidar file watcher with 500ms debounce for session updates"
```

---

### Task 8: PTY Refactor

**This is the highest-risk task — it modifies code that existing T3/T5 tests depend on.**

**Files:**
- Modify: `src/main/pty.ts`
- Modify: `src/main/ipc.ts`

**Step 1: Refactor pty.ts from singleton to session map**

Replace the entire contents of `src/main/pty.ts` with:

```typescript
import * as pty from 'node-pty'
import type { IPty } from 'node-pty'
import os from 'os'

const ptyProcesses = new Map<string, IPty>()

const DEFAULT_SESSION_ID = 'default'

export function spawnPty(sessionId: string, cols: number, rows: number): IPty
export function spawnPty(cols: number, rows: number): IPty
export function spawnPty(
  sessionIdOrCols: string | number,
  colsOrRows: number,
  maybeRows?: number
): IPty {
  let sessionId: string
  let cols: number
  let rows: number

  if (typeof sessionIdOrCols === 'string') {
    sessionId = sessionIdOrCols
    cols = colsOrRows
    rows = maybeRows!
  } else {
    sessionId = DEFAULT_SESSION_ID
    cols = sessionIdOrCols
    rows = colsOrRows
  }

  const shell =
    process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : '/bin/zsh')

  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: process.env.HOME || os.homedir(),
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    } as Record<string, string>,
  })

  ptyProcesses.set(sessionId, ptyProcess)
  return ptyProcess
}

export function getPty(sessionId: string = DEFAULT_SESSION_ID): IPty | null {
  return ptyProcesses.get(sessionId) || null
}

export function writeToPty(data: string): void
export function writeToPty(sessionId: string, data: string): void
export function writeToPty(sessionIdOrData: string, maybeData?: string): void {
  let sessionId: string
  let data: string

  if (maybeData !== undefined) {
    sessionId = sessionIdOrData
    data = maybeData
  } else {
    sessionId = DEFAULT_SESSION_ID
    data = sessionIdOrData
  }

  const ptyProcess = ptyProcesses.get(sessionId)
  if (ptyProcess) {
    ptyProcess.write(data)
  }
}

export function resizePty(cols: number, rows: number): void
export function resizePty(sessionId: string, cols: number, rows: number): void
export function resizePty(
  sessionIdOrCols: string | number,
  colsOrRows: number,
  maybeRows?: number
): void {
  let sessionId: string
  let cols: number
  let rows: number

  if (typeof sessionIdOrCols === 'string') {
    sessionId = sessionIdOrCols
    cols = colsOrRows
    rows = maybeRows!
  } else {
    sessionId = DEFAULT_SESSION_ID
    cols = sessionIdOrCols
    rows = colsOrRows
  }

  const ptyProcess = ptyProcesses.get(sessionId)
  if (ptyProcess) {
    ptyProcess.resize(cols, rows)
  }
}

export function killPty(sessionId: string = DEFAULT_SESSION_ID): void {
  const ptyProcess = ptyProcesses.get(sessionId)
  if (ptyProcess) {
    ptyProcess.kill()
    ptyProcesses.delete(sessionId)
  }
}

export function killAllPtys(): void {
  for (const [sessionId, ptyProcess] of ptyProcesses) {
    ptyProcess.kill()
    ptyProcesses.delete(sessionId)
  }
}
```

**Step 2: Verify the build compiles**

```bash
npm run build
```

**Expected:** Build succeeds. `ipc.ts` still calls `spawnPty(80, 24)`, `writeToPty(data)`, `resizePty(cols, rows)`, and `killPty()` — all of which match the backwards-compatible overloads.

**Step 3: Run ALL tests (especially T3 and T5)**

```bash
npx playwright test
```

**Expected:** ALL tests pass, including T3 (typing a command produces output, shell persists, ANSI colors, window resize) and T5 (Ctrl+C, arrow keys, Ctrl+D, tab completion). The backwards-compatible overloads ensure `ipc.ts` didn't need any changes.

**Step 4: Commit**

```bash
git add src/main/pty.ts
git commit -m "refactor(pty): singleton to session-keyed Map with backwards-compatible overloads"
```

---

### Task 9: IPC Expansion

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/env.d.ts`
- Modify: `src/main/index.ts`

**Step 1: Write the failing test**

Add to `e2e/data-layer.spec.ts`:

```typescript
// --- D2: IPC bridge exposes new methods ---

test('D2: electronAPI exposes session and file IPC methods', async ({ appWindow }) => {
  const apiShape = await appWindow.evaluate(() => ({
    hasOnSessionsChanged: typeof window.electronAPI?.onSessionsChanged === 'function',
    hasOnFilesChanged: typeof window.electronAPI?.onFilesChanged === 'function',
    hasListDir: typeof window.electronAPI?.listDir === 'function',
    hasReadTextFile: typeof window.electronAPI?.readTextFile === 'function',
  }))

  expect(apiShape.hasOnSessionsChanged).toBe(true)
  expect(apiShape.hasOnFilesChanged).toBe(true)
  expect(apiShape.hasListDir).toBe(true)
  expect(apiShape.hasReadTextFile).toBe(true)
})
```

Run:
```bash
npx playwright test e2e/data-layer.spec.ts -v
```

**Expected:** FAIL — `onSessionsChanged`, `onFilesChanged`, `listDir`, and `readTextFile` don't exist on `window.electronAPI` yet.

**Step 2: Expand the preload bridge**

Replace the entire contents of `src/preload/index.ts` with:

```typescript
import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/types'
import type { SessionState, FileActivity, FileEntry } from '../shared/types'

// Expose protected APIs to the renderer process via contextBridge
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

  // Terminal: PTY process exited
  onTerminalExit: (callback: (info: { exitCode: number; signal?: number }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: { exitCode: number; signal?: number }): void => {
      callback(info)
    }
    ipcRenderer.on(IPC_CHANNELS.TERMINAL_EXIT, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.TERMINAL_EXIT, handler)
    }
  },

  // Sessions: receive updated session list
  onSessionsChanged: (callback: (sessions: SessionState[]) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, sessions: SessionState[]): void => {
      callback(sessions)
    }
    ipcRenderer.on(IPC_CHANNELS.SESSIONS_CHANGED, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.SESSIONS_CHANGED, handler)
    }
  },

  // Files: receive updated file activity for a session
  onFilesChanged: (callback: (data: { sessionId: string; files: FileActivity[] }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string; files: FileActivity[] }): void => {
      callback(data)
    }
    ipcRenderer.on(IPC_CHANNELS.FILES_CHANGED, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.FILES_CHANGED, handler)
    }
  },

  // Files: list directory contents
  listDir: (path: string): Promise<FileEntry[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.LIST_DIR, { path })
  },

  // Files: read text file contents
  readTextFile: (path: string): Promise<string> => {
    return ipcRenderer.invoke(IPC_CHANNELS.READ_TEXT, { path })
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)

// Type declaration for the renderer
export type ElectronAPI = typeof api
```

**Step 3: Expand ipc.ts with new handlers and push functions**

Replace the entire contents of `src/main/ipc.ts` with:

```typescript
import { ipcMain, BrowserWindow } from 'electron'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, resolve, normalize } from 'path'
import { IPC_CHANNELS } from '../shared/types'
import type { SessionState, FileActivity, FileEntry } from '../shared/types'
import { spawnPty, writeToPty, resizePty, killPty } from './pty'
import { getAmplifierHome } from './scanner'

// Track allowed directories for file access security
let allowedDirs: string[] = []

export function setAllowedDirs(dirs: string[]): void {
  allowedDirs = dirs.map((d) => resolve(normalize(d)))
}

function isPathAllowed(requestedPath: string): boolean {
  const resolved = resolve(normalize(requestedPath))
  return allowedDirs.some((dir) => resolved.startsWith(dir))
}

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  const ptyProcess = spawnPty(80, 24)

  ptyProcess.onData((data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.TERMINAL_DATA, data)
    }
  })

  ptyProcess.onExit(({ exitCode, signal }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.TERMINAL_EXIT, { exitCode, signal })
    }
  })

  const onInput = (_event: Electron.IpcMainEvent, data: string): void => {
    writeToPty(data)
  }

  const onResize = (_event: Electron.IpcMainEvent, { cols, rows }: { cols: number; rows: number }): void => {
    resizePty(cols, rows)
  }

  ipcMain.on(IPC_CHANNELS.TERMINAL_INPUT, onInput)
  ipcMain.on(IPC_CHANNELS.TERMINAL_RESIZE, onResize)

  // --- New IPC handlers for Phase 1C ---

  ipcMain.handle(IPC_CHANNELS.LIST_DIR, (_event, { path }: { path: string }): FileEntry[] => {
    if (!isPathAllowed(path)) {
      console.error('[ipc] Blocked file access to disallowed path:', path)
      return []
    }

    try {
      const entries = readdirSync(path, { withFileTypes: true })
      return entries.map((entry): FileEntry => {
        const fullPath = join(path, entry.name)
        let size = 0
        let modifiedAt = new Date().toISOString()

        try {
          const stat = statSync(fullPath)
          size = stat.size
          modifiedAt = stat.mtime.toISOString()
        } catch {
          // stat failed — return defaults
        }

        return {
          name: entry.name,
          path: fullPath,
          isDirectory: entry.isDirectory(),
          size,
          modifiedAt,
        }
      })
    } catch {
      console.error('[ipc] Failed to list directory:', path)
      return []
    }
  })

  ipcMain.handle(IPC_CHANNELS.READ_TEXT, (_event, { path }: { path: string }): string => {
    if (!isPathAllowed(path)) {
      console.error('[ipc] Blocked file access to disallowed path:', path)
      return ''
    }

    try {
      return readFileSync(path, 'utf-8')
    } catch {
      console.error('[ipc] Failed to read file:', path)
      return ''
    }
  })

  mainWindow.on('closed', () => {
    ipcMain.removeListener(IPC_CHANNELS.TERMINAL_INPUT, onInput)
    ipcMain.removeListener(IPC_CHANNELS.TERMINAL_RESIZE, onResize)
    ipcMain.removeHandler(IPC_CHANNELS.LIST_DIR)
    ipcMain.removeHandler(IPC_CHANNELS.READ_TEXT)
    killPty()
  })
}

// --- Push functions (Main → Renderer) ---

export function pushSessionsChanged(mainWindow: BrowserWindow, sessions: SessionState[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.SESSIONS_CHANGED, sessions)
  }
}

export function pushFilesChanged(
  mainWindow: BrowserWindow,
  sessionId: string,
  files: FileActivity[]
): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.FILES_CHANGED, { sessionId, files })
  }
}
```

**Step 4: Update env.d.ts to keep the Window type in sync**

The `ElectronAPI` type is re-exported from `preload/index.ts`, so `env.d.ts` already picks it up via the import. No change needed — the import `type { ElectronAPI } from '../../preload/index'` already resolves to the updated type.

Verify `src/renderer/src/env.d.ts` still contains:

```typescript
/// <reference types="vite/client" />

import type { ElectronAPI } from '../../preload/index'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
```

No change needed.

**Step 5: Wire startup scan and watcher into main/index.ts**

Modify `src/main/index.ts`. Add these imports at the top (after the existing imports):

```typescript
import { initDatabase, closeDatabase } from './db'
import { scanProjects, getAmplifierHome } from './scanner'
import { startWatching, stopWatching } from './watcher'
import { pushSessionsChanged, pushFilesChanged, setAllowedDirs } from './ipc'
import { tailReadEvents, deriveSessionStatus, extractFileActivity } from './events-parser'
import { updateSessionStatus, updateByteOffset, getProjectSessions, upsertProject, upsertSession, getAllSessions } from './db'
import type { SessionState } from '../shared/types'
import { join, existsSync } from 'path'
```

Wait — `join` and `existsSync` need special handling because `join` is already imported from `'path'`. Let me be more precise.

In `src/main/index.ts`, the existing imports are:

```typescript
import { app, BrowserWindow, Menu, shell } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { APP_NAME, WINDOW_CONFIG } from '../shared/constants'
import { registerIpcHandlers } from './ipc'
```

Add these new imports right after the existing ones (before `const isMac`):

```typescript
import { existsSync } from 'fs'
import { initDatabase, closeDatabase, upsertProject, upsertSession, updateSessionStatus, updateByteOffset } from './db'
import { scanProjects, getAmplifierHome } from './scanner'
import { startWatching, stopWatching } from './watcher'
import { pushSessionsChanged, pushFilesChanged, setAllowedDirs } from './ipc'
import { tailReadEvents, deriveSessionStatus, extractFileActivity } from './events-parser'
import type { SessionState } from '../shared/types'
```

Then modify the `app.whenReady().then(...)` block. Replace:

```typescript
app.whenReady().then(() => {
  buildAppMenu()
  const mainWindow = createWindow()
  registerIpcHandlers(mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const newWindow = createWindow()
      registerIpcHandlers(newWindow)
    }
  })
})
```

With:

```typescript
app.whenReady().then(() => {
  buildAppMenu()

  // Initialize database
  initDatabase()

  // Scan existing projects from disk
  const amplifierHome = getAmplifierHome()
  const scanResult = scanProjects(amplifierHome)

  // Set allowed directories for file access security
  const projectsDir = join(amplifierHome, 'projects')
  if (existsSync(projectsDir)) {
    const allowedDirs = [projectsDir]
    setAllowedDirs(allowedDirs)
  }

  const mainWindow = createWindow()
  registerIpcHandlers(mainWindow)

  // Push initial session state once the window is ready
  mainWindow.webContents.once('did-finish-load', () => {
    pushSessionsChanged(mainWindow, scanResult.sessions)
  })

  // Start file watching
  startWatching(amplifierHome, (event, data) => {
    if (event === 'session-updated' && data.sessionId) {
      const eventsPath = join(amplifierHome, 'projects', data.projectSlug, 'sessions', data.sessionId, 'events.jsonl')
      const { events, newByteOffset } = tailReadEvents(eventsPath, 0)
      const status = deriveSessionStatus(events)
      const recentFiles = extractFileActivity(events)

      updateSessionStatus(data.sessionId, status)
      updateByteOffset(data.sessionId, newByteOffset)

      // Re-scan all sessions and push full state
      const freshScan = scanProjects(amplifierHome)
      pushSessionsChanged(mainWindow, freshScan.sessions)
      pushFilesChanged(mainWindow, data.sessionId, recentFiles)
    }

    if (event === 'project-added') {
      // Re-scan to pick up the new project
      const freshScan = scanProjects(amplifierHome)
      pushSessionsChanged(mainWindow, freshScan.sessions)
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const newWindow = createWindow()
      registerIpcHandlers(newWindow)
    }
  })
})

app.on('before-quit', () => {
  stopWatching()
  closeDatabase()
})
```

**Step 6: Verify the build compiles**

```bash
npm run build
```

**Expected:** Build succeeds.

**Step 7: Run all tests**

```bash
npx playwright test
```

**Expected:** ALL tests pass, including the new D2 test for the expanded IPC bridge, plus all existing T1-T5 and S1-S5 tests.

**Step 8: Commit**

```bash
git add src/main/ipc.ts src/preload/index.ts src/main/index.ts e2e/data-layer.spec.ts
git commit -m "feat(ipc): expand IPC with session push, file operations, and startup wiring"
```

---

### Task 10: Zustand Store

**Files:**
- Create: `src/renderer/src/store.ts`

**Step 1: Write the failing test**

Add to `e2e/data-layer.spec.ts`:

```typescript
// --- D3: Zustand store receives session data ---

test('D3: renderer receives session state from main process', async ({ appWindow }) => {
  // Wait for the IPC push to arrive — main sends sessions after did-finish-load
  await appWindow.waitForTimeout(2000)

  // The store should have received sessions from the scanner
  const sessionCount = await appWindow.evaluate(() => {
    // Access the Zustand store via a global debug hook we expose in test mode
    const storeEl = document.querySelector('[data-testid="debug-session-count"]')
    return storeEl?.textContent || '0'
  })

  // Fixtures have 3 sessions across 2 projects
  expect(parseInt(sessionCount, 10)).toBe(3)
})
```

Run:
```bash
npx playwright test e2e/data-layer.spec.ts --grep "D3" -v
```

**Expected:** FAIL — the `debug-session-count` element doesn't exist yet.

**Step 2: Write the Zustand store**

Create file `src/renderer/src/store.ts`:

```typescript
import { create } from 'zustand'
import type { SessionState, FileActivity } from '../../shared/types'

interface Project {
  slug: string
  name: string
  sessions: SessionState[]
}

interface CanvasStore {
  // State
  sessions: SessionState[]
  selectedSessionId: string | null
  selectedProjectSlug: string | null

  // Actions
  setSessions: (sessions: SessionState[]) => void
  selectSession: (id: string | null) => void
  selectProject: (slug: string | null) => void
  updateFileActivity: (sessionId: string, files: FileActivity[]) => void

  // Derived
  getProjects: () => Project[]
  getSelectedSession: () => SessionState | null
  getProjectSessions: (slug: string) => SessionState[]
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  // State
  sessions: [],
  selectedSessionId: null,
  selectedProjectSlug: null,

  // Actions
  setSessions: (sessions) => set({ sessions }),

  selectSession: (id) => set({ selectedSessionId: id }),

  selectProject: (slug) =>
    set((state) => ({
      selectedProjectSlug: state.selectedProjectSlug === slug ? null : slug,
    })),

  updateFileActivity: (sessionId, files) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, recentFiles: files } : s
      ),
    })),

  // Derived
  getProjects: () => {
    const { sessions } = get()
    const projectMap = new Map<string, Project>()

    for (const session of sessions) {
      const existing = projectMap.get(session.projectSlug)
      if (existing) {
        existing.sessions.push(session)
      } else {
        projectMap.set(session.projectSlug, {
          slug: session.projectSlug,
          name: session.projectName,
          sessions: [session],
        })
      }
    }

    return Array.from(projectMap.values()).sort((a, b) => a.name.localeCompare(b.name))
  },

  getSelectedSession: () => {
    const { sessions, selectedSessionId } = get()
    if (!selectedSessionId) return null
    return sessions.find((s) => s.id === selectedSessionId) || null
  },

  getProjectSessions: (slug) => {
    const { sessions } = get()
    return sessions.filter((s) => s.projectSlug === slug)
  },
}))
```

**Step 3: Verify the build compiles**

```bash
npm run build
```

**Expected:** Build succeeds. The store is created but not used by any component yet.

**Step 4: Run all tests**

```bash
npx playwright test
```

**Expected:** All existing tests pass. The D3 test will still fail because nothing renders the debug element yet — that gets wired in the sidebar rewire task.

**Step 5: Commit**

```bash
git add src/renderer/src/store.ts
git commit -m "feat(store): Zustand store with session state, project derivation, and IPC actions"
```

---

### Task 11: Sidebar Rewire + IPC Subscription

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/components/Sidebar.tsx`
- Modify: `e2e/sidebar.spec.ts`
- Modify: `e2e/data-layer.spec.ts`

**Step 1: Create the IPC subscription hook in App.tsx**

This hook subscribes to `onSessionsChanged` and `onFilesChanged` from the preload bridge and pushes data into the Zustand store. We also add the debug element for testing.

Replace the entire contents of `src/renderer/src/App.tsx` with:

```typescript
import { useState, useEffect } from 'react'
import TerminalComponent from './components/Terminal'
import Sidebar from './components/Sidebar'
import { useCanvasStore } from './store'

function App(): React.ReactElement {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const sessions = useCanvasStore((s) => s.sessions)
  const setSessions = useCanvasStore((s) => s.setSessions)
  const updateFileActivity = useCanvasStore((s) => s.updateFileActivity)

  // Subscribe to IPC session and file updates from main process
  useEffect(() => {
    if (!window.electronAPI) return

    const cleanupSessions = window.electronAPI.onSessionsChanged((newSessions) => {
      setSessions(newSessions)
    })

    const cleanupFiles = window.electronAPI.onFilesChanged(({ sessionId, files }) => {
      updateFileActivity(sessionId, files)
    })

    return () => {
      cleanupSessions()
      cleanupFiles()
    }
  }, [setSessions, updateFileActivity])

  return (
    <div id="app" style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* S5: Header bar */}
      <div
        data-testid="header-bar"
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
      >
        <span style={{ WebkitAppRegion: 'no-drag' as unknown as string }}>
          Amplifier Canvas
        </span>
      </div>

      {/* Main content: sidebar + terminal */}
      <div style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
      }}>
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
        <div style={{
          flex: 1,
          overflow: 'hidden',
          padding: '4px',
        }}>
          <TerminalComponent />
        </div>
      </div>

      {/* Debug element for e2e tests — hidden */}
      <div data-testid="debug-session-count" style={{ display: 'none' }}>
        {sessions.length}
      </div>
    </div>
  )
}

export default App
```

**Step 2: Rewire Sidebar to use Zustand store**

Replace the entire contents of `src/renderer/src/components/Sidebar.tsx` with:

```typescript
import { useCanvasStore } from '../store'

type SidebarProps = {
  collapsed: boolean
  onToggle: () => void
}

function Sidebar({ collapsed, onToggle }: SidebarProps): React.ReactElement {
  const selectedProjectSlug = useCanvasStore((s) => s.selectedProjectSlug)
  const selectProject = useCanvasStore((s) => s.selectProject)
  const projects = useCanvasStore((s) => s.getProjects())

  return (
    <div
      data-testid="sidebar"
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
    >
      {/* Toggle button */}
      <button
        data-testid="sidebar-toggle"
        onClick={onToggle}
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
      >
        {collapsed ? '\u203a' : '\u2039'}
      </button>

      {/* Project list (hidden when collapsed) */}
      {!collapsed && (
        <div style={{ padding: '4px 8px', flex: 1, overflow: 'auto' }}>
          {projects.map((project) => (
            <div key={project.slug}>
              <div
                data-testid="project-item"
                data-selected={selectedProjectSlug === project.slug ? 'true' : 'false'}
                onClick={() => selectProject(project.slug)}
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
                >
                  {project.name}
                </span>
              </div>

              {/* Session list (visible when project is selected) */}
              {selectedProjectSlug === project.slug && (
                <div style={{ paddingLeft: '8px' }}>
                  {project.sessions.map((session) => (
                    <div
                      key={session.id}
                      data-testid="session-item"
                      style={{ padding: '2px 0' }}
                    >
                      <span
                        data-testid="session-name"
                        style={{
                          fontSize: '10px',
                          color: '#8B8B90',
                        }}
                      >
                        {session.id}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Sidebar
```

**Step 3: Update sidebar tests to match real fixture data**

The sidebar now shows real data from the fixture files instead of hardcoded mocks. The fixture data has 2 projects ("Ridecast" and "Team Pulse") with 3 total sessions. Update `e2e/sidebar.spec.ts`.

Replace the entire contents of `e2e/sidebar.spec.ts` with:

```typescript
import { test, expect } from './fixtures'

// --- S1: Layout Split ---

test('S1: sidebar element exists', async ({ appWindow }) => {
  const sidebar = appWindow.locator('[data-testid="sidebar"]')
  await expect(sidebar).toBeVisible({ timeout: 5000 })
})

test('S1: sidebar has correct default width', async ({ appWindow }) => {
  const sidebar = appWindow.locator('[data-testid="sidebar"]')
  const box = await sidebar.boundingBox()
  expect(box).toBeTruthy()
  expect(box!.width).toBeGreaterThanOrEqual(195)
  expect(box!.width).toBeLessThanOrEqual(210)
})

test('S1: sidebar has warm stone background', async ({ appWindow }) => {
  const sidebar = appWindow.locator('[data-testid="sidebar"]')
  const bg = await sidebar.evaluate((el) => getComputedStyle(el).backgroundColor)
  // #F2F0EB = rgb(242, 240, 235)
  expect(bg).toBe('rgb(242, 240, 235)')
})

test('S1: terminal still fills remaining space', async ({ appWindow }) => {
  const sidebar = appWindow.locator('[data-testid="sidebar"]')
  const terminal = appWindow.locator('.xterm')
  await expect(terminal).toBeVisible({ timeout: 5000 })

  const sidebarBox = await sidebar.boundingBox()
  const terminalBox = await terminal.boundingBox()
  expect(sidebarBox).toBeTruthy()
  expect(terminalBox).toBeTruthy()

  // Terminal should start after sidebar
  expect(terminalBox!.x).toBeGreaterThanOrEqual(sidebarBox!.x + sidebarBox!.width - 5)
})

test('S1: no visible border between sidebar and terminal', async ({ appWindow }) => {
  const sidebar = appWindow.locator('[data-testid="sidebar"]')
  const borderRight = await sidebar.evaluate((el) => getComputedStyle(el).borderRightWidth)
  expect(borderRight).toBe('0px')
})

// --- S2: Project List (now from real fixture data) ---

test('S2: project list shows projects from fixtures', async ({ appWindow }) => {
  // Wait for IPC session data to arrive from main process
  await appWindow.waitForTimeout(2000)
  const projects = appWindow.locator('[data-testid="project-item"]')
  await expect(projects.first()).toBeVisible({ timeout: 5000 })
  const count = await projects.count()
  // Fixtures have 2 projects: team-pulse and ridecast
  expect(count).toBe(2)
})

test('S2: project names have correct font size', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)
  const project = appWindow.locator('[data-testid="project-name"]').first()
  await expect(project).toBeVisible({ timeout: 5000 })
  const fontSize = await project.evaluate((el) => getComputedStyle(el).fontSize)
  expect(fontSize).toBe('11px')
})

test('S2: clicking a project selects it', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)
  const project = appWindow.locator('[data-testid="project-item"]').first()
  await expect(project).toBeVisible({ timeout: 5000 })
  await project.click()
  const selected = await project.getAttribute('data-selected')
  expect(selected).toBe('true')
})

// --- S3: Session List ---

test('S3: selected project shows sessions', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Ensure no project is selected first by clicking an already-selected one to deselect
  const project = appWindow.locator('[data-testid="project-item"]').first()
  await expect(project).toBeVisible({ timeout: 5000 })
  const selected = await project.getAttribute('data-selected')
  if (selected === 'true') {
    await project.click()
    await appWindow.waitForTimeout(200)
  }
  // Now select it fresh
  await project.click()
  await appWindow.waitForTimeout(200)
  const sessions = appWindow.locator('[data-testid="session-item"]')
  await expect(sessions.first()).toBeVisible({ timeout: 3000 })
  const count = await sessions.count()
  expect(count).toBeGreaterThanOrEqual(1)
})

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

// --- S4: Collapse/Expand ---

test('S4: sidebar can be collapsed', async ({ appWindow }) => {
  const toggle = appWindow.locator('[data-testid="sidebar-toggle"]')
  await expect(toggle).toBeVisible({ timeout: 5000 })

  // Ensure expanded first
  const sidebar = appWindow.locator('[data-testid="sidebar"]')
  const beforeBox = await sidebar.boundingBox()
  if (beforeBox && beforeBox.width < 100) {
    await toggle.click()
    await appWindow.waitForTimeout(300)
  }

  // Now collapse
  await toggle.click()
  await appWindow.waitForTimeout(300)

  const box = await sidebar.boundingBox()
  expect(box).toBeTruthy()
  expect(box!.width).toBeLessThanOrEqual(35)
})

test('S4: collapsed sidebar can be expanded', async ({ appWindow }) => {
  const toggle = appWindow.locator('[data-testid="sidebar-toggle"]')
  const sidebar = appWindow.locator('[data-testid="sidebar"]')

  // Ensure collapsed first
  const beforeBox = await sidebar.boundingBox()
  if (beforeBox && beforeBox.width > 100) {
    await toggle.click()
    await appWindow.waitForTimeout(300)
  }

  // Now expand
  await toggle.click()
  await appWindow.waitForTimeout(300)

  const box = await sidebar.boundingBox()
  expect(box).toBeTruthy()
  expect(box!.width).toBeGreaterThanOrEqual(195)
})

// --- S5: Header Bar ---

test('S5: header bar exists with correct background', async ({ appWindow }) => {
  const header = appWindow.locator('[data-testid="header-bar"]')
  await expect(header).toBeVisible({ timeout: 5000 })
  const bg = await header.evaluate((el) => getComputedStyle(el).backgroundColor)
  // #F5F3EE = rgb(245, 243, 238)
  expect(bg).toBe('rgb(245, 243, 238)')
})

test('S5: header bar spans full width', async ({ appWindow }) => {
  const header = appWindow.locator('[data-testid="header-bar"]')
  const headerBox = await header.boundingBox()
  const winSize = await appWindow.evaluate(() => ({ width: window.innerWidth }))
  expect(headerBox).toBeTruthy()
  expect(headerBox!.width).toBeGreaterThanOrEqual(winSize.width - 2)
})

test('S5: header bar has correct height', async ({ appWindow }) => {
  const header = appWindow.locator('[data-testid="header-bar"]')
  const box = await header.boundingBox()
  expect(box).toBeTruthy()
  expect(box!.height).toBeGreaterThanOrEqual(28)
  expect(box!.height).toBeLessThanOrEqual(40)
})

test('S5: header bar is draggable region', async ({ appWindow }) => {
  const header = appWindow.locator('[data-testid="header-bar"]')
  const webkitDrag = await header.evaluate((el) => getComputedStyle(el).getPropertyValue('-webkit-app-region'))
  expect(webkitDrag).toBe('drag')
})
```

**Step 4: Finalize data-layer.spec.ts**

Replace the entire contents of `e2e/data-layer.spec.ts` with the complete test file:

```typescript
import { test, expect } from './fixtures'

// --- D1: Database initialization ---

test('D1: app starts without crashing when AMPLIFIER_HOME is set to fixtures', async ({ appWindow }) => {
  const title = await appWindow.title()
  expect(title).toBe('Amplifier Canvas')
})

// --- D2: IPC bridge exposes new methods ---

test('D2: electronAPI exposes session and file IPC methods', async ({ appWindow }) => {
  const apiShape = await appWindow.evaluate(() => ({
    hasOnSessionsChanged: typeof window.electronAPI?.onSessionsChanged === 'function',
    hasOnFilesChanged: typeof window.electronAPI?.onFilesChanged === 'function',
    hasListDir: typeof window.electronAPI?.listDir === 'function',
    hasReadTextFile: typeof window.electronAPI?.readTextFile === 'function',
  }))

  expect(apiShape.hasOnSessionsChanged).toBe(true)
  expect(apiShape.hasOnFilesChanged).toBe(true)
  expect(apiShape.hasListDir).toBe(true)
  expect(apiShape.hasReadTextFile).toBe(true)
})

// --- D3: Zustand store receives session data ---

test('D3: renderer receives session state from main process', async ({ appWindow }) => {
  // Wait for the IPC push to arrive
  await appWindow.waitForTimeout(2000)

  const sessionCount = await appWindow.evaluate(() => {
    const storeEl = document.querySelector('[data-testid="debug-session-count"]')
    return storeEl?.textContent || '0'
  })

  // Fixtures have 3 sessions across 2 projects
  expect(parseInt(sessionCount, 10)).toBe(3)
})

// --- D4: Sidebar shows real project data ---

test('D4: sidebar displays projects from fixture data', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  const projectNames = await appWindow.evaluate(() => {
    const elements = document.querySelectorAll('[data-testid="project-name"]')
    return Array.from(elements).map((el) => el.textContent)
  })

  // Fixture projects: ridecast and team-pulse (alphabetical: Ridecast, Team Pulse)
  expect(projectNames).toContain('Ridecast')
  expect(projectNames).toContain('Team Pulse')
})

// --- D5: Session status is derived from events.jsonl ---

test('D5: project sessions are listed when project is expanded', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Find and click the "Team Pulse" project (has 2 sessions in fixtures)
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

  const sessions = appWindow.locator('[data-testid="session-item"]')
  await expect(sessions.first()).toBeVisible({ timeout: 3000 })
  const sessionCount = await sessions.count()
  expect(sessionCount).toBe(2)
})
```

**Step 5: Verify the build compiles**

```bash
npm run build
```

**Expected:** Build succeeds.

**Step 6: Run ALL tests**

```bash
npx playwright test
```

**Expected:** ALL tests pass — T1-T5 (terminal), updated S1-S5 (sidebar with real data), D1-D5 (data layer), plus app, cli, and ipc-bridge smoke tests.

**Step 7: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/components/Sidebar.tsx src/renderer/src/store.ts e2e/sidebar.spec.ts e2e/data-layer.spec.ts
git commit -m "feat(sidebar): rewire sidebar from mock data to Zustand store with IPC subscription"
```

---

## Post-flight: Full Verification

After all 11 tasks are complete, run the full verification suite one final time:

```bash
cd /Users/chrispark/Projects/amplifier-canvas
npm run build && npx playwright test
```

**Expected output:** All tests pass. Zero failures.

**What was built:**
- `src/shared/types.ts` — Full type system (7 IPC channels, SessionState, FileActivity, FileEntry)
- `src/main/db.ts` — SQLite module with WAL mode, project/session CRUD
- `src/main/events-parser.ts` — Tail-read events.jsonl, derive status, extract file activity
- `src/main/scanner.ts` — Startup scan of `~/.amplifier/projects/`
- `src/main/watcher.ts` — Chokidar file watcher with 500ms debounce
- `src/main/pty.ts` — Refactored from singleton to session-keyed Map
- `src/main/ipc.ts` — Expanded with file operations, session push, path security
- `src/main/index.ts` — Wired startup scan, watcher, and database lifecycle
- `src/preload/index.ts` — 4 new API methods (onSessionsChanged, onFilesChanged, listDir, readTextFile)
- `src/renderer/src/store.ts` — Zustand store with session state and project derivation
- `src/renderer/src/App.tsx` — IPC subscription hook wiring store to main process
- `src/renderer/src/components/Sidebar.tsx` — Rewired from MOCK_PROJECTS to Zustand store
- `e2e/fixtures/amplifier-home/` — 2 projects, 3 sessions with realistic events.jsonl
- `e2e/fixtures.ts` — AMPLIFIER_HOME env override for test isolation
- `e2e/data-layer.spec.ts` — D1-D5 tests for data infrastructure
- `e2e/sidebar.spec.ts` — Updated S2/S3 tests for real data

**What's next:** Phase 1D (Viewer + Integration) builds on this data layer to add the viewer panel, file rendering, and cross-panel wiring.