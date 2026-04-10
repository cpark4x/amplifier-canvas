# Workspace Model Implementation Plan

> **Execution:** Use the subagent-driven-development workflow to implement this plan.

**Goal:** Replace Canvas's auto-discovery model with an opt-in workspace model where only user-curated projects appear in the sidebar, and Canvas restores exactly where the user left off on every launch.

**Architecture:** Lazy discovery with workspace state persistence. No scanning at startup — Canvas loads only registered projects from the DB and restores workspace state (selected project, expanded projects, selected session). Discovery of available Amplifier projects happens on-demand when the user opens the "Existing" tab in the Add Project modal.

**Tech Stack:** Electron main+renderer, better-sqlite3, React + Zustand v5, chokidar, node:test, Playwright, inline CSS, TypeScript

**Design doc:** `docs/plans/2026-04-10-workspace-model-design.md`

---

## Phase 1: Core Infrastructure (Tasks 1–7)

### Task 1: DB Schema Migration

**Files:**
- Modify: `src/main/db.ts`
- Test: `tests/db-workspace.test.ts` (create)

**Step 1: Write failing tests for the new columns and table**

Create `tests/db-workspace.test.ts`:

```typescript
import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  initDatabase,
  closeDatabase,
  upsertProject,
  upsertSession,
  getDatabase,
} from '../src/main/db'

function setupDb() {
  return initDatabase(':memory:')
}

function createTestProject(slug = 'test-project') {
  upsertProject(slug, `/some/path/${slug}`, 'Test Project')
}

function createTestSession(id = 'test-session-1', projectSlug = 'test-project') {
  upsertSession({
    id,
    projectSlug,
    startedBy: 'external',
    startedAt: '2024-01-01T00:00:00Z',
    status: 'active',
    byteOffset: 0,
  })
}

describe('Workspace model schema migrations', () => {
  beforeEach(() => setupDb())
  afterEach(() => closeDatabase())

  test('projects table has registered column with default 0', () => {
    createTestProject()
    const d = getDatabase()
    const row = d.prepare('SELECT registered FROM projects WHERE slug = ?').get('test-project') as { registered: number }
    assert.equal(row.registered, 0, 'registered should default to 0')
  })

  test('sessions table has hidden column with default 0', () => {
    createTestProject()
    createTestSession()
    const d = getDatabase()
    const row = d.prepare('SELECT hidden FROM sessions WHERE id = ?').get('test-session-1') as { hidden: number }
    assert.equal(row.hidden, 0, 'hidden should default to 0')
  })

  test('workspace_state table exists', () => {
    const d = getDatabase()
    const tables = d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workspace_state'").all()
    assert.equal(tables.length, 1, 'workspace_state table should exist')
  })

  test('workspace_state supports key-value insert and retrieval', () => {
    const d = getDatabase()
    d.prepare('INSERT INTO workspace_state (key, value) VALUES (?, ?)').run('selectedProjectSlug', 'my-project')
    const row = d.prepare('SELECT value FROM workspace_state WHERE key = ?').get('selectedProjectSlug') as { value: string } | undefined
    assert.equal(row?.value, 'my-project')
  })

  test('workspace_state supports upsert on conflict', () => {
    const d = getDatabase()
    d.prepare('INSERT INTO workspace_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('selectedProjectSlug', 'project-a')
    d.prepare('INSERT INTO workspace_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('selectedProjectSlug', 'project-b')
    const row = d.prepare('SELECT value FROM workspace_state WHERE key = ?').get('selectedProjectSlug') as { value: string }
    assert.equal(row.value, 'project-b')
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `node --import tsx/esm tests/db-workspace.test.ts`
Expected: FAIL — `registered` column doesn't exist, `workspace_state` table doesn't exist.

**Step 3: Add schema migrations to `src/main/db.ts`**

In `src/main/db.ts`, add the `workspace_state` table creation inside `initDatabase()`, right after the existing `CREATE TABLE IF NOT EXISTS sessions` statement (after line 42):

```typescript
    CREATE TABLE IF NOT EXISTS workspace_state (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
```

Then add migrations for the new columns. After the existing `existingColumns` block for sessions (line 46), add a new migration block for projects. Insert before the `const migrations` line (line 50):

```typescript
  // --- Projects table migrations ---
  const existingProjectColumns = (
    db.pragma('table_info(projects)') as Array<{ name: string }>
  ).map((col) => col.name)

  const projectMigrations: Array<{ column: string; ddl: string }> = [
    {
      column: 'registered',
      ddl: 'ALTER TABLE projects ADD COLUMN registered INTEGER NOT NULL DEFAULT 0',
    },
  ]

  for (const { column, ddl } of projectMigrations) {
    if (!existingProjectColumns.includes(column)) {
      db.exec(ddl)
    }
  }
```

Then add the `hidden` column to the existing sessions `migrations` array (after line 78, the last item):

```typescript
    {
      column: 'hidden',
      ddl: 'ALTER TABLE sessions ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0',
    },
```

**Step 4: Run tests to verify they pass**

Run: `node --import tsx/esm tests/db-workspace.test.ts`
Expected: All 5 tests PASS.

**Step 5: Run existing DB tests to verify no regressions**

Run: `node --import tsx/esm tests/db-phase2.test.ts`
Expected: All existing tests PASS.

**Step 6: Commit**

```bash
git add src/main/db.ts tests/db-workspace.test.ts && git commit -m "feat: add workspace model schema — registered, hidden columns + workspace_state table"
```

---

### Task 2: DB Functions for Workspace Model

**Files:**
- Modify: `src/main/db.ts`
- Test: `tests/db-workspace.test.ts` (append)

**Step 1: Write failing tests for the new DB functions**

Append to `tests/db-workspace.test.ts`. Add these imports to the top import block:

```typescript
import {
  initDatabase,
  closeDatabase,
  upsertProject,
  upsertSession,
  getDatabase,
  getRegisteredProjects,
  setProjectRegistered,
  getVisibleProjectSessions,
  setSessionHidden,
} from '../src/main/db'
```

Then add these test blocks at the bottom of the file:

```typescript
describe('getRegisteredProjects', () => {
  beforeEach(() => setupDb())
  afterEach(() => closeDatabase())

  test('returns only projects with registered = 1', () => {
    createTestProject('project-a')
    createTestProject('project-b')
    const d = getDatabase()
    d.prepare('UPDATE projects SET registered = 1 WHERE slug = ?').run('project-a')

    const registered = getRegisteredProjects()
    assert.equal(registered.length, 1)
    assert.equal(registered[0].slug, 'project-a')
  })

  test('returns empty array when no projects are registered', () => {
    createTestProject('project-a')
    const registered = getRegisteredProjects()
    assert.equal(registered.length, 0)
  })

  test('returns projects sorted by name', () => {
    upsertProject('beta', '/path/beta', 'Beta')
    upsertProject('alpha', '/path/alpha', 'Alpha')
    const d = getDatabase()
    d.prepare('UPDATE projects SET registered = 1 WHERE slug IN (?, ?)').run('beta', 'alpha')
    // Need to run individually since .run only binds one at a time
    d.prepare('UPDATE projects SET registered = 1 WHERE slug = ?').run('beta')
    d.prepare('UPDATE projects SET registered = 1 WHERE slug = ?').run('alpha')

    const registered = getRegisteredProjects()
    assert.equal(registered[0].slug, 'alpha')
    assert.equal(registered[1].slug, 'beta')
  })
})

describe('setProjectRegistered', () => {
  beforeEach(() => setupDb())
  afterEach(() => closeDatabase())

  test('sets registered to 1', () => {
    createTestProject('my-project')
    setProjectRegistered('my-project', true)
    const registered = getRegisteredProjects()
    assert.equal(registered.length, 1)
    assert.equal(registered[0].slug, 'my-project')
  })

  test('sets registered back to 0', () => {
    createTestProject('my-project')
    setProjectRegistered('my-project', true)
    setProjectRegistered('my-project', false)
    const registered = getRegisteredProjects()
    assert.equal(registered.length, 0)
  })
})

describe('getVisibleProjectSessions', () => {
  beforeEach(() => setupDb())
  afterEach(() => closeDatabase())

  test('returns only sessions with hidden = 0 for a given project', () => {
    createTestProject()
    createTestSession('session-1')
    createTestSession('session-2')
    const d = getDatabase()
    d.prepare('UPDATE sessions SET hidden = 1 WHERE id = ?').run('session-2')

    const sessions = getVisibleProjectSessions('test-project')
    assert.equal(sessions.length, 1)
    assert.equal(sessions[0].id, 'session-1')
  })

  test('returns empty array when all sessions are hidden', () => {
    createTestProject()
    createTestSession('session-1')
    const d = getDatabase()
    d.prepare('UPDATE sessions SET hidden = 1 WHERE id = ?').run('session-1')

    const sessions = getVisibleProjectSessions('test-project')
    assert.equal(sessions.length, 0)
  })
})

describe('setSessionHidden', () => {
  beforeEach(() => setupDb())
  afterEach(() => closeDatabase())

  test('hides a session', () => {
    createTestProject()
    createTestSession('session-1')
    setSessionHidden('session-1', true)

    const d = getDatabase()
    const row = d.prepare('SELECT hidden FROM sessions WHERE id = ?').get('session-1') as { hidden: number }
    assert.equal(row.hidden, 1)
  })

  test('unhides a session', () => {
    createTestProject()
    createTestSession('session-1')
    setSessionHidden('session-1', true)
    setSessionHidden('session-1', false)

    const d = getDatabase()
    const row = d.prepare('SELECT hidden FROM sessions WHERE id = ?').get('session-1') as { hidden: number }
    assert.equal(row.hidden, 0)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `node --import tsx/esm tests/db-workspace.test.ts`
Expected: FAIL — functions not found.

**Step 3: Implement the DB functions in `src/main/db.ts`**

Add these functions at the bottom of `src/main/db.ts` (before the closing of the file, after line 269):

```typescript
export function getRegisteredProjects(): ProjectRow[] {
  const d = getDatabase()
  return d.prepare('SELECT * FROM projects WHERE registered = 1 ORDER BY name').all() as ProjectRow[]
}

export function setProjectRegistered(slug: string, registered: boolean): void {
  const d = getDatabase()
  d.prepare('UPDATE projects SET registered = ? WHERE slug = ?').run(registered ? 1 : 0, slug)
}

export function getVisibleProjectSessions(projectSlug: string): SessionRow[] {
  const d = getDatabase()
  return d
    .prepare('SELECT * FROM sessions WHERE projectSlug = ? AND hidden = 0 ORDER BY startedAt DESC')
    .all(projectSlug) as SessionRow[]
}

export function setSessionHidden(id: string, hidden: boolean): void {
  const d = getDatabase()
  d.prepare('UPDATE sessions SET hidden = ? WHERE id = ?').run(hidden ? 1 : 0, id)
}

export function getRegisteredProjectCount(): number {
  const d = getDatabase()
  const row = d.prepare('SELECT COUNT(*) as count FROM projects WHERE registered = 1').get() as { count: number }
  return row.count
}
```

Also update the `ProjectRow` interface to include the new column (around line 178):

```typescript
export interface ProjectRow {
  slug: string
  path: string
  name: string
  addedAt: string
  registered: number
}
```

And update `SessionRow` to include `hidden` (add after `analysis_status` around line 205):

```typescript
  hidden: number
```

**Step 4: Run tests to verify they pass**

Run: `node --import tsx/esm tests/db-workspace.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/main/db.ts tests/db-workspace.test.ts && git commit -m "feat: add workspace DB functions — getRegisteredProjects, setProjectRegistered, setSessionHidden"
```

---

### Task 3: Workspace State Persistence

> **QUALITY WARNING — Unresolved suggestions from code review (approved with caveats):**
>
> 1. **No test for corrupted-JSON guard** — The `try/catch` around `JSON.parse` in `getWorkspaceState()` (lines 20-25 of `src/main/workspace.ts`) has zero test coverage. A test that seeds the DB with malformed JSON and asserts `[]` is returned would lock in this behavior. *Most valuable of the three.*
> 2. **No `Array.isArray` type-guard after `JSON.parse`** — `JSON.parse(expandedRaw) as string[]` is a blind cast. If stored value is valid JSON but not an array (e.g. `"true"`), the cast silently lies. Adding `Array.isArray(parsed) ? parsed : []` would complete the robustness.
> 3. **`async` on synchronous test callbacks** — All test callbacks are `async` but `better-sqlite3` is fully synchronous. Harmless but misleading to future readers.
>
> None of these are blocking bugs. The quality review verdict was **APPROVED** — these are genuine nice-to-haves for a follow-up pass.

**Files:**
- Create: `src/main/workspace.ts`
- Test: `tests/workspace.test.ts` (create)

**Step 1: Write failing tests**

Create `tests/workspace.test.ts`:

```typescript
import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { initDatabase, closeDatabase } from '../src/main/db'
import { getWorkspaceState, saveWorkspaceState } from '../src/main/workspace'

function setupDb() {
  return initDatabase(':memory:')
}

describe('getWorkspaceState', () => {
  beforeEach(() => setupDb())
  afterEach(() => closeDatabase())

  test('returns null values when no state is saved', () => {
    const state = getWorkspaceState()
    assert.equal(state.selectedProjectSlug, null)
    assert.deepEqual(state.expandedProjectSlugs, [])
    assert.equal(state.selectedSessionId, null)
    assert.equal(state.sidebarCollapsed, false)
  })

  test('returns saved state after saveWorkspaceState', () => {
    saveWorkspaceState({
      selectedProjectSlug: 'my-project',
      expandedProjectSlugs: ['my-project', 'other-project'],
      selectedSessionId: 'session-abc',
      sidebarCollapsed: true,
    })

    const state = getWorkspaceState()
    assert.equal(state.selectedProjectSlug, 'my-project')
    assert.deepEqual(state.expandedProjectSlugs, ['my-project', 'other-project'])
    assert.equal(state.selectedSessionId, 'session-abc')
    assert.equal(state.sidebarCollapsed, true)
  })
})

describe('saveWorkspaceState', () => {
  beforeEach(() => setupDb())
  afterEach(() => closeDatabase())

  test('overwrites previous state', () => {
    saveWorkspaceState({
      selectedProjectSlug: 'project-a',
      expandedProjectSlugs: ['project-a'],
      selectedSessionId: 'session-1',
      sidebarCollapsed: false,
    })
    saveWorkspaceState({
      selectedProjectSlug: 'project-b',
      expandedProjectSlugs: ['project-b', 'project-c'],
      selectedSessionId: 'session-2',
      sidebarCollapsed: true,
    })

    const state = getWorkspaceState()
    assert.equal(state.selectedProjectSlug, 'project-b')
    assert.deepEqual(state.expandedProjectSlugs, ['project-b', 'project-c'])
    assert.equal(state.selectedSessionId, 'session-2')
    assert.equal(state.sidebarCollapsed, true)
  })

  test('handles partial updates — only saves provided keys', () => {
    saveWorkspaceState({
      selectedProjectSlug: 'project-a',
      expandedProjectSlugs: ['project-a'],
      selectedSessionId: null,
      sidebarCollapsed: false,
    })

    const state = getWorkspaceState()
    assert.equal(state.selectedProjectSlug, 'project-a')
    assert.equal(state.selectedSessionId, null)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `node --import tsx/esm tests/workspace.test.ts`
Expected: FAIL — module `src/main/workspace` does not exist.

**Step 3: Create `src/main/workspace.ts`**

```typescript
import { getDatabase } from './db'

export interface WorkspaceState {
  selectedProjectSlug: string | null
  expandedProjectSlugs: string[]
  selectedSessionId: string | null
  sidebarCollapsed: boolean
}

export function getWorkspaceState(): WorkspaceState {
  const d = getDatabase()
  const rows = d.prepare('SELECT key, value FROM workspace_state').all() as Array<{ key: string; value: string }>
  const map = new Map(rows.map((r) => [r.key, r.value]))

  return {
    selectedProjectSlug: map.get('selectedProjectSlug') ?? null,
    expandedProjectSlugs: JSON.parse(map.get('expandedProjectSlugs') ?? '[]') as string[],
    selectedSessionId: map.get('selectedSessionId') ?? null,
    sidebarCollapsed: map.get('sidebarCollapsed') === 'true',
  }
}

export function saveWorkspaceState(state: WorkspaceState): void {
  const d = getDatabase()
  const upsert = d.prepare(
    'INSERT INTO workspace_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  )

  const entries: Array<[string, string]> = [
    ['selectedProjectSlug', state.selectedProjectSlug ?? ''],
    ['expandedProjectSlugs', JSON.stringify(state.expandedProjectSlugs)],
    ['selectedSessionId', state.selectedSessionId ?? ''],
    ['sidebarCollapsed', String(state.sidebarCollapsed)],
  ]

  const transaction = d.transaction(() => {
    for (const [key, value] of entries) {
      if (value === '') {
        // Delete the key if value is empty (null was passed)
        d.prepare('DELETE FROM workspace_state WHERE key = ?').run(key)
      } else {
        upsert.run(key, value)
      }
    }
  })

  transaction()
}
```

**Step 4: Run tests to verify they pass**

Run: `node --import tsx/esm tests/workspace.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/main/workspace.ts tests/workspace.test.ts && git commit -m "feat: add workspace state persistence — getWorkspaceState, saveWorkspaceState"
```

---

### Task 4: On-Demand Project Discovery

**Files:**
- Create: `src/main/discovery.ts`
- Test: `tests/discovery.test.ts` (create)

**Step 1: Write failing tests**

Create `tests/discovery.test.ts`:

```typescript
import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { discoverProjects } from '../src/main/discovery'
import { initDatabase, closeDatabase, upsertProject, setProjectRegistered } from '../src/main/db'

let testDir: string

function setupTestDir() {
  testDir = join(tmpdir(), `canvas-discovery-test-${Date.now()}`)
  mkdirSync(join(testDir, 'projects'), { recursive: true })
}

function teardownTestDir() {
  rmSync(testDir, { recursive: true, force: true })
}

function createFakeProject(slug: string) {
  const projectDir = join(testDir, 'projects', slug)
  mkdirSync(join(projectDir, 'sessions', 'fake-session'), { recursive: true })
  writeFileSync(join(projectDir, 'sessions', 'fake-session', 'events.jsonl'), '{}')
}

describe('discoverProjects', () => {
  beforeEach(() => {
    setupTestDir()
    initDatabase(':memory:')
  })
  afterEach(() => {
    closeDatabase()
    teardownTestDir()
  })

  test('discovers project directories under ~/.amplifier/projects/', () => {
    createFakeProject('alpha')
    createFakeProject('beta')

    const discovered = discoverProjects(testDir)
    assert.equal(discovered.length, 2)
    const slugs = discovered.map((p) => p.slug).sort()
    assert.deepEqual(slugs, ['alpha', 'beta'])
  })

  test('returns slug, name, and path for each project', () => {
    createFakeProject('my-project')

    const discovered = discoverProjects(testDir)
    assert.equal(discovered.length, 1)
    assert.equal(discovered[0].slug, 'my-project')
    assert.equal(discovered[0].name, 'My Project')
    assert.ok(discovered[0].path.includes('my-project'))
  })

  test('excludes projects that are already registered', () => {
    createFakeProject('registered-project')
    createFakeProject('unregistered-project')

    upsertProject('registered-project', join(testDir, 'projects', 'registered-project'), 'Registered Project')
    setProjectRegistered('registered-project', true)

    const discovered = discoverProjects(testDir)
    assert.equal(discovered.length, 1)
    assert.equal(discovered[0].slug, 'unregistered-project')
  })

  test('returns empty array when projects directory does not exist', () => {
    rmSync(join(testDir, 'projects'), { recursive: true, force: true })
    const discovered = discoverProjects(testDir)
    assert.deepEqual(discovered, [])
  })

  test('does not write to the database', () => {
    createFakeProject('new-project')
    discoverProjects(testDir)

    const d = (await import('../src/main/db')).getDatabase()
    const rows = d.prepare('SELECT * FROM projects').all()
    assert.equal(rows.length, 0, 'discoverProjects should not upsert projects into DB')
  })
})
```

**Important:** The last test uses a dynamic import trick that won't work with `node:test`. Replace that test with:

```typescript
  test('does not write to the database', () => {
    createFakeProject('new-project')
    discoverProjects(testDir)

    const { getDatabase } = require('../src/main/db')
    const d = getDatabase()
    const rows = d.prepare('SELECT * FROM projects').all()
    assert.equal(rows.length, 0, 'discoverProjects should not upsert projects into DB')
  })
```

Actually, since `getDatabase` is already imported at the top, just use it directly:

```typescript
import { discoverProjects } from '../src/main/discovery'
import { initDatabase, closeDatabase, upsertProject, setProjectRegistered, getDatabase } from '../src/main/db'
```

And the test:

```typescript
  test('does not write to the database', () => {
    createFakeProject('new-project')
    discoverProjects(testDir)

    const d = getDatabase()
    const rows = d.prepare('SELECT * FROM projects').all()
    assert.equal(rows.length, 0, 'discoverProjects should not upsert projects into DB')
  })
```

**Step 2: Run tests to verify they fail**

Run: `node --import tsx/esm tests/discovery.test.ts`
Expected: FAIL — module `src/main/discovery` does not exist.

**Step 3: Create `src/main/discovery.ts`**

```typescript
import { readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { getRegisteredProjects } from './db'

export interface DiscoveredProject {
  slug: string
  name: string
  path: string
}

/**
 * Scans ~/.amplifier/projects/ on-demand and returns projects that are NOT
 * yet registered in Canvas. Does NOT write to the database.
 */
export function discoverProjects(amplifierHome: string): DiscoveredProject[] {
  const projectsDir = join(amplifierHome, 'projects')

  if (!existsSync(projectsDir)) {
    return []
  }

  const registeredSlugs = new Set(
    getRegisteredProjects().map((p) => p.slug),
  )

  try {
    const entries = readdirSync(projectsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())

    return entries
      .map((entry) => ({
        slug: entry.name,
        name: slugToName(entry.name),
        path: join(projectsDir, entry.name),
      }))
      .filter((project) => !registeredSlugs.has(project.slug))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch (err) {
    console.error('[discovery] Failed to scan projects directory:', err instanceof Error ? err.message : String(err))
    return []
  }
}

function slugToName(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
```

**Step 4: Run tests to verify they pass**

Run: `node --import tsx/esm tests/discovery.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/main/discovery.ts tests/discovery.test.ts && git commit -m "feat: add on-demand project discovery — discoverProjects()"
```

---

### Task 5: New IPC Channel Constants

**Files:**
- Modify: `src/shared/types.ts`

**Step 1: Add new IPC channel constants**

In `src/shared/types.ts`, add the following entries to the `IPC_CHANNELS` object (after the `ANALYSIS_READY` line, around line 19):

```typescript
  // Workspace model: Renderer → Main (invoke/handle)
  PROJECT_DISCOVER: 'project:discover',
  PROJECT_REGISTER: 'project:register',
  PROJECT_UNREGISTER: 'project:unregister',
  SESSION_HIDE: 'session:hide',
  SESSION_STOP: 'session:stop',
  WORKSPACE_SAVE: 'workspace:save-state',
  WORKSPACE_GET: 'workspace:get-state',
  // Workspace model: Main → Renderer (push)
  WORKSPACE_STATE: 'workspace:state',
  RUNNING_SESSIONS_TOAST: 'app:running-sessions-toast',
```

Also add `'stopped'` to the `SessionStatus` type (around line 24):

```typescript
export type SessionStatus = 'running' | 'needs_input' | 'done' | 'failed' | 'active' | 'loading' | 'stopped'
```

**Step 2: Run existing tests to check for regressions**

Run: `node --import tsx/esm tests/db-phase2.test.ts && node --import tsx/esm tests/store-analysis-status.test.ts`
Expected: All existing tests PASS.

**Step 3: Commit**

```bash
git add src/shared/types.ts && git commit -m "feat: add workspace model IPC channel constants and stopped status"
```

---

### Task 6: IPC Handlers for Workspace Model

**Files:**
- Modify: `src/main/ipc.ts`

**Step 1: Add imports at the top of `src/main/ipc.ts`**

Add these imports alongside the existing ones:

```typescript
import { getRegisteredProjects, setProjectRegistered, setSessionHidden, upsertProject, getRegisteredProjectCount } from './db'
import { getWorkspaceState, saveWorkspaceState } from './workspace'
import type { WorkspaceState } from './workspace'
import { discoverProjects } from './discovery'
import type { DiscoveredProject } from './discovery'
```

Update the existing `./db` import line (line 8) to include the new functions. The final import from `'./db'` should be:

```typescript
import { getSessionById, getRegisteredProjects, setProjectRegistered, setSessionHidden, upsertProject, getRegisteredProjectCount } from './db'
```

**Step 2: Add IPC handlers inside `registerIpcHandlers()`**

Add these handlers inside the `registerIpcHandlers` function, before the `mainWindow.on('closed', ...)` block (before line 156):

```typescript
  // --- Workspace model IPC handlers ---

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_DISCOVER,
    (_event, { amplifierHome }: { amplifierHome: string }): DiscoveredProject[] => {
      try {
        return discoverProjects(amplifierHome)
      } catch (err) {
        console.error('[ipc] PROJECT_DISCOVER failed:', err)
        return []
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_REGISTER,
    (_event, { slug, path, name }: { slug: string; path: string; name: string }): { success: boolean } => {
      try {
        upsertProject(slug, path, name)
        setProjectRegistered(slug, true)
        return { success: true }
      } catch (err) {
        console.error('[ipc] PROJECT_REGISTER failed:', err)
        return { success: false }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_UNREGISTER,
    (_event, { slug }: { slug: string }): { success: boolean } => {
      try {
        setProjectRegistered(slug, false)
        return { success: true }
      } catch (err) {
        console.error('[ipc] PROJECT_UNREGISTER failed:', err)
        return { success: false }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.SESSION_HIDE,
    (_event, { sessionId }: { sessionId: string }): { success: boolean } => {
      try {
        setSessionHidden(sessionId, true)
        return { success: true }
      } catch (err) {
        console.error('[ipc] SESSION_HIDE failed:', err)
        return { success: false }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.SESSION_STOP,
    (_event, { sessionId }: { sessionId: string }): { success: boolean; error?: string } => {
      try {
        // SESSION_STOP is handled externally via the liveSessions map in index.ts.
        // This handler is a placeholder — the actual SIGTERM logic is wired in index.ts
        // where the process PID is known.
        return { success: false, error: 'Not yet wired to process management' }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[ipc] SESSION_STOP failed:', message)
        return { success: false, error: message }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_SAVE,
    (_event, state: WorkspaceState): { success: boolean } => {
      try {
        saveWorkspaceState(state)
        return { success: true }
      } catch (err) {
        console.error('[ipc] WORKSPACE_SAVE failed:', err)
        return { success: false }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_GET,
    (): { state: WorkspaceState; isFirstTime: boolean } => {
      try {
        const state = getWorkspaceState()
        const isFirstTime = getRegisteredProjectCount() === 0
        return { state, isFirstTime }
      } catch (err) {
        console.error('[ipc] WORKSPACE_GET failed:', err)
        return {
          state: {
            selectedProjectSlug: null,
            expandedProjectSlugs: [],
            selectedSessionId: null,
            sidebarCollapsed: false,
          },
          isFirstTime: true,
        }
      }
    },
  )
```

**Step 3: Add cleanup for new handlers in the `mainWindow.on('closed')` block**

In the `mainWindow.on('closed', ...)` callback, add these lines after the existing `removeHandler` calls:

```typescript
    ipcMain.removeHandler(IPC_CHANNELS.PROJECT_DISCOVER)
    ipcMain.removeHandler(IPC_CHANNELS.PROJECT_REGISTER)
    ipcMain.removeHandler(IPC_CHANNELS.PROJECT_UNREGISTER)
    ipcMain.removeHandler(IPC_CHANNELS.SESSION_HIDE)
    ipcMain.removeHandler(IPC_CHANNELS.SESSION_STOP)
    ipcMain.removeHandler(IPC_CHANNELS.WORKSPACE_SAVE)
    ipcMain.removeHandler(IPC_CHANNELS.WORKSPACE_GET)
```

**Step 4: Add `pushWorkspaceState` and `pushRunningSessionsToast` push functions**

Add at the bottom of `src/main/ipc.ts`, after the existing push functions:

```typescript
export function pushWorkspaceState(mainWindow: BrowserWindow, state: WorkspaceState): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.WORKSPACE_STATE, state)
  }
}

export function pushRunningSessionsToast(mainWindow: BrowserWindow, count: number): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.RUNNING_SESSIONS_TOAST, { count })
  }
}
```

You'll also need to add the `WorkspaceState` import type at the top:

```typescript
import type { WorkspaceState } from './workspace'
```

**Step 5: Build to verify no compilation errors**

Run: `npm run build`
Expected: Build succeeds.

**Step 6: Commit**

```bash
git add src/main/ipc.ts && git commit -m "feat: add workspace model IPC handlers — discover, register, unregister, hide, stop, workspace state"
```

---

### Task 7: Preload Bridge — Expose New IPC Channels

**Files:**
- Modify: `src/preload/index.ts`

**Step 1: Add new bridge methods to the `api` object in `src/preload/index.ts`**

Add these methods inside the `api` object (before the closing `}` on line 97), after the `onAnalysisReady` method:

```typescript
  // Workspace: discover available Amplifier projects
  discoverProjects: (amplifierHome: string): Promise<Array<{ slug: string; name: string; path: string }>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.PROJECT_DISCOVER, { amplifierHome })
  },

  // Workspace: register a project (add to Canvas)
  registerProject: (slug: string, path: string, name: string): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.PROJECT_REGISTER, { slug, path, name })
  },

  // Workspace: unregister a project (remove from Canvas)
  unregisterProject: (slug: string): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.PROJECT_UNREGISTER, { slug })
  },

  // Sessions: hide a session from view
  hideSession: (sessionId: string): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SESSION_HIDE, { sessionId })
  },

  // Sessions: stop a running session
  stopSession: (sessionId: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SESSION_STOP, { sessionId })
  },

  // Workspace state: save current state
  saveWorkspaceState: (state: {
    selectedProjectSlug: string | null
    expandedProjectSlugs: string[]
    selectedSessionId: string | null
    sidebarCollapsed: boolean
  }): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_SAVE, state)
  },

  // Workspace state: get saved state
  getWorkspaceState: (): Promise<{
    state: {
      selectedProjectSlug: string | null
      expandedProjectSlugs: string[]
      selectedSessionId: string | null
      sidebarCollapsed: boolean
    }
    isFirstTime: boolean
  }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_GET)
  },

  // Workspace state: subscribe to workspace state pushes
  onWorkspaceState: (callback: (state: {
    selectedProjectSlug: string | null
    expandedProjectSlugs: string[]
    selectedSessionId: string | null
    sidebarCollapsed: boolean
  }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: {
      selectedProjectSlug: string | null
      expandedProjectSlugs: string[]
      selectedSessionId: string | null
      sidebarCollapsed: boolean
    }): void => {
      callback(state)
    }
    ipcRenderer.on(IPC_CHANNELS.WORKSPACE_STATE, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.WORKSPACE_STATE, handler)
    }
  },

  // App: subscribe to running sessions toast on quit
  onRunningSessionsToast: (callback: (data: { count: number }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { count: number }): void => {
      callback(data)
    }
    ipcRenderer.on(IPC_CHANNELS.RUNNING_SESSIONS_TOAST, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.RUNNING_SESSIONS_TOAST, handler)
    }
  },
```

**Step 2: Build to verify no compilation errors**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Run existing preload bridge tests**

Run: `node --import tsx/esm tests/preload-bridge.test.ts`
Expected: Existing tests PASS.

**Step 4: Commit**

```bash
git add src/preload/index.ts && git commit -m "feat: expose workspace model IPC channels in preload bridge"
```

---

## Phase 2: UI & Integration (Tasks 8–12)

### Task 8: Refactor Startup Flow in `index.ts`

**Files:**
- Modify: `src/main/index.ts`

**Step 1: Update imports at the top of `src/main/index.ts`**

Replace the existing import block at lines 8-13 with:

```typescript
import { initDatabase, closeDatabase, upsertSession, updateSessionStatus, updateByteOffset, finalizeSession, getRegisteredProjects, getRegisteredProjectCount } from './db'
import { getAmplifierHome } from './scanner'
import { scanSessionsAsync } from './scanner'
import { initWatcher, addProjectWatch, removeProjectWatch, stopWatching } from './watcher'
import { pushSessionsChanged, pushFilesChanged, pushRunningSessionsToast, setAllowedDirs, isPathAllowed } from './ipc'
import { getWorkspaceState } from './workspace'
import { tailReadEvents, deriveSessionStatus, extractFileActivity, extractWorkDir, extractFirstPrompt, extractSessionStats, deriveSessionTitle } from './events-parser'
import type { SessionState } from '../shared/types'
```

Note: `scanProjects` and `getAllProjects` are removed from imports — we no longer auto-scan at startup.

**Step 2: Replace the `mainWindow.webContents.once('did-finish-load', ...)` block**

Replace the entire `mainWindow.webContents.once('did-finish-load', () => { ... })` block (lines 207-247) with:

```typescript
  mainWindow.webContents.once('did-finish-load', () => {
    try {
      const projectsDir = join(amplifierHome, 'projects')

      if (existsSync(projectsDir)) {
        setAllowedDirs([projectsDir])
      }

      // Load only registered projects — no full scan
      const registeredProjects = getRegisteredProjects()

      if (registeredProjects.length === 0) {
        // First-time user — show welcome screen, no sessions to push
        pushSessionsChanged(mainWindow, [])
        console.log('[startup] First-time user — no registered projects')
        return
      }

      // Returning user — load sessions for registered projects
      // Build lightweight stubs from DB, then hydrate async
      const stubs: SessionState[] = []
      for (const project of registeredProjects) {
        const { getVisibleProjectSessions } = require('./db')
        const dbSessions = getVisibleProjectSessions(project.slug)
        for (const dbSession of dbSessions) {
          stubs.push({
            id: dbSession.id,
            projectSlug: dbSession.projectSlug,
            projectName: project.name,
            status: dbSession.status === 'active' || dbSession.status === 'running' ? 'loading' : dbSession.status as SessionState['status'],
            startedAt: dbSession.startedAt,
            startedBy: dbSession.startedBy as 'canvas' | 'external',
            byteOffset: dbSession.byteOffset,
            recentFiles: [],
            workDir: undefined,
            title: dbSession.title ?? undefined,
            endedAt: dbSession.endedAt ?? undefined,
            exitCode: dbSession.exitCode ?? undefined,
            promptCount: dbSession.promptCount,
            toolCallCount: dbSession.toolCallCount,
            filesChangedCount: dbSession.filesChangedCount,
          })
        }
      }

      // Seed liveSessions
      for (const session of stubs) {
        liveSessions.set(session.id, session)
      }

      pushSessionsChanged(mainWindow, stubs)

      // Start watchers only for registered projects
      for (const project of registeredProjects) {
        addProjectWatch(project.slug)
      }

      // Async hydration: enrich DB stubs with live events.jsonl data
      void scanSessionsAsync(amplifierHome, stubs, (hydratedSessions) => {
        for (const session of hydratedSessions) {
          liveSessions.set(session.id, session)
        }
        pushSessionsChanged(mainWindow, Array.from(liveSessions.values()))
      })

      console.log(`[startup] Loaded ${registeredProjects.length} registered projects, ${stubs.length} sessions`)
    } catch (err) {
      console.error('[startup] Load failed:', err instanceof Error ? err.message : String(err))
      pushSessionsChanged(mainWindow, [])
    }
  })
```

**Important fix:** The `require('./db')` above is ugly. Instead, add `getVisibleProjectSessions` to the imports at the top:

```typescript
import { initDatabase, closeDatabase, upsertSession, updateSessionStatus, updateByteOffset, finalizeSession, getRegisteredProjects, getRegisteredProjectCount, getVisibleProjectSessions } from './db'
```

And replace `const { getVisibleProjectSessions } = require('./db')` with just using the imported function directly:

```typescript
        const dbSessions = getVisibleProjectSessions(project.slug)
```

**Step 3: Remove the now-unused `const projectsDir` declaration at line 204**

The `amplifierHome` and `projectsDir` are already referenced inside the callback. Remove the outer `const projectsDir = join(amplifierHome, 'projects')` line (line 204) — it's now declared inside the callback.

**Step 4: Add before-quit toast for running sessions**

Replace the existing `app.on('before-quit', ...)` block (line 334) with:

```typescript
app.on('before-quit', () => {
  // Check for running sessions and toast before quitting
  const runningCount = Array.from(liveSessions.values()).filter(
    (s) => s.status === 'running' || s.status === 'active' || s.status === 'needs_input',
  ).length

  if (runningCount > 0) {
    const windows = BrowserWindow.getAllWindows()
    if (windows.length > 0) {
      pushRunningSessionsToast(windows[0], runningCount)
    }
  }

  stopWatching()
  closeDatabase()
})
```

**Step 5: Build to verify**

Run: `npm run build`
Expected: Build succeeds.

**Step 6: Commit**

```bash
git add src/main/index.ts && git commit -m "feat: refactor startup — load registered projects only, no auto-scan"
```

---

### Task 9: Add `removeProjectWatch` to Watcher

**Files:**
- Modify: `src/main/watcher.ts`

**Step 1: Add `removeProjectWatch` function**

Add this function in `src/main/watcher.ts` after the `addProjectWatch` function (after line 69):

```typescript
/**
 * Stop watching a specific project's sessions directory.
 * Called when a project is unregistered (removed from Canvas).
 */
export function removeProjectWatch(slug: string): void {
  if (!amplifierProjectsDir || !watcher) {
    return
  }

  const sessionsDir = join(amplifierProjectsDir, slug, 'sessions')
  watcher.unwatch(sessionsDir)
  console.log(`[watcher] Removed project from watch: ${slug}`)
}
```

**Step 2: Build to verify**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/main/watcher.ts && git commit -m "feat: add removeProjectWatch for workspace model unregister"
```

---

### Task 10: Store Changes — Workspace State & Registered Projects

**Files:**
- Modify: `src/renderer/src/store.ts`
- Test: `tests/store-workspace.test.ts` (create)

**Step 1: Write failing tests**

Create `tests/store-workspace.test.ts`:

```typescript
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { useCanvasStore } from '../src/renderer/src/store.ts'

function resetStore() {
  useCanvasStore.setState(useCanvasStore.getInitialState())
}

describe('workspace state in store', () => {
  beforeEach(() => resetStore())

  test('expandedProjectSlugs initializes as empty array', () => {
    const state = useCanvasStore.getState()
    assert.deepEqual(state.expandedProjectSlugs, [])
  })

  test('toggleProjectExpanded adds slug to expanded list', () => {
    useCanvasStore.getState().toggleProjectExpanded('my-project')
    const state = useCanvasStore.getState()
    assert.ok(state.expandedProjectSlugs.includes('my-project'))
  })

  test('toggleProjectExpanded removes slug if already expanded', () => {
    useCanvasStore.getState().toggleProjectExpanded('my-project')
    useCanvasStore.getState().toggleProjectExpanded('my-project')
    const state = useCanvasStore.getState()
    assert.ok(!state.expandedProjectSlugs.includes('my-project'))
  })

  test('setExpandedProjectSlugs replaces the full list', () => {
    useCanvasStore.getState().setExpandedProjectSlugs(['project-a', 'project-b'])
    const state = useCanvasStore.getState()
    assert.deepEqual(state.expandedProjectSlugs, ['project-a', 'project-b'])
  })
})

describe('selectProject in workspace model', () => {
  beforeEach(() => resetStore())

  test('selectProject sets selectedProjectSlug directly (no toggle)', () => {
    useCanvasStore.getState().selectProject('my-project')
    assert.equal(useCanvasStore.getState().selectedProjectSlug, 'my-project')
  })

  test('selectProject with same slug keeps it selected (no toggle off)', () => {
    useCanvasStore.getState().selectProject('my-project')
    useCanvasStore.getState().selectProject('my-project')
    assert.equal(useCanvasStore.getState().selectedProjectSlug, 'my-project')
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `node --import tsx/esm tests/store-workspace.test.ts`
Expected: FAIL — `expandedProjectSlugs`, `toggleProjectExpanded`, `setExpandedProjectSlugs` don't exist.

**Step 3: Update `src/renderer/src/store.ts`**

Make the following changes to `src/renderer/src/store.ts`:

**3a. Add `expandedProjectSlugs` to state** (in the `CanvasStore` interface and initial state):

In the interface (around line 16), add:
```typescript
  expandedProjectSlugs: string[]
```

In the initial state (around line 47), add:
```typescript
  expandedProjectSlugs: [],
```

**3b. Add new actions to the interface** (around line 27):
```typescript
  toggleProjectExpanded: (slug: string) => void
  setExpandedProjectSlugs: (slugs: string[]) => void
```

**3c. Change `selectProject` to NOT toggle** — set directly:

Replace the existing `selectProject` implementation (lines 85-88):
```typescript
  selectProject: (slug) => set({ selectedProjectSlug: slug }),
```

**3d. Add the new action implementations** (after `selectProject`):

```typescript
  toggleProjectExpanded: (slug) =>
    set((state) => ({
      expandedProjectSlugs: state.expandedProjectSlugs.includes(slug)
        ? state.expandedProjectSlugs.filter((s) => s !== slug)
        : [...state.expandedProjectSlugs, slug],
    })),

  setExpandedProjectSlugs: (slugs) => set({ expandedProjectSlugs: slugs }),
```

**3e. Remove `createdProjects` from state** — it's replaced by the DB-backed registered projects concept.

Remove from the interface:
```typescript
  createdProjects: Project[] // DELETE THIS LINE
```

Remove from initial state:
```typescript
  createdProjects: [], // DELETE THIS LINE
```

Remove the `createProject` action from the interface and implementation.

**3f. Update `getProjects` derived function** to remove `createdProjects` logic:

Replace the `getProjects` implementation (lines 128-152) with:
```typescript
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
```

**Step 4: Run tests to verify they pass**

Run: `node --import tsx/esm tests/store-workspace.test.ts`
Expected: All tests PASS.

**Step 5: Run existing store tests**

Run: `node --import tsx/esm tests/store-analysis-status.test.ts`
Expected: PASS.

**Step 6: Commit**

```bash
git add src/renderer/src/store.ts tests/store-workspace.test.ts && git commit -m "feat: add workspace state to store — expandedProjectSlugs, remove createdProjects"
```

---

### Task 11: AddProjectModal Component

**Files:**
- Create: `src/renderer/src/components/AddProjectModal.tsx`
- Delete: `src/renderer/src/components/NewProjectModal.tsx` (after wiring)

**Step 1: Create `src/renderer/src/components/AddProjectModal.tsx`**

Reference mockup: `docs/mockups/add-project-option-A.png`

```tsx
import { useState, useEffect } from 'react'

interface DiscoveredProject {
  slug: string
  name: string
  path: string
}

type AddProjectModalProps = {
  onClose: () => void
  onCreateNew: (name: string) => void
  onAddExisting: (project: DiscoveredProject) => void
}

function AddProjectModal({ onClose, onCreateNew, onAddExisting }: AddProjectModalProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<'new' | 'existing'>('new')
  const [name, setName] = useState('')
  const [search, setSearch] = useState('')
  const [discovered, setDiscovered] = useState<DiscoveredProject[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedExisting, setSelectedExisting] = useState<DiscoveredProject | null>(null)

  // Discover projects when "Existing" tab is first opened
  useEffect(() => {
    if (activeTab === 'existing' && discovered.length === 0 && !loading) {
      setLoading(true)
      // Discover from the default Amplifier home
      const amplifierHome = process.env['AMPLIFIER_HOME'] || `${process.env['HOME'] || '~'}/.amplifier`
      window.electronAPI.discoverProjects(amplifierHome).then((projects) => {
        setDiscovered(projects)
        setLoading(false)
      }).catch(() => {
        setLoading(false)
      })
    }
  }, [activeTab, discovered.length, loading])

  const filteredProjects = discovered.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.slug.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div
      data-testid="modal-overlay"
      onClick={onClose}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(20,16,10,0.18)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
      }}
    >
      <div
        data-testid="modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 440,
          background: 'var(--bg-modal)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          padding: 24,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
            Add Project
          </span>
          <button
            data-testid="modal-close"
            onClick={onClose}
            style={{
              fontSize: 16,
              color: 'var(--text-muted)',
              background: 'none',
              border: 'none',
              lineHeight: 1,
              padding: 0,
              cursor: 'pointer',
            }}
          >
            {'\u00d7'}
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 16, marginTop: 16, borderBottom: '1px solid var(--border)' }}>
          <button
            data-testid="tab-new"
            onClick={() => setActiveTab('new')}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'new' ? '2px solid var(--text-primary)' : '2px solid transparent',
              paddingBottom: 8,
              fontSize: 13,
              fontWeight: activeTab === 'new' ? 600 : 400,
              color: activeTab === 'new' ? 'var(--text-primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
            }}
          >
            New
          </button>
          <button
            data-testid="tab-existing"
            onClick={() => setActiveTab('existing')}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'existing' ? '2px solid var(--text-primary)' : '2px solid transparent',
              paddingBottom: 8,
              fontSize: 13,
              fontWeight: activeTab === 'existing' ? 600 : 400,
              color: activeTab === 'existing' ? 'var(--text-primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
            }}
          >
            Existing
          </button>
        </div>

        {/* Tab content */}
        <div style={{ marginTop: 16 }}>
          {activeTab === 'new' && (
            <>
              <input
                data-testid="project-name-input"
                type="text"
                placeholder="Project name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: '1px solid var(--border)',
                  background: '#F5F2EC',
                  borderRadius: 3,
                  fontSize: 13,
                  fontFamily: 'var(--font-ui)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{
                fontSize: 11,
                color: 'var(--text-very-muted)',
                marginTop: 6,
              }}>
                Creates a new Amplifier project
              </div>

              {/* Footer */}
              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button
                  data-testid="modal-cancel"
                  onClick={onClose}
                  style={{
                    fontSize: 13,
                    color: 'var(--text-muted)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  data-testid="modal-submit"
                  onClick={() => {
                    if (name.trim()) {
                      onCreateNew(name.trim())
                    }
                  }}
                  style={{
                    padding: '7px 14px',
                    border: '1px solid #3A3530',
                    background: '#2F2B24',
                    color: '#FFFFFF',
                    fontSize: 13,
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-ui)',
                    opacity: name.trim() ? 1 : 0.5,
                  }}
                >
                  Create Project
                </button>
              </div>
            </>
          )}

          {activeTab === 'existing' && (
            <>
              <input
                data-testid="search-input"
                type="text"
                placeholder="Search projects..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: '1px solid var(--border)',
                  background: '#F5F2EC',
                  borderRadius: 3,
                  fontSize: 13,
                  fontFamily: 'var(--font-ui)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />

              {/* Project list */}
              <div style={{
                marginTop: 8,
                maxHeight: 240,
                overflowY: 'auto',
              }}>
                {loading && (
                  <div style={{ fontSize: 12, color: 'var(--text-very-muted)', padding: '12px 0', textAlign: 'center' }}>
                    Scanning...
                  </div>
                )}
                {!loading && filteredProjects.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-very-muted)', padding: '12px 0', textAlign: 'center' }}>
                    {search ? 'No matching projects' : 'No Amplifier projects found'}
                  </div>
                )}
                {filteredProjects.map((project) => (
                  <div
                    key={project.slug}
                    data-testid="discovered-project"
                    onClick={() => setSelectedExisting(project)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      backgroundColor: selectedExisting?.slug === project.slug ? 'rgba(0,0,0,0.06)' : 'transparent',
                      border: selectedExisting?.slug === project.slug ? '1px solid var(--border)' : '1px solid transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (selectedExisting?.slug !== project.slug) {
                        ;(e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(0,0,0,0.03)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLDivElement).style.backgroundColor =
                        selectedExisting?.slug === project.slug ? 'rgba(0,0,0,0.06)' : 'transparent'
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                      {project.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-very-muted)', marginTop: 2 }}>
                      {project.path}
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button
                  data-testid="modal-cancel"
                  onClick={onClose}
                  style={{
                    fontSize: 13,
                    color: 'var(--text-muted)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  data-testid="modal-submit"
                  onClick={() => {
                    if (selectedExisting) {
                      onAddExisting(selectedExisting)
                    }
                  }}
                  style={{
                    padding: '7px 14px',
                    border: '1px solid #3A3530',
                    background: '#2F2B24',
                    color: '#FFFFFF',
                    fontSize: 13,
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-ui)',
                    opacity: selectedExisting ? 1 : 0.5,
                  }}
                >
                  Add to Canvas
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default AddProjectModal
```

**Step 2: Build to verify**

Run: `npm run build`
Expected: Build succeeds (component not yet wired into App.tsx).

**Step 3: Commit**

```bash
git add src/renderer/src/components/AddProjectModal.tsx && git commit -m "feat: add AddProjectModal with New/Existing tabs"
```

---

### Task 12: Context Menu Component + Sidebar Integration

**Files:**
- Create: `src/renderer/src/components/ContextMenu.tsx`
- Modify: `src/renderer/src/components/Sidebar.tsx`

**Step 1: Create `src/renderer/src/components/ContextMenu.tsx`**

```tsx
import { useEffect, useRef } from 'react'

export interface ContextMenuItem {
  label: string
  onClick: () => void
  danger?: boolean
}

interface ContextMenuProps {
  items: ContextMenuItem[]
  x: number
  y: number
  onClose: () => void
}

function ContextMenu({ items, x, y, onClose }: ContextMenuProps): React.ReactElement {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      data-testid="context-menu"
      style={{
        position: 'fixed',
        left: x,
        top: y,
        background: 'var(--bg-modal)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        padding: '4px 0',
        zIndex: 100,
        minWidth: 160,
      }}
    >
      {items.map((item, i) => (
        <div
          key={i}
          data-testid="context-menu-item"
          onClick={() => {
            item.onClick()
            onClose()
          }}
          style={{
            padding: '6px 12px',
            fontSize: 12,
            color: item.danger ? '#EF4444' : 'var(--text-primary)',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(0,0,0,0.06)'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'
          }}
        >
          {item.label}
        </div>
      ))}
    </div>
  )
}

export default ContextMenu
```

**Step 2: Add context menu state and handlers to `Sidebar.tsx`**

In `src/renderer/src/components/Sidebar.tsx`:

**2a.** Add the import at the top:
```typescript
import { useState, useMemo } from 'react'
import ContextMenu from './ContextMenu'
import type { ContextMenuItem } from './ContextMenu'
```

**2b.** Add context menu state inside the `Sidebar` function (after the existing store hooks):
```typescript
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    items: ContextMenuItem[]
  } | null>(null)
```

**2c.** Add context menu handler functions:
```typescript
  const handleProjectContextMenu = (e: React.MouseEvent, projectSlug: string) => {
    e.preventDefault()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: 'Remove from Canvas',
          onClick: () => {
            window.electronAPI.unregisterProject(projectSlug)
          },
        },
      ],
    })
  }

  const handleSessionContextMenu = (e: React.MouseEvent, session: SessionState) => {
    e.preventDefault()
    const items: ContextMenuItem[] = [
      {
        label: 'Remove from view',
        onClick: () => {
          window.electronAPI.hideSession(session.id)
        },
      },
    ]
    if (session.status === 'running' || session.status === 'active' || session.status === 'needs_input') {
      items.unshift({
        label: 'Stop',
        danger: true,
        onClick: () => {
          window.electronAPI.stopSession(session.id)
        },
      })
    }
    setContextMenu({ x: e.clientX, y: e.clientY, items })
  }
```

**2d.** Add `onContextMenu` to the project label `<div>` (the one with `data-testid="project-item"`):
```typescript
onContextMenu={(e) => handleProjectContextMenu(e, project.slug)}
```

**2e.** Add `onContextMenu` to both `SessionRow` and `HistorySessionRow` wrappers. In the `.map()` calls, pass the handler:

For active sessions (in the `activeSessions.map`):
```tsx
<div onContextMenu={(e) => handleSessionContextMenu(e, session)}>
  <SessionRow ... />
</div>
```

For history sessions (in the `historySessions.map`):
```tsx
<div onContextMenu={(e) => handleSessionContextMenu(e, session)}>
  <HistorySessionRow ... />
</div>
```

**2f.** Render the context menu at the bottom of the sidebar return, just before the closing `</div>`:
```tsx
      {contextMenu && (
        <ContextMenu
          items={contextMenu.items}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
```

**2g.** Remove `createdProjects` from the sidebar's store hooks and project derivation. Replace the `createdProjects`-based derivation with `expandedProjectSlugs`:

Remove:
```typescript
  const createdProjects = useCanvasStore((s) => s.createdProjects)
```

Add:
```typescript
  const expandedProjectSlugs = useCanvasStore((s) => s.expandedProjectSlugs)
  const toggleProjectExpanded = useCanvasStore((s) => s.toggleProjectExpanded)
```

Update the `selectProject` toggle on the project item `onClick` to use `toggleProjectExpanded`:
```typescript
onClick={() => toggleProjectExpanded(project.slug)}
```

And conditionally show/hide session rows based on whether the project is expanded:
```typescript
const isExpanded = expandedProjectSlugs.includes(project.slug)
```

Only render session rows and history when `isExpanded` is true.

Update the project derivation `useMemo` to remove `createdProjects`:
```typescript
  const projects: Project[] = useMemo(() => {
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
  }, [sessions])
```

**Step 3: Build to verify**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add src/renderer/src/components/ContextMenu.tsx src/renderer/src/components/Sidebar.tsx && git commit -m "feat: add context menu — right-click Remove from Canvas, Remove from view, Stop"
```

---

### Task 13: Wire Everything in App.tsx + Delete NewProjectModal

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Delete: `src/renderer/src/components/NewProjectModal.tsx`

**Step 1: Update imports in `App.tsx`**

Replace the `NewProjectModal` import:
```typescript
import AddProjectModal from './components/AddProjectModal'
```

Remove:
```typescript
import NewProjectModal from './components/NewProjectModal'
```

**Step 2: Add workspace state IPC listeners at module level**

In the existing module-level IPC listener block (lines 12-19), add:

```typescript
  window.electronAPI.onRunningSessionsToast(({ count }) => {
    useCanvasStore.getState().addToast({
      sessionId: 'app-quit',
      message: `${count} ${count === 1 ? 'session is' : 'sessions are'} still running. They'll continue in the background.`,
    })
  })
```

**Step 3: Add workspace state restoration on mount**

Inside the `App` function, add state restoration logic. Replace the existing `sidebarCollapsed` useState:

```typescript
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false)
```

Add workspace state restoration (after the existing `useState` hooks):
```typescript
  // Restore workspace state on mount
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getWorkspaceState().then(({ state, isFirstTime }) => {
        if (!isFirstTime && state) {
          if (state.selectedProjectSlug) {
            useCanvasStore.getState().selectProject(state.selectedProjectSlug)
          }
          if (state.selectedSessionId) {
            useCanvasStore.getState().selectSession(state.selectedSessionId)
            useCanvasStore.getState().openViewer()
          }
          if (state.expandedProjectSlugs.length > 0) {
            useCanvasStore.getState().setExpandedProjectSlugs(state.expandedProjectSlugs)
          }
          setSidebarCollapsed(state.sidebarCollapsed)
        }
        setWorkspaceLoaded(true)
      }).catch(() => {
        setWorkspaceLoaded(true)
      })
    } else {
      setWorkspaceLoaded(true)
    }
  }, [])
```

Add `useEffect` import:
```typescript
import { useState, useEffect } from 'react'
```

**Step 4: Add workspace state persistence on every user interaction**

Add a `useEffect` that saves workspace state whenever relevant state changes:
```typescript
  // Persist workspace state on every relevant change
  useEffect(() => {
    if (!workspaceLoaded || !window.electronAPI) return
    window.electronAPI.saveWorkspaceState({
      selectedProjectSlug: useCanvasStore.getState().selectedProjectSlug,
      expandedProjectSlugs: useCanvasStore.getState().expandedProjectSlugs,
      selectedSessionId: selectedSessionId,
      sidebarCollapsed,
    })
  }, [selectedSessionId, sidebarCollapsed, workspaceLoaded])
```

Also subscribe to store changes for `selectedProjectSlug` and `expandedProjectSlugs`:
```typescript
  const selectedProjectSlug = useCanvasStore((s) => s.selectedProjectSlug)
  const expandedProjectSlugs = useCanvasStore((s) => s.expandedProjectSlugs)
```

Update the persistence `useEffect` dependencies:
```typescript
  useEffect(() => {
    if (!workspaceLoaded || !window.electronAPI) return
    window.electronAPI.saveWorkspaceState({
      selectedProjectSlug,
      expandedProjectSlugs,
      selectedSessionId,
      sidebarCollapsed,
    })
  }, [selectedSessionId, selectedProjectSlug, expandedProjectSlugs, sidebarCollapsed, workspaceLoaded])
```

**Step 5: Replace NewProjectModal with AddProjectModal**

Replace the `NewProjectModal` usage in the JSX (around line 240-257):

```tsx
{showModal && (
  <AddProjectModal
    onClose={() => setShowModal(false)}
    onCreateNew={(projectName) => {
      const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const amplifierHome = process.env['AMPLIFIER_HOME'] || `${process.env['HOME'] || '~'}/.amplifier`
      const path = `${amplifierHome}/projects/${slug}`

      window.electronAPI.registerProject(slug, path, projectName).then(() => {
        useCanvasStore.getState().selectProject(slug)
        useCanvasStore.getState().toggleProjectExpanded(slug)
        setShowModal(false)
        setShowTerminal(true)

        setTimeout(() => {
          if (window.electronAPI) {
            window.electronAPI.sendTerminalInput('amplifier\r')
          }
        }, 300)
      })
    }}
    onAddExisting={(project) => {
      window.electronAPI.registerProject(project.slug, project.path, project.name).then(() => {
        useCanvasStore.getState().selectProject(project.slug)
        useCanvasStore.getState().toggleProjectExpanded(project.slug)
        setShowModal(false)
      })
    }}
  />
)}
```

**Step 6: Remove `createProject` from the store hooks in App.tsx**

Remove this line:
```typescript
  const createProject = useCanvasStore((s) => s.createProject)
```

**Step 7: Delete `NewProjectModal.tsx`**

```bash
rm src/renderer/src/components/NewProjectModal.tsx
```

**Step 8: Build to verify**

Run: `npm run build`
Expected: Build succeeds.

**Step 9: Run E2E tests**

Run: `npx playwright test`
Expected: Tests pass (some may need updating if they reference `NewProjectModal` — fix any broken selectors).

**Step 10: Commit**

```bash
git add -A && git commit -m "feat: wire workspace model end-to-end — AddProjectModal, state restoration, running sessions toast"
```

---

### Task 14: Add `stopped` Status to Sidebar Rendering

**Files:**
- Modify: `src/renderer/src/components/Sidebar.tsx`

**Step 1: Add `stopped` to the status rendering**

In `Sidebar.tsx`, update `STATUS_COLORS` to include `stopped`:
```typescript
const STATUS_COLORS: Record<SessionStatus, string> = {
  running: '#F59E0B',
  active: '#F59E0B',
  needs_input: '#F59E0B',
  done: '#3ECF8E',
  failed: '#EF4444',
  loading: '#6B7280',
  stopped: '#6B7280',  // Gray — neutral indicator
}
```

**Step 2: Update `ACTIVE_STATUSES` and `COMPLETED_STATUSES` sets**

Add `stopped` to the completed set:
```typescript
const COMPLETED_STATUSES = new Set<SessionStatus>(['done', 'failed', 'stopped'])
```

**Step 3: Build to verify**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Run all unit tests**

Run:
```bash
node --import tsx/esm tests/db-workspace.test.ts && \
node --import tsx/esm tests/workspace.test.ts && \
node --import tsx/esm tests/discovery.test.ts && \
node --import tsx/esm tests/store-workspace.test.ts && \
node --import tsx/esm tests/db-phase2.test.ts && \
node --import tsx/esm tests/store-analysis-status.test.ts
```
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/renderer/src/components/Sidebar.tsx && git commit -m "feat: add stopped status rendering to sidebar"
```

---

### Task 15: Final Integration Test & Cleanup

**Files:**
- Verify all files

**Step 1: Full build**

Run: `npm run build`
Expected: Build succeeds with no errors.

**Step 2: Run all unit tests**

Run:
```bash
node --import tsx/esm tests/db-workspace.test.ts && \
node --import tsx/esm tests/workspace.test.ts && \
node --import tsx/esm tests/discovery.test.ts && \
node --import tsx/esm tests/store-workspace.test.ts && \
node --import tsx/esm tests/db-phase2.test.ts && \
node --import tsx/esm tests/store-analysis-status.test.ts && \
node --import tsx/esm tests/events-parser.test.ts
```
Expected: All tests PASS.

**Step 3: Run E2E tests**

Run: `npx playwright test`
Expected: All E2E tests PASS.

**Step 4: Verify NewProjectModal.tsx is deleted**

Run: `ls src/renderer/src/components/NewProjectModal.tsx`
Expected: File not found.

**Step 5: Final commit if any cleanup was needed**

```bash
git add -A && git commit -m "chore: workspace model — final cleanup and integration verification"
```
