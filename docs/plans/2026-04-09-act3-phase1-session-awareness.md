# Act 3 Phase 1: Session Awareness — Implementation Plan

> **Execution:** Use the subagent-driven-development workflow to implement this plan.

**Goal:** Canvas tracks session lifecycle end-to-end — sessions complete, send toast notifications, persist as history, and can be resumed.

**Architecture:** The watcher detects `session:end` events in `events.jsonl` (both canvas-started and external sessions). On detection, a `finalizeSession()` pipeline reads all events, extracts stats and title, writes completion metadata to SQLite, and pushes the enriched `SessionState[]` to the renderer. The store diffs incoming sessions to detect completion transitions and triggers a toast for non-selected sessions. The sidebar splits into active and history sections.

**Tech Stack:** Electron 35 + React 19 + TypeScript + Zustand + better-sqlite3 + Playwright E2E

---

## Prerequisites

Before starting, run from workspace root (`/Users/chrispark/Projects/amplifier-canvas`):

```bash
git checkout -b act3-phase1-session-awareness
npm run build && npx playwright test
```

All existing tests must pass. If they don't, stop and fix before proceeding.

---

## Task 1: Types — New SessionState Fields, Toast Interface, SESSION_RESUME Channel

**Files:**
- Modify: `src/shared/types.ts`

**Step 1: Add new fields to SessionState, Toast interface, and SESSION_RESUME channel**

Open `src/shared/types.ts`. Add five new optional fields to `SessionState`, a `Toast` interface, and a new IPC channel.

Replace the entire file content with:

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
  SESSION_RESUME: 'session:resume',
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
  workDir?: string

  // Phase 1 — Session Awareness
  endedAt?: string
  exitCode?: number
  title?: string
  promptCount?: number
  toolCallCount?: number
  filesChangedCount?: number
}

// --- Toast types ---

export interface Toast {
  id: string
  sessionId: string
  message: string
  action?: { label: string; onClick: () => void }
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

**Step 2: Verify build passes**

```bash
npm run build
```

Expected: Build succeeds. No type errors — all new fields are optional, so no existing code breaks.

**Step 3: Commit**

```bash
git add src/shared/types.ts && git commit -m "feat(types): add session completion fields, Toast interface, SESSION_RESUME channel"
```

---

## Task 2: DB Schema Migration + New Queries

**Files:**
- Modify: `src/main/db.ts`

**Step 1: Add schema migration and new functions**

Open `src/main/db.ts`. Make these changes:

**a) Add column migrations after the CREATE TABLE statements.** Find the closing of `db.exec(...)` (the template literal with CREATE TABLE) and add migrations right after:

After line 42 (`return db` → before it), insert the migration block. Replace the `initDatabase` function with:

```typescript
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

  // Phase 1 — Session Awareness: add completion metadata columns
  const columns = db.pragma('table_info(sessions)') as Array<{ name: string }>
  const columnNames = new Set(columns.map((c) => c.name))

  if (!columnNames.has('title')) {
    db.exec('ALTER TABLE sessions ADD COLUMN title TEXT')
  }
  if (!columnNames.has('exitCode')) {
    db.exec('ALTER TABLE sessions ADD COLUMN exitCode INTEGER')
  }
  if (!columnNames.has('firstPrompt')) {
    db.exec('ALTER TABLE sessions ADD COLUMN firstPrompt TEXT')
  }
  if (!columnNames.has('promptCount')) {
    db.exec('ALTER TABLE sessions ADD COLUMN promptCount INTEGER DEFAULT 0')
  }
  if (!columnNames.has('toolCallCount')) {
    db.exec('ALTER TABLE sessions ADD COLUMN toolCallCount INTEGER DEFAULT 0')
  }
  if (!columnNames.has('filesChangedCount')) {
    db.exec('ALTER TABLE sessions ADD COLUMN filesChangedCount INTEGER DEFAULT 0')
  }

  return db
}
```

**b) Add `finalizeSession` function** after the existing `updateByteOffset` function (after line 95):

```typescript
export function finalizeSession(
  id: string,
  data: {
    status: string
    endedAt: string
    exitCode: number
    title: string
    firstPrompt: string
    promptCount: number
    toolCallCount: number
    filesChangedCount: number
  }
): void {
  const d = getDatabase()
  d.prepare(
    `UPDATE sessions SET
      status = ?, endedAt = ?, exitCode = ?, title = ?,
      firstPrompt = ?, promptCount = ?, toolCallCount = ?, filesChangedCount = ?
    WHERE id = ?`
  ).run(
    data.status,
    data.endedAt,
    data.exitCode,
    data.title,
    data.firstPrompt,
    data.promptCount,
    data.toolCallCount,
    data.filesChangedCount,
    id
  )
}
```

**c) Update `SessionRow` interface** to include new columns. Replace the existing `SessionRow`:

```typescript
export interface SessionRow {
  id: string
  projectSlug: string
  startedBy: string
  startedAt: string
  endedAt: string | null
  status: string
  byteOffset: number
  title: string | null
  exitCode: number | null
  firstPrompt: string | null
  promptCount: number
  toolCallCount: number
  filesChangedCount: number
}
```

**Step 2: Verify build passes**

```bash
npm run build
```

Expected: Build succeeds.

**Step 3: Run existing E2E tests to confirm no regressions**

```bash
npx playwright test
```

Expected: All existing tests pass. The migration is additive (new columns with defaults), so existing data continues to work.

**Step 4: Commit**

```bash
git add src/main/db.ts && git commit -m "feat(db): add session completion columns and finalizeSession query"
```

---

## Task 3: extractFirstPrompt()

**Files:**
- Modify: `src/main/events-parser.ts`
- Create: `tests/events-parser.test.ts`

**Step 1: Create test directory and write the failing test**

Create `tests/events-parser.test.ts`:

```typescript
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { extractFirstPrompt } from '../src/main/events-parser'
import type { ParsedEvent } from '../src/main/events-parser'

describe('extractFirstPrompt', () => {
  it('returns the text of the first user_message event', () => {
    const events: ParsedEvent[] = [
      { type: 'session:start', timestamp: '2026-01-01T00:00:00Z', data: {} },
      { type: 'user_message', timestamp: '2026-01-01T00:00:01Z', data: { text: 'Refactor the auth module' } },
      { type: 'tool_call', timestamp: '2026-01-01T00:00:02Z', data: { tool: 'read_file' } },
      { type: 'user_message', timestamp: '2026-01-01T00:00:03Z', data: { text: 'Second message' } },
    ]
    assert.equal(extractFirstPrompt(events), 'Refactor the auth module')
  })

  it('returns undefined when no user_message events exist', () => {
    const events: ParsedEvent[] = [
      { type: 'session:start', timestamp: '2026-01-01T00:00:00Z', data: {} },
      { type: 'tool_call', timestamp: '2026-01-01T00:00:02Z', data: { tool: 'read_file' } },
    ]
    assert.equal(extractFirstPrompt(events), undefined)
  })

  it('returns undefined for empty events array', () => {
    assert.equal(extractFirstPrompt([]), undefined)
  })

  it('returns undefined when user_message has no text field', () => {
    const events: ParsedEvent[] = [
      { type: 'user_message', timestamp: '2026-01-01T00:00:01Z', data: {} },
    ]
    assert.equal(extractFirstPrompt(events), undefined)
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npx tsx --test tests/events-parser.test.ts
```

Expected: FAIL — `extractFirstPrompt` is not exported from `events-parser.ts`.

**Step 3: Implement extractFirstPrompt**

Open `src/main/events-parser.ts`. Add this function at the bottom of the file (before the closing, after `extractWorkDir`):

```typescript
export function extractFirstPrompt(events: ParsedEvent[]): string | undefined {
  const firstUserMessage = events.find((e) => e.type === 'user_message')
  if (!firstUserMessage) return undefined

  const text = (firstUserMessage.data as Record<string, unknown>).text as string | undefined
  return text || undefined
}
```

**Step 4: Run test to verify it passes**

```bash
npx tsx --test tests/events-parser.test.ts
```

Expected: All 4 tests PASS.

**Step 5: Commit**

```bash
git add src/main/events-parser.ts tests/events-parser.test.ts && git commit -m "feat(events-parser): add extractFirstPrompt()"
```

---

## Task 4: extractSessionStats() + deriveSessionTitle()

**Files:**
- Modify: `src/main/events-parser.ts`
- Modify: `tests/events-parser.test.ts`

**Step 1: Write the failing tests**

Append to `tests/events-parser.test.ts`:

```typescript
import { extractSessionStats, deriveSessionTitle } from '../src/main/events-parser'

describe('extractSessionStats', () => {
  it('counts prompts, tool calls, and unique changed files', () => {
    const events: ParsedEvent[] = [
      { type: 'session:start', timestamp: '2026-01-01T00:00:00Z', data: {} },
      { type: 'user_message', timestamp: '2026-01-01T00:00:01Z', data: { text: 'Do stuff' } },
      { type: 'tool_call', timestamp: '2026-01-01T00:00:02Z', data: { tool: 'read_file', args: { path: 'a.ts' } } },
      { type: 'tool_call', timestamp: '2026-01-01T00:00:03Z', data: { tool: 'write_file', args: { path: 'a.ts' } } },
      { type: 'tool_call', timestamp: '2026-01-01T00:00:04Z', data: { tool: 'edit_file', args: { path: 'b.ts' } } },
      { type: 'assistant_message', timestamp: '2026-01-01T00:00:05Z', data: { text: 'Done' } },
      { type: 'user_message', timestamp: '2026-01-01T00:00:06Z', data: { text: 'Another prompt' } },
      { type: 'session:end', timestamp: '2026-01-01T00:00:07Z', data: { exitCode: 0 } },
    ]
    const stats = extractSessionStats(events)
    assert.equal(stats.promptCount, 2)
    assert.equal(stats.toolCallCount, 3)
    assert.equal(stats.filesChanged.size, 2) // a.ts (write) + b.ts (edit); read doesn't count
    assert.equal(stats.lastEventTimestamp, '2026-01-01T00:00:07Z')
  })

  it('returns zeros for empty events', () => {
    const stats = extractSessionStats([])
    assert.equal(stats.promptCount, 0)
    assert.equal(stats.toolCallCount, 0)
    assert.equal(stats.filesChanged.size, 0)
    assert.equal(stats.lastEventTimestamp, '')
  })

  it('counts create_file and delete_file as changed', () => {
    const events: ParsedEvent[] = [
      { type: 'tool_call', timestamp: '2026-01-01T00:00:01Z', data: { tool: 'create_file', args: { path: 'new.ts' } } },
      { type: 'tool_call', timestamp: '2026-01-01T00:00:02Z', data: { tool: 'delete_file', args: { path: 'old.ts' } } },
    ]
    const stats = extractSessionStats(events)
    assert.equal(stats.filesChanged.size, 2)
    assert.ok(stats.filesChanged.has('new.ts'))
    assert.ok(stats.filesChanged.has('old.ts'))
  })
})

describe('deriveSessionTitle', () => {
  it('returns short prompts unchanged', () => {
    assert.equal(deriveSessionTitle('Fix the login bug'), 'Fix the login bug')
  })

  it('truncates at word boundary around 60 chars', () => {
    const long = 'Refactor the authentication module to use JWT tokens instead of session cookies for better scalability'
    const title = deriveSessionTitle(long)
    assert.ok(title.length <= 63) // 60 + "..." = 63 max
    assert.ok(title.endsWith('...'))
    assert.ok(!title.endsWith(' ...')) // no trailing space before ellipsis
  })

  it('strips markdown formatting', () => {
    assert.equal(deriveSessionTitle('Fix the **bold** bug'), 'Fix the bold bug')
    assert.equal(deriveSessionTitle('Add `code` blocks'), 'Add code blocks')
  })

  it('returns empty string for empty input', () => {
    assert.equal(deriveSessionTitle(''), '')
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
npx tsx --test tests/events-parser.test.ts
```

Expected: FAIL — `extractSessionStats` and `deriveSessionTitle` are not exported.

**Step 3: Implement both functions**

Add to the bottom of `src/main/events-parser.ts`:

```typescript
const WRITE_OPERATIONS = new Set(['write_file', 'edit_file', 'create_file', 'apply_patch', 'delete_file'])

export function extractSessionStats(events: ParsedEvent[]): {
  promptCount: number
  toolCallCount: number
  filesChanged: Set<string>
  lastEventTimestamp: string
} {
  let promptCount = 0
  let toolCallCount = 0
  const filesChanged = new Set<string>()
  let lastEventTimestamp = ''

  for (const event of events) {
    if (event.timestamp) {
      lastEventTimestamp = event.timestamp
    }

    if (event.type === 'user_message') {
      promptCount++
    } else if (event.type === 'tool_call') {
      toolCallCount++

      const data = event.data as Record<string, unknown>
      const tool = data.tool as string | undefined
      if (tool && WRITE_OPERATIONS.has(tool)) {
        const args = data.args as Record<string, unknown> | undefined
        const filePath = args?.path as string | undefined
        if (filePath) {
          filesChanged.add(filePath)
        }
      }
    }
  }

  return { promptCount, toolCallCount, filesChanged, lastEventTimestamp }
}

export function deriveSessionTitle(firstPrompt: string): string {
  if (!firstPrompt) return ''

  // Strip markdown: **bold**, `code`, _italic_, [links](url), # headings
  let clean = firstPrompt
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/\n/g, ' ')
    .trim()

  if (clean.length <= 60) return clean

  // Truncate at word boundary
  const truncated = clean.slice(0, 60)
  const lastSpace = truncated.lastIndexOf(' ')
  const cutPoint = lastSpace > 20 ? lastSpace : 60
  return truncated.slice(0, cutPoint).trimEnd() + '...'
}
```

**Step 4: Run tests to verify they pass**

```bash
npx tsx --test tests/events-parser.test.ts
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/main/events-parser.ts tests/events-parser.test.ts && git commit -m "feat(events-parser): add extractSessionStats() and deriveSessionTitle()"
```

---

## Task 5: Session Enrichment Pipeline + Fixture Updates

**Files:**
- Modify: `src/main/scanner.ts`
- Modify: `src/main/db.ts` (import)
- Modify: `e2e/fixtures/amplifier-home/projects/team-pulse/sessions/tp-session-001/events.jsonl`
- Modify: `e2e/fixtures/amplifier-home/projects/team-pulse/sessions/tp-session-002/events.jsonl`
- Modify: `e2e/fixtures/amplifier-home/projects/ridecast/sessions/rc-session-001/events.jsonl`
- Create: `e2e/fixtures/amplifier-home/projects/team-pulse/sessions/tp-session-003/events.jsonl`
- Modify: `e2e/data-layer.spec.ts` (update expectations)

This task wires the enrichment functions (from Tasks 3-4) into the startup scanner, and updates fixture data so E2E tests can verify the enriched fields.

**Context:** The PTY `onExit` handler fires when the *shell* exits, not when an Amplifier session completes. Session completion is always detected via the `session:end` event in `events.jsonl`, processed by either the startup scanner or the live watcher. This task enriches the startup scanner path. Task 6 enriches the live watcher path.

**Step 1: Update fixture events.jsonl files to include `user_message` events**

Replace `e2e/fixtures/amplifier-home/projects/team-pulse/sessions/tp-session-001/events.jsonl` with:

```
{"type":"session:start","timestamp":"2026-04-07T10:00:00Z","data":{"sessionId":"tp-session-001","projectSlug":"team-pulse","cwd":"../../workdir"}}
{"type":"user_message","timestamp":"2026-04-07T10:00:02Z","data":{"text":"Refactor the auth module to use JWT tokens instead of session cookies"}}
{"type":"tool_call","timestamp":"2026-04-07T10:00:05Z","data":{"tool":"read_file","args":{"path":"src/app.ts"}}}
{"type":"tool_call","timestamp":"2026-04-07T10:00:10Z","data":{"tool":"write_file","args":{"path":"src/app.ts"}}}
{"type":"tool_call","timestamp":"2026-04-07T10:00:15Z","data":{"tool":"edit_file","args":{"path":"src/utils.ts"}}}
{"type":"assistant_message","timestamp":"2026-04-07T10:00:20Z","data":{"text":"Done. I updated app.ts and utils.ts."}}
{"type":"session:end","timestamp":"2026-04-07T10:00:25Z","data":{"exitCode":0}}
```

Replace `e2e/fixtures/amplifier-home/projects/team-pulse/sessions/tp-session-002/events.jsonl` with:

```
{"type":"session:start","timestamp":"2026-04-07T11:00:00Z","data":{"sessionId":"tp-session-002","projectSlug":"team-pulse","cwd":"../../workdir"}}
{"type":"user_message","timestamp":"2026-04-07T11:00:02Z","data":{"text":"Add dark mode support to the app"}}
{"type":"tool_call","timestamp":"2026-04-07T11:00:05Z","data":{"tool":"create_file","args":{"path":"src/new-feature.ts"}}}
{"type":"assistant_message","timestamp":"2026-04-07T11:00:10Z","data":{"text":"I created the new feature file."}}
```

Replace `e2e/fixtures/amplifier-home/projects/ridecast/sessions/rc-session-001/events.jsonl` with:

```
{"type":"session:start","timestamp":"2026-04-07T09:00:00Z","data":{"sessionId":"rc-session-001","projectSlug":"ridecast","cwd":"../../workdir"}}
{"type":"user_message","timestamp":"2026-04-07T09:00:02Z","data":{"text":"Set up the project README with getting started instructions"}}
{"type":"tool_call","timestamp":"2026-04-07T09:00:05Z","data":{"tool":"read_file","args":{"path":"README.md"}}}
{"type":"session:end","timestamp":"2026-04-07T09:00:10Z","data":{"exitCode":0}}
```

Create new failed session `e2e/fixtures/amplifier-home/projects/team-pulse/sessions/tp-session-003/events.jsonl`:

```
{"type":"session:start","timestamp":"2026-04-07T12:00:00Z","data":{"sessionId":"tp-session-003","projectSlug":"team-pulse","cwd":"../../workdir"}}
{"type":"user_message","timestamp":"2026-04-07T12:00:01Z","data":{"text":"Fix the failing database migration"}}
{"type":"tool_call","timestamp":"2026-04-07T12:00:05Z","data":{"tool":"read_file","args":{"path":"src/db.ts"}}}
{"type":"session:end","timestamp":"2026-04-07T12:00:10Z","data":{"exitCode":1}}
```

**Step 2: Update scanner to enrich sessions with title and stats**

Open `src/main/scanner.ts`. Add the new imports at the top — change line 5 from:

```typescript
import { tailReadEvents, deriveSessionStatus, extractFileActivity, extractWorkDir } from './events-parser'
```

to:

```typescript
import {
  tailReadEvents,
  deriveSessionStatus,
  extractFileActivity,
  extractWorkDir,
  extractFirstPrompt,
  extractSessionStats,
  deriveSessionTitle,
} from './events-parser'
```

Now update the session-building loop inside `scanProjects()`. Find the block that builds and pushes `SessionState` (around lines 77-111). Replace the `try` block contents inside the `for (const sessionId of recentNames)` loop (from `const { events, newByteOffset }` through the `allSessions.push(...)`) with:

```typescript
        const { events, newByteOffset } = tailReadEvents(eventsPath, 0)
        const status = deriveSessionStatus(events)
        const recentFiles = extractFileActivity(events)
        const sessionPath = join(sessionsDir, sessionId)
        const workDir = extractWorkDir(events, sessionPath)

        let startedAt: string
        const startEvent = events.find((e) => e.type === 'session:start')
        if (startEvent) {
          startedAt = startEvent.timestamp
        } else {
          startedAt = statSync(eventsPath).mtime.toISOString()
        }

        // Phase 1 enrichment: extract title and stats for completed sessions
        const firstPrompt = extractFirstPrompt(events)
        const title = firstPrompt ? deriveSessionTitle(firstPrompt) : undefined
        const stats = extractSessionStats(events)

        // Find endedAt from session:end event
        const endEvent = events.find((e) => e.type === 'session:end')
        const endedAt = endEvent ? endEvent.timestamp : undefined
        const exitCode = endEvent
          ? ((endEvent.data as Record<string, unknown>).exitCode as number | undefined) ?? undefined
          : undefined

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
          workDir,
          endedAt,
          exitCode,
          title,
          promptCount: stats.promptCount,
          toolCallCount: stats.toolCallCount,
          filesChangedCount: stats.filesChanged.size,
        })
```

**Step 3: Update existing E2E test expectations**

Open `e2e/data-layer.spec.ts`. Two assertions need updating because we added a 4th session (tp-session-003):

Find `expect(parseInt(sessionCount, 10)).toBe(3)` and change to:

```typescript
  expect(parseInt(sessionCount, 10)).toBe(4)
```

Find `expect(sessionCount).toBe(2)` (in test D5, the Team Pulse session count) and change to:

```typescript
  expect(sessionCount).toBe(3)
```

Also find the workDir test `expect(workDirData!.length).toBe(3)` and change to:

```typescript
  expect(workDirData!.length).toBe(4)
```

**Step 4: Add E2E test for enriched session data**

Append to `e2e/data-layer.spec.ts`:

```typescript
// --- D7: Session enrichment (Phase 1) ---

test('D7: completed sessions have title and stats from events.jsonl', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Read session data from the debug element — sessions are in the store
  const enrichedData = await appWindow.evaluate(() => {
    const el = document.querySelector('[data-testid="debug-session-workdirs"]')
    // We need a new debug element for enrichment data; fall back to store check
    return null
  })

  // Instead, verify via a new debug element we'll add
  const sessionTitles = await appWindow.evaluate(() => {
    const storeEl = document.querySelector('[data-testid="debug-session-titles"]')
    if (!storeEl || !storeEl.textContent) return null
    try {
      return JSON.parse(storeEl.textContent) as Array<{ id: string; title?: string; status: string; promptCount?: number }>
    } catch {
      return null
    }
  })

  expect(sessionTitles).not.toBeNull()
  // tp-session-001: completed, has user_message, should have title
  const tp1 = sessionTitles!.find((s) => s.id === 'tp-session-001')
  expect(tp1).toBeTruthy()
  expect(tp1!.status).toBe('done')
  expect(tp1!.title).toContain('Refactor the auth module')
  expect(tp1!.promptCount).toBe(1)

  // tp-session-003: failed session
  const tp3 = sessionTitles!.find((s) => s.id === 'tp-session-003')
  expect(tp3).toBeTruthy()
  expect(tp3!.status).toBe('failed')
  expect(tp3!.title).toContain('Fix the failing database migration')
})
```

**Step 5: Add the debug element in App.tsx**

Open `src/renderer/src/App.tsx`. Find the existing debug elements (around line 194-200). Add a new one after the `debug-session-workdirs` div:

```tsx
      <div data-testid="debug-session-titles" style={{ display: 'none' }}>
        {JSON.stringify(sessions.map((s) => ({ id: s.id, title: s.title, status: s.status, promptCount: s.promptCount, filesChangedCount: s.filesChangedCount })))}
      </div>
```

**Step 6: Build and run tests**

```bash
npm run build && npx playwright test
```

Expected: All tests pass, including the new D7 test verifying enriched session data.

**Step 7: Commit**

```bash
git add -A && git commit -m "feat(scanner): enrich sessions with title and stats on startup scan"
```

---

## Task 6: External Session Completion via Watcher

**Files:**
- Modify: `src/main/index.ts`

**Step 1: Update the watcher callback to include enrichment**

Open `src/main/index.ts`. Add imports for the new enrichment functions. Find line 12:

```typescript
import { tailReadEvents, deriveSessionStatus, extractFileActivity, extractWorkDir } from './events-parser'
```

Replace with:

```typescript
import {
  tailReadEvents,
  deriveSessionStatus,
  extractFileActivity,
  extractWorkDir,
  extractFirstPrompt,
  extractSessionStats,
  deriveSessionTitle,
} from './events-parser'
```

Also add `finalizeSession` to the db import. Find line 8:

```typescript
import { initDatabase, closeDatabase, upsertProject, upsertSession, updateSessionStatus, updateByteOffset } from './db'
```

Replace with:

```typescript
import { initDatabase, closeDatabase, upsertProject, upsertSession, updateSessionStatus, updateByteOffset, finalizeSession } from './db'
```

Now update the watcher callback (inside the `startWatching` call, around line 226-267). Find the block that builds the `SessionState` inside the `if (event === 'session-updated' && data.sessionId)` block. Replace the entire try block:

```typescript
    try {
      if (event === 'session-updated' && data.sessionId) {
        const eventsPath = join(amplifierHome, 'projects', data.projectSlug, 'sessions', data.sessionId, 'events.jsonl')
        const { events, newByteOffset } = tailReadEvents(eventsPath, 0)
        const status = deriveSessionStatus(events)
        const recentFiles = extractFileActivity(events)

        updateSessionStatus(data.sessionId, status)
        updateByteOffset(data.sessionId, newByteOffset)

        const sessionPath = join(projectsDir, data.projectSlug, 'sessions', data.sessionId)
        const workDir = extractWorkDir(events, sessionPath)

        let startedAt: string
        const startEvent = events.find((e: { type: string; timestamp: string }) => e.type === 'session:start')
        if (startEvent) {
          startedAt = startEvent.timestamp
        } else {
          startedAt = new Date().toISOString()
        }

        // Phase 1 enrichment: extract title and stats
        const firstPrompt = extractFirstPrompt(events)
        const title = firstPrompt ? deriveSessionTitle(firstPrompt) : undefined
        const stats = extractSessionStats(events)

        const endEvent = events.find((e: { type: string }) => e.type === 'session:end')
        const endedAt = endEvent ? (endEvent as { timestamp: string }).timestamp : undefined
        const exitCode = endEvent
          ? ((endEvent as { data: Record<string, unknown> }).data.exitCode as number | undefined) ?? undefined
          : undefined

        // If session just completed, finalize in DB
        if ((status === 'done' || status === 'failed') && endedAt) {
          finalizeSession(data.sessionId, {
            status,
            endedAt,
            exitCode: exitCode ?? (status === 'failed' ? 1 : 0),
            title: title || data.sessionId,
            firstPrompt: firstPrompt || '',
            promptCount: stats.promptCount,
            toolCallCount: stats.toolCallCount,
            filesChangedCount: stats.filesChanged.size,
          })
        }

        const session: SessionState = {
          id: data.sessionId,
          projectSlug: data.projectSlug,
          projectName: slugToName(data.projectSlug),
          status,
          startedAt,
          startedBy: 'external',
          byteOffset: newByteOffset,
          recentFiles,
          workDir,
          endedAt,
          exitCode,
          title,
          promptCount: stats.promptCount,
          toolCallCount: stats.toolCallCount,
          filesChangedCount: stats.filesChanged.size,
        }

        liveSessions.set(data.sessionId, session)
        pushSessionsChanged(mainWindow, Array.from(liveSessions.values()))
        pushFilesChanged(mainWindow, data.sessionId, recentFiles)
      }
    } catch (err) {
      console.warn('[watcher] Error handling event:', err instanceof Error ? err.message : String(err))
    }
```

**Step 2: Build and run tests**

```bash
npm run build && npx playwright test
```

Expected: All tests pass. The watcher enrichment mirrors the scanner enrichment — same data, different trigger.

**Step 3: Commit**

```bash
git add src/main/index.ts && git commit -m "feat(watcher): enrich sessions with title and stats on live completion"
```

---

## Task 7: Store — Toast State + Completion Detection

**Files:**
- Modify: `src/renderer/src/store.ts`

**Step 1: Add toast state and completion detection to the store**

Open `src/renderer/src/store.ts`. Replace the entire file with:

```typescript
import { create } from 'zustand'
import type { SessionState, FileActivity, Toast } from '../../shared/types'

interface Project {
  slug: string
  name: string
  sessions: SessionState[]
}

const ACTIVE_STATUSES = new Set(['running', 'active', 'needs_input'])
const COMPLETED_STATUSES = new Set(['done', 'failed'])

interface CanvasStore {
  // State
  sessions: SessionState[]
  selectedSessionId: string | null
  selectedProjectSlug: string | null
  createdProjects: Project[] // Projects created via modal (before any session exists)
  viewerOpen: boolean
  toasts: Toast[]

  // Actions
  setSessions: (sessions: SessionState[]) => void
  selectSession: (id: string | null) => void
  selectProject: (slug: string | null) => void
  updateFileActivity: (sessionId: string, files: FileActivity[]) => void
  createProject: (name: string) => void
  openViewer: () => void
  closeViewer: () => void
  addToast: (toast: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void

  // Derived
  getProjects: () => Project[]
  getSelectedSession: () => SessionState | null
  getProjectSessions: (slug: string) => SessionState[]
}

let toastCounter = 0

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  // State
  sessions: [],
  selectedSessionId: null,
  selectedProjectSlug: null,
  createdProjects: [],
  viewerOpen: false,
  toasts: [],

  // Actions
  setSessions: (incoming) => {
    const current = get().sessions
    const selectedId = get().selectedSessionId

    // Detect completion transitions for non-selected sessions → toast
    for (const newSession of incoming) {
      if (newSession.id === selectedId) continue

      const oldSession = current.find((s) => s.id === newSession.id)
      if (!oldSession) continue

      const wasActive = ACTIVE_STATUSES.has(oldSession.status)
      const isCompleted = COMPLETED_STATUSES.has(newSession.status)

      if (wasActive && isCompleted) {
        const store = get()
        store.addToast({
          sessionId: newSession.id,
          message: `${newSession.title || newSession.id} completed`,
          action: {
            label: 'Review',
            onClick: () => {
              get().selectSession(newSession.id)
              get().openViewer()
            },
          },
        })
      }
    }

    set({ sessions: incoming })
  },

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

  createProject: (name) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    set((state) => ({
      createdProjects: [...state.createdProjects, { slug, name, sessions: [] }],
      selectedProjectSlug: slug,
    }))
  },

  openViewer: () => set({ viewerOpen: true }),
  closeViewer: () => set({ viewerOpen: false }),

  addToast: (toast) => {
    const id = `toast-${++toastCounter}`
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }))
  },

  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  // Derived
  getProjects: () => {
    const { sessions, createdProjects } = get()
    const projectMap = new Map<string, Project>()

    // Include manually created projects (from modal)
    for (const cp of createdProjects) {
      projectMap.set(cp.slug, { slug: cp.slug, name: cp.name, sessions: [] })
    }

    // Merge in session-derived projects
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

**Step 2: Build and run tests**

```bash
npm run build && npx playwright test
```

Expected: All tests pass. The store changes are backward-compatible — `setSessions` still sets sessions, and toasts is a new empty array.

**Step 3: Commit**

```bash
git add src/renderer/src/store.ts && git commit -m "feat(store): add toast state and completion detection in setSessions"
```

---

## Task 8: Toast Component

**Files:**
- Create: `src/renderer/src/components/Toast.tsx`
- Modify: `src/renderer/src/App.tsx`

**Step 1: Create the Toast component**

Create `src/renderer/src/components/Toast.tsx`:

```tsx
import { useEffect } from 'react'
import { useCanvasStore } from '../store'

const AUTO_DISMISS_MS = 5000

function ToastContainer(): React.ReactElement | null {
  const toasts = useCanvasStore((s) => s.toasts)
  const dismissToast = useCanvasStore((s) => s.dismissToast)

  if (toasts.length === 0) return null

  return (
    <div
      data-testid="toast-container"
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => dismissToast(toast.id)} />
      ))}
    </div>
  )
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: { id: string; message: string; action?: { label: string; onClick: () => void } }
  onDismiss: () => void
}): React.ReactElement {
  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div
      data-testid="toast-item"
      style={{
        backgroundColor: 'var(--bg-modal, #F9F9F7)',
        color: 'var(--text-primary, #2A2A2A)',
        padding: '10px 14px',
        borderRadius: 6,
        fontSize: '12px',
        fontFamily: 'var(--font-ui)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        maxWidth: 320,
        animation: 'toast-slide-in 0.2s ease-out',
      }}
    >
      <span style={{ flex: 1 }}>{toast.message}</span>
      {toast.action && (
        <button
          data-testid="toast-action"
          onClick={() => {
            toast.action!.onClick()
            onDismiss()
          }}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--amber, #F59E0B)',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 500,
            padding: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button
        data-testid="toast-dismiss"
        onClick={onDismiss}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-very-muted, #A8A098)',
          cursor: 'pointer',
          fontSize: '14px',
          padding: 0,
          lineHeight: 1,
        }}
      >
        {'\u00d7'}
      </button>
    </div>
  )
}

export default ToastContainer
```

**Step 2: Mount the Toast component in App.tsx**

Open `src/renderer/src/App.tsx`. Add the import at the top, after the existing imports:

```typescript
import ToastContainer from './components/Toast'
```

Add `<ToastContainer />` inside the root `<div id="app">`, just before the closing `</div>`. Place it after the debug elements, right before the final `</div>`:

Find:
```tsx
      <div data-testid="debug-session-titles" style={{ display: 'none' }}>
```

After the debug-session-titles div (and its closing tag), add:

```tsx
      <ToastContainer />
```

**Step 3: Add toast keyframe animation to renderer index.html**

Open `src/renderer/index.html`. Find the `<style>` block and add at the end, before the closing `</style>`:

```css
@keyframes toast-slide-in {
  from { transform: translateY(10px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
```

If there is no `<style>` block, check if the styles are in a CSS file instead and add the keyframe there.

**Step 4: Build and run tests**

```bash
npm run build && npx playwright test
```

Expected: All tests pass. Toast container renders as empty (no toasts in initial state), so no visual change.

**Step 5: Commit**

```bash
git add -A && git commit -m "feat(toast): add Toast component with auto-dismiss and Review action"
```

---

## Task 9: Sidebar Status Dot Transitions

**Files:**
- Modify: `src/renderer/src/components/Sidebar.tsx`
- Modify: `e2e/sidebar.spec.ts`

**Step 1: Write the failing E2E test**

Append to `e2e/sidebar.spec.ts`:

```typescript
// --- S8: Status dot colors match design language ---

test('S8: done sessions show emerald dot, failed sessions show red dot', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Find status dots for completed sessions
  const doneDots = appWindow.locator('[data-testid="status-dot"][data-status="done"]')
  const failedDots = appWindow.locator('[data-testid="status-dot"][data-status="failed"]')

  // tp-session-001 and rc-session-001 are done; tp-session-003 is failed
  await expect(doneDots.first()).toBeVisible({ timeout: 5000 })
  const doneColor = await doneDots.first().evaluate((el) => getComputedStyle(el).backgroundColor)
  // #3ECF8E = rgb(62, 207, 142)
  expect(doneColor).toBe('rgb(62, 207, 142)')

  await expect(failedDots.first()).toBeVisible({ timeout: 5000 })
  const failedColor = await failedDots.first().evaluate((el) => getComputedStyle(el).backgroundColor)
  // #EF4444 = rgb(239, 68, 68)
  expect(failedColor).toBe('rgb(239, 68, 68)')
})
```

**Step 2: Run test to verify it fails**

```bash
npx playwright test e2e/sidebar.spec.ts --grep "S8"
```

Expected: FAIL — the done dot color is currently `#4CAF74` (rgb(76, 175, 116)), not the design-spec `#3ECF8E` (rgb(62, 207, 142)).

**Step 3: Update STATUS_COLORS to match design language**

Open `src/renderer/src/components/Sidebar.tsx`. Find the `STATUS_COLORS` constant (around line 17-23). Replace it with:

```typescript
const STATUS_COLORS: Record<SessionStatus, string> = {
  running: '#F59E0B',    // amber
  active: '#F59E0B',     // amber
  needs_input: '#F59E0B', // amber
  done: '#3ECF8E',       // emerald (design spec)
  failed: '#EF4444',     // red
}
```

**Step 4: Run test to verify it passes**

```bash
npm run build && npx playwright test e2e/sidebar.spec.ts --grep "S8"
```

Expected: PASS.

**Step 5: Run all tests for regression check**

```bash
npx playwright test
```

Expected: All tests pass.

**Step 6: Commit**

```bash
git add src/renderer/src/components/Sidebar.tsx e2e/sidebar.spec.ts && git commit -m "feat(sidebar): update status dot colors to match design language"
```

---

## Task 10: Sidebar History Section + Session Titles

**Files:**
- Modify: `src/renderer/src/components/Sidebar.tsx`
- Modify: `e2e/sidebar.spec.ts`

This is the largest task. The sidebar splits into active sessions (top) and a HISTORY section (bottom) with completed sessions showing title, stats, and relative time.

**Step 1: Write the failing E2E test**

Append to `e2e/sidebar.spec.ts`:

```typescript
// --- S9: History section ---

test('S9: sidebar shows HISTORY divider with completed sessions below it', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  const historyLabel = appWindow.locator('[data-testid="history-label"]')
  await expect(historyLabel).toBeVisible({ timeout: 5000 })
  const text = await historyLabel.textContent()
  expect(text?.toUpperCase()).toContain('HISTORY')
})

test('S9: completed sessions show derived title instead of session ID', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  const historyItems = appWindow.locator('[data-testid="history-item"]')
  await expect(historyItems.first()).toBeVisible({ timeout: 5000 })

  // tp-session-001 should have title "Refactor the auth module..."
  const titles = await historyItems.locator('[data-testid="history-title"]').allTextContents()
  expect(titles.some((t) => t.includes('Refactor the auth module'))).toBe(true)
})

test('S9: history items show stats line with prompts and files', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  const statsLines = appWindow.locator('[data-testid="history-stats"]')
  await expect(statsLines.first()).toBeVisible({ timeout: 5000 })

  // tp-session-001 has 1 prompt and 2 files changed
  const allStats = await statsLines.allTextContents()
  expect(allStats.some((s) => s.includes('1 prompt') && s.includes('2 files'))).toBe(true)
})
```

**Step 2: Run test to verify it fails**

```bash
npx playwright test e2e/sidebar.spec.ts --grep "S9"
```

Expected: FAIL — no `history-label` or `history-item` elements exist yet.

**Step 3: Rewrite the Sidebar component**

Open `src/renderer/src/components/Sidebar.tsx`. Replace the entire file with:

```tsx
import { useMemo } from 'react'
import { useCanvasStore } from '../store'
import type { SessionState, SessionStatus } from '../../../shared/types'

type SidebarProps = {
  collapsed: boolean
  onToggle: () => void
  onNewProject?: () => void
}

interface Project {
  slug: string
  name: string
  sessions: SessionState[]
}

const STATUS_COLORS: Record<SessionStatus, string> = {
  running: '#F59E0B',     // amber
  active: '#F59E0B',      // amber
  needs_input: '#F59E0B', // amber
  done: '#3ECF8E',        // emerald (design spec)
  failed: '#EF4444',      // red
}

const ACTIVE_STATUSES = new Set<SessionStatus>(['running', 'active', 'needs_input'])
const COMPLETED_STATUSES = new Set<SessionStatus>(['done', 'failed'])

function formatRelativeTime(isoDate: string): string {
  const now = Date.now()
  const then = new Date(isoDate).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHr = Math.floor(diffMs / 3_600_000)
  const diffDay = Math.floor(diffMs / 86_400_000)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay === 1) return 'yesterday'
  return `${diffDay} days ago`
}

function formatDuration(startedAt: string, endedAt: string): string {
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  const remainMin = min % 60
  return remainMin > 0 ? `${hr}h ${remainMin}m` : `${hr}h`
}

function formatStats(session: SessionState): string {
  const parts: string[] = []
  if (session.endedAt) {
    parts.push(formatDuration(session.startedAt, session.endedAt))
  }
  if (session.promptCount !== undefined && session.promptCount > 0) {
    parts.push(`${session.promptCount} prompt${session.promptCount !== 1 ? 's' : ''}`)
  }
  if (session.filesChangedCount !== undefined && session.filesChangedCount > 0) {
    parts.push(`${session.filesChangedCount} file${session.filesChangedCount !== 1 ? 's' : ''}`)
  }
  return parts.join(' \u00b7 ')
}

function Sidebar({ collapsed, onToggle, onNewProject }: SidebarProps): React.ReactElement {
  const sessions = useCanvasStore((s) => s.sessions)
  const createdProjects = useCanvasStore((s) => s.createdProjects)
  const selectedProjectSlug = useCanvasStore((s) => s.selectedProjectSlug)
  const selectedSessionId = useCanvasStore((s) => s.selectedSessionId)
  const selectProject = useCanvasStore((s) => s.selectProject)
  const selectSession = useCanvasStore((s) => s.selectSession)
  const openViewer = useCanvasStore((s) => s.openViewer)

  // Derive projects from created projects + sessions
  const projects: Project[] = useMemo(() => {
    const projectMap = new Map<string, Project>()

    // Include manually created projects
    for (const cp of createdProjects) {
      projectMap.set(cp.slug, { slug: cp.slug, name: cp.name, sessions: [] })
    }

    // Merge session-derived projects
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
  }, [sessions, createdProjects])

  return (
    <div
      data-testid="sidebar"
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
        padding: collapsed ? 0 : '12px 0',
      }}
    >
      {/* Collapsed: just the toggle */}
      {collapsed && (
        <button
          data-testid="sidebar-toggle"
          onClick={onToggle}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '6px 8px',
            fontSize: '10px',
            color: 'var(--text-very-muted)',
            textAlign: 'left',
          }}
        >
          {'\u203a'}
        </button>
      )}

      {/* Expanded sidebar */}
      {!collapsed && (
        <>
          {/* Section header: "Projects" + "+" button */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 16px 8px',
            }}
          >
            <span
              data-testid="sidebar-section-label"
              style={{
                fontSize: '10px',
                textTransform: 'uppercase',
                color: 'var(--text-very-muted)',
                letterSpacing: '0.08em',
                fontWeight: 600,
              }}
            >
              Projects
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                data-testid="sidebar-add-btn"
                onClick={onNewProject}
                style={{
                  fontSize: '14px',
                  color: 'var(--text-very-muted)',
                  background: 'none',
                  border: 'none',
                  lineHeight: 1,
                  padding: 0,
                  cursor: 'pointer',
                }}
              >
                +
              </button>
              <button
                data-testid="sidebar-toggle"
                onClick={onToggle}
                style={{
                  fontSize: '14px',
                  color: 'var(--text-very-muted)',
                  background: 'none',
                  border: 'none',
                  lineHeight: 1,
                  padding: 0,
                  cursor: 'pointer',
                }}
              >
                {'\u2039'}
              </button>
            </div>
          </div>

          {/* Content area */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {/* Empty state */}
            {projects.length === 0 && (
              <div
                data-testid="sidebar-empty"
                style={{
                  fontSize: '11px',
                  color: 'var(--text-very-muted)',
                  textAlign: 'center',
                  padding: '12px 16px',
                }}
              >
                No projects yet
              </div>
            )}

            {/* Project + session list */}
            {projects.map((project) => {
              const activeSessions = project.sessions.filter((s) => ACTIVE_STATUSES.has(s.status))
              const completedSessions = project.sessions
                .filter((s) => COMPLETED_STATUSES.has(s.status))
                .sort((a, b) => {
                  const aTime = a.endedAt ? new Date(a.endedAt).getTime() : 0
                  const bTime = b.endedAt ? new Date(b.endedAt).getTime() : 0
                  return bTime - aTime // most recent first
                })
              const hasCompleted = completedSessions.length > 0

              return (
                <div key={project.slug}>
                  {/* Project label */}
                  <div
                    data-testid="project-item"
                    data-selected={selectedProjectSlug === project.slug ? 'true' : 'false'}
                    onClick={() => selectProject(project.slug)}
                    style={{
                      padding: '12px 12px 4px',
                      fontSize: '10px',
                      fontWeight: 600,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: 'var(--text-very-muted)',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    <span data-testid="project-name">{project.name}</span>
                  </div>

                  {/* Active sessions */}
                  <div>
                    {activeSessions.map((session) => (
                      <SessionRow
                        key={session.id}
                        session={session}
                        isSelected={selectedSessionId === session.id}
                        onClick={() => { selectSession(session.id); openViewer() }}
                      />
                    ))}
                  </div>

                  {/* "+ New session" slot — shows when at least one session completed */}
                  {hasCompleted && (
                    <div
                      data-testid="new-session-slot"
                      onClick={onNewProject}
                      style={{
                        height: 28,
                        padding: '0 12px 0 22px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: '11px',
                        color: 'var(--text-very-muted)',
                      }}
                    >
                      + New session
                    </div>
                  )}

                  {/* History section */}
                  {hasCompleted && (
                    <>
                      <div
                        data-testid="history-label"
                        style={{
                          padding: '8px 12px 4px',
                          fontSize: '9px',
                          fontWeight: 600,
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          color: 'var(--text-very-muted)',
                        }}
                      >
                        History
                      </div>
                      {completedSessions.map((session) => (
                        <HistoryRow
                          key={session.id}
                          session={session}
                          isSelected={selectedSessionId === session.id}
                          onClick={() => { selectSession(session.id); openViewer() }}
                        />
                      ))}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function SessionRow({
  session,
  isSelected,
  onClick,
}: {
  session: SessionState
  isSelected: boolean
  onClick: () => void
}): React.ReactElement {
  return (
    <div
      data-testid="session-item"
      data-project-slug={session.projectSlug}
      data-selected={isSelected ? 'true' : 'false'}
      onClick={onClick}
      style={{
        height: 36,
        padding: '0 12px 0 14px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        position: 'relative',
        backgroundColor: isSelected ? 'var(--bg-sidebar-active)' : 'transparent',
        borderLeft: isSelected ? '2px solid var(--amber)' : '2px solid transparent',
        transition: 'background 0.12s ease',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          ;(e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(0,0,0,0.03)'
        }
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.backgroundColor =
          isSelected ? '#E8E0D4' : 'transparent'
      }}
    >
      {/* Status dot */}
      <span
        data-testid="status-dot"
        data-status={session.status}
        style={{
          width: 6,
          height: 6,
          minWidth: 6,
          borderRadius: '50%',
          backgroundColor: STATUS_COLORS[session.status] || 'var(--text-very-muted)',
          display: 'inline-block',
          flexShrink: 0,
        }}
      />

      {/* Session name — use title if available, fall back to ID */}
      <span
        data-testid="session-name"
        style={{
          fontSize: '12px',
          fontWeight: session.status === 'running' || session.status === 'active' ? 600 : 400,
          color: 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
        }}
      >
        {session.title || session.id}
      </span>

      {/* Session status label */}
      <span
        style={{
          fontSize: '11px',
          flexShrink: 0,
          color:
            session.status === 'running' || session.status === 'active'
              ? 'var(--amber)'
              : session.status === 'done'
                ? 'var(--green)'
                : 'var(--text-very-muted)',
        }}
      >
        {session.status === 'running' || session.status === 'active'
          ? 'running'
          : session.status === 'done'
            ? 'done'
            : ''}
      </span>
    </div>
  )
}

function HistoryRow({
  session,
  isSelected,
  onClick,
}: {
  session: SessionState
  isSelected: boolean
  onClick: () => void
}): React.ReactElement {
  const relativeTime = session.endedAt ? formatRelativeTime(session.endedAt) : ''
  const stats = formatStats(session)

  return (
    <div
      data-testid="history-item"
      data-session-id={session.id}
      data-selected={isSelected ? 'true' : 'false'}
      onClick={onClick}
      style={{
        padding: '4px 12px 4px 14px',
        cursor: 'pointer',
        backgroundColor: isSelected ? 'var(--bg-sidebar-active)' : 'transparent',
        borderLeft: isSelected ? '2px solid var(--amber)' : '2px solid transparent',
        transition: 'background 0.12s ease',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          ;(e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(0,0,0,0.03)'
        }
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.backgroundColor =
          isSelected ? '#E8E0D4' : 'transparent'
      }}
    >
      {/* Top line: dot + title + relative time */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          data-testid="status-dot"
          data-status={session.status}
          style={{
            width: 6,
            height: 6,
            minWidth: 6,
            borderRadius: '50%',
            backgroundColor: STATUS_COLORS[session.status] || 'var(--text-very-muted)',
            display: 'inline-block',
            flexShrink: 0,
          }}
        />
        <span
          data-testid="history-title"
          style={{
            fontSize: '12px',
            fontWeight: 400,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          {session.title || session.id}
        </span>
        <span
          style={{
            fontSize: '10px',
            color: 'var(--text-very-muted)',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {relativeTime}
        </span>
      </div>

      {/* Bottom line: stats */}
      {stats && (
        <div
          data-testid="history-stats"
          style={{
            fontSize: '10px',
            color: 'var(--text-very-muted)',
            paddingLeft: 14, // align with title (dot width + gap)
            marginTop: 1,
          }}
        >
          {stats}
        </div>
      )}
    </div>
  )
}

export default Sidebar
```

**Step 4: Run tests**

```bash
npm run build && npx playwright test
```

Expected: All tests pass, including the new S9 tests.

**Step 5: Commit**

```bash
git add src/renderer/src/components/Sidebar.tsx e2e/sidebar.spec.ts && git commit -m "feat(sidebar): add history section with session titles, stats, and relative time"
```

---

## Task 11: Sidebar "+ New Session" Slot

**Files:**
- Modify: `e2e/sidebar.spec.ts`

The "+ New session" slot was already added in Task 10's Sidebar rewrite. This task adds the E2E test to verify it.

**Step 1: Write the E2E test**

Append to `e2e/sidebar.spec.ts`:

```typescript
// --- S10: New session slot ---

test('S10: "+ New session" slot appears when project has completed sessions', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  const newSessionSlot = appWindow.locator('[data-testid="new-session-slot"]')
  await expect(newSessionSlot.first()).toBeVisible({ timeout: 5000 })

  const text = await newSessionSlot.first().textContent()
  expect(text).toContain('New session')
})
```

**Step 2: Run test to verify it passes**

```bash
npm run build && npx playwright test e2e/sidebar.spec.ts --grep "S10"
```

Expected: PASS — the slot was already implemented in Task 10.

**Step 3: Run full test suite**

```bash
npx playwright test
```

Expected: All tests pass.

**Step 4: Commit**

```bash
git add e2e/sidebar.spec.ts && git commit -m "test(sidebar): add E2E test for new session slot"
```

---

## Task 12: Session Resume IPC Handler + Resume Button Wiring

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/renderer/src/components/Sidebar.tsx`
- Modify: `e2e/sidebar.spec.ts`

**Step 1: Write the failing E2E test**

Append to `e2e/sidebar.spec.ts`:

```typescript
// --- S11: Resume button ---

test('S11: history items show a resume button', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  const resumeButtons = appWindow.locator('[data-testid="resume-btn"]')
  await expect(resumeButtons.first()).toBeVisible({ timeout: 5000 })

  const text = await resumeButtons.first().textContent()
  expect(text).toContain('Resume')
})

test('S11: electronAPI exposes resumeSession method', async ({ appWindow }) => {
  const hasResumeSession = await appWindow.evaluate(() => {
    return typeof window.electronAPI?.resumeSession === 'function'
  })
  expect(hasResumeSession).toBe(true)
})
```

**Step 2: Run test to verify it fails**

```bash
npx playwright test e2e/sidebar.spec.ts --grep "S11"
```

Expected: FAIL — no resume button exists, no `resumeSession` method on electronAPI.

**Step 3: Add `resumeSession` to the preload bridge**

Open `src/preload/index.ts`. Add this method inside the `api` object, after the `readTextFile` method:

```typescript
  // Session: resume a completed session
  resumeSession: (sessionId: string): Promise<{ success: boolean; newSessionId?: string }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SESSION_RESUME, { sessionId })
  },
```

**Step 4: Add the IPC handler in main process**

Open `src/main/ipc.ts`. Add imports at the top — update the existing db import. After line 6:

```typescript
import { getAmplifierHome } from './scanner'
```

This import already exists. Now add after the existing imports:

```typescript
import { getAllSessions } from './db'
```

Wait — `getAllSessions` returns `SessionRow[]` which has `projectSlug`. We need the project path. Instead, use `getAllProjects`:

```typescript
import { getAllProjects } from './db'
```

Inside `registerIpcHandlers`, add the handler. Find the block with the existing `ipcMain.handle` calls (after `READ_TEXT` handler, before `mainWindow.on('closed')`). Add:

```typescript
  ipcMain.handle(
    IPC_CHANNELS.SESSION_RESUME,
    async (_event, { sessionId }: { sessionId: string }): Promise<{ success: boolean; error?: string }> => {
      try {
        // Look up the session's project to find the workDir
        const projects = getAllProjects()
        // We need the session info — get it from liveSessions or DB
        // For now, use getAllSessions to find the session's project
        const allSessions = require('./db').getAllSessions() as Array<{ id: string; projectSlug: string }>
        const sessionRow = allSessions.find((s) => s.id === sessionId)
        if (!sessionRow) {
          return { success: false, error: 'Session not found' }
        }

        const project = projects.find((p) => p.slug === sessionRow.projectSlug)
        if (!project) {
          return { success: false, error: 'Project not found' }
        }

        // Type the resume command into the existing PTY
        writeToPty(`amplifier session resume ${sessionId}\r`)
        return { success: true }
      } catch (err) {
        console.error('[ipc] Failed to resume session:', err)
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )
```

**Important:** The above uses `require` dynamically which isn't ideal. Let's clean it up. Replace the handler with this version that imports properly. Update the import at the top of the file — change:

```typescript
import type { SessionState, FileActivity, FileEntry } from '../shared/types'
```

to:

```typescript
import type { SessionState, FileActivity, FileEntry } from '../shared/types'
import { getAllProjects, getAllSessions } from './db'
```

And the handler becomes:

```typescript
  ipcMain.handle(
    IPC_CHANNELS.SESSION_RESUME,
    async (_event, { sessionId }: { sessionId: string }): Promise<{ success: boolean; error?: string }> => {
      try {
        const allSessions = getAllSessions()
        const sessionRow = allSessions.find((s) => s.id === sessionId)
        if (!sessionRow) {
          return { success: false, error: 'Session not found' }
        }

        // Type the resume command into the existing PTY
        writeToPty(`amplifier session resume ${sessionId}\r`)
        return { success: true }
      } catch (err) {
        console.error('[ipc] Failed to resume session:', err)
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )
```

Also add cleanup for this handler in the `mainWindow.on('closed')` callback. Find the existing `removeHandler` lines and add:

```typescript
    ipcMain.removeHandler(IPC_CHANNELS.SESSION_RESUME)
```

**Step 5: Add resume button to the Sidebar HistoryRow**

Open `src/renderer/src/components/Sidebar.tsx`. Find the `HistoryRow` component. Add an `onResume` prop and a resume button.

Update the `HistoryRow` function signature:

```tsx
function HistoryRow({
  session,
  isSelected,
  onClick,
  onResume,
}: {
  session: SessionState
  isSelected: boolean
  onClick: () => void
  onResume: () => void
}): React.ReactElement {
```

Inside the top line div (the one with dot + title + relative time), add a resume button after the relative time span. Add it right before the closing `</div>` of that flex row:

```tsx
        <button
          data-testid="resume-btn"
          onClick={(e) => {
            e.stopPropagation()
            onResume()
          }}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-very-muted)',
            cursor: 'pointer',
            fontSize: '10px',
            padding: '0 2px',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          Resume {'\u2192'}
        </button>
```

Now update the `HistoryRow` usage in the `Sidebar` component to pass the `onResume` prop. Find where `<HistoryRow>` is rendered and add:

```tsx
                        <HistoryRow
                          key={session.id}
                          session={session}
                          isSelected={selectedSessionId === session.id}
                          onClick={() => { selectSession(session.id); openViewer() }}
                          onResume={() => {
                            if (window.electronAPI) {
                              void window.electronAPI.resumeSession(session.id)
                            }
                          }}
                        />
```

**Step 6: Build and run tests**

```bash
npm run build && npx playwright test
```

Expected: All tests pass, including S11 tests for resume button and API method.

**Step 7: Commit**

```bash
git add -A && git commit -m "feat(resume): add session resume IPC handler and resume button in sidebar history"
```

---

## Final Verification

After all 12 tasks, run the complete verification:

```bash
npm run build && npx playwright test
```

All tests should pass. Then run the pure function tests:

```bash
npx tsx --test tests/events-parser.test.ts
```

All pure function tests should pass.

Review the final file inventory:

| File | Status |
|------|--------|
| `src/shared/types.ts` | Modified — new SessionState fields, Toast interface, SESSION_RESUME channel |
| `src/main/db.ts` | Modified — schema migration, `finalizeSession()`, updated `SessionRow` |
| `src/main/events-parser.ts` | Modified — `extractFirstPrompt()`, `extractSessionStats()`, `deriveSessionTitle()` |
| `src/main/scanner.ts` | Modified — enriches sessions with title and stats on startup scan |
| `src/main/index.ts` | Modified — watcher callback enriches sessions on live completion |
| `src/main/ipc.ts` | Modified — `SESSION_RESUME` handler |
| `src/preload/index.ts` | Modified — `resumeSession()` bridge method |
| `src/renderer/src/store.ts` | Modified — toast state, completion detection in `setSessions` |
| `src/renderer/src/components/Toast.tsx` | **Created** — toast notification component |
| `src/renderer/src/components/Sidebar.tsx` | Modified — history section, status dots, new session slot, resume button |
| `src/renderer/src/App.tsx` | Modified — mount Toast, debug element for titles |
| `tests/events-parser.test.ts` | **Created** — pure function tests |
| `e2e/fixtures/.../tp-session-001/events.jsonl` | Modified — added user_message |
| `e2e/fixtures/.../tp-session-002/events.jsonl` | Modified — added user_message |
| `e2e/fixtures/.../rc-session-001/events.jsonl` | Modified — added user_message |
| `e2e/fixtures/.../tp-session-003/events.jsonl` | **Created** — failed session fixture |
| `e2e/data-layer.spec.ts` | Modified — updated session counts, added D7 enrichment test |
| `e2e/sidebar.spec.ts` | Modified — added S8, S9, S10, S11 tests |