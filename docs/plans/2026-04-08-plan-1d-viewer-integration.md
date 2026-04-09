# Phase 1D: Viewer Integration Implementation Plan

> **Execution:** Use the subagent-driven-development workflow to implement this plan.

**Goal:** Build the Viewer panel — the visual cockpit that shows files touched by AI agent sessions, with file browsing, syntax-highlighted code, markdown rendering, and image display via a custom protocol.

**Architecture:** When a user clicks a session in the Sidebar, a Viewer panel slides into the right side of the layout. The Viewer contains a FileBrowser rooted at the session's `workDir`, plus renderers for markdown (react-markdown + DOMPurify), code (highlight.js), and images (canvas:// custom protocol). Session selection flows through the Zustand store; file content is fetched via existing IPC handlers (`files:list-dir`, `files:read-text`). A new `canvas://` Electron protocol provides secure image access.

**Tech Stack:** react-markdown (markdown rendering), DOMPurify (HTML sanitization), highlight.js (syntax highlighting), Electron protocol.handle (custom protocol for images)

---

## Pre-flight: Verify Existing Tests Pass

Before touching anything, confirm the baseline:

```bash
cd /Users/chrispark/Projects/amplifier-canvas
npm run build && npx playwright test
```

**Expected:** All 41 tests pass (T1-T5, S1-S5, D1-D5, app, cli, ipc-bridge). If anything fails, stop and fix before proceeding.

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install runtime dependencies**

```bash
cd /Users/chrispark/Projects/amplifier-canvas
npm install react-markdown dompurify highlight.js
```

**Step 2: Install dev dependencies**

```bash
npm install --save-dev @types/dompurify
```

**Step 3: Verify the build still works**

```bash
npm run build && npx playwright test
```

**Expected:** Build succeeds. All 41 existing tests pass. No import errors.

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add react-markdown, dompurify, highlight.js for viewer panel"
```

---

### Task 2: Add workDir to Types + Events Parser + Scanner

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/events-parser.ts`
- Modify: `src/main/scanner.ts`
- Modify: `src/main/index.ts`

This task threads `workDir` through the entire data pipeline so the Viewer knows where a session's project files live on disk.

**Step 1: Add workDir to SessionState**

In `src/shared/types.ts`, add `workDir` to the `SessionState` interface. Find this block:

```typescript
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
```

Replace it with:

```typescript
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
}
```

**Step 2: Add extractWorkDir to events-parser.ts**

In `src/main/events-parser.ts`, add a new exported function after the existing `extractFileActivity` function. Add this at the very end of the file (after line 120):

```typescript
export function extractWorkDir(events: ParsedEvent[]): string | undefined {
  const startEvent = events.find((e) => e.type === 'session:start')
  if (!startEvent) return undefined

  const data = startEvent.data as Record<string, unknown>
  // Check common field names for working directory
  const workDir = (data.cwd as string) || (data.workDir as string) || (data.project_dir as string)
  return workDir || undefined
}
```

**Step 3: Update scanner.ts to extract and propagate workDir**

In `src/main/scanner.ts`, add the import for `extractWorkDir`. Find this line:

```typescript
import { tailReadEvents, deriveSessionStatus, extractFileActivity } from './events-parser'
```

Replace it with:

```typescript
import { tailReadEvents, deriveSessionStatus, extractFileActivity, extractWorkDir } from './events-parser'
```

Then, in the same file, find this block inside the `for (const sessionDir of sessionDirs)` loop (around line 53-84):

```typescript
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
```

Replace it with:

```typescript
      const { events, newByteOffset } = tailReadEvents(eventsPath, 0)
      const status = deriveSessionStatus(events)
      const recentFiles = extractFileActivity(events)
      const workDir = extractWorkDir(events)

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
        workDir,
      })
```

**Step 4: Update main/index.ts to add workDirs to allowedDirs**

In `src/main/index.ts`, find this block (around line 151-159):

```typescript
  // Set allowed directories for file access security
  const projectsDir = join(amplifierHome, 'projects')
  if (existsSync(projectsDir)) {
    const allowedDirs = [projectsDir]
    setAllowedDirs(allowedDirs)
  }
```

Replace it with:

```typescript
  // Set allowed directories for file access security
  const projectsDir = join(amplifierHome, 'projects')
  if (existsSync(projectsDir)) {
    // Collect workDirs from scanned sessions for file access
    const workDirs = scanResult.sessions
      .map((s) => s.workDir)
      .filter((dir): dir is string => !!dir && existsSync(dir))
    const allowedDirs = [projectsDir, ...workDirs]
    setAllowedDirs(allowedDirs)
  }
```

**Step 5: Build and test**

```bash
cd /Users/chrispark/Projects/amplifier-canvas
npm run build && npx playwright test
```

**Expected:** Build succeeds. All 41 tests pass. The `workDir` field is `undefined` for all existing fixture sessions (their events.jsonl files don't have `cwd` in session:start yet — that's fine, we'll fix fixtures in the next task).

**Step 6: Commit**

```bash
git add src/shared/types.ts src/main/events-parser.ts src/main/scanner.ts src/main/index.ts
git commit -m "feat: add workDir to SessionState, extract from events, propagate through scanner"
```

---

### Task 3: Update Fixtures with workDir and Browsable Files

**Files:**
- Modify: `e2e/fixtures/amplifier-home/projects/team-pulse/sessions/tp-session-001/events.jsonl`
- Modify: `e2e/fixtures/amplifier-home/projects/team-pulse/sessions/tp-session-002/events.jsonl`
- Modify: `e2e/fixtures/amplifier-home/projects/ridecast/sessions/rc-session-001/events.jsonl`
- Create: `e2e/fixtures/amplifier-home/projects/team-pulse/workdir/README.md`
- Create: `e2e/fixtures/amplifier-home/projects/team-pulse/workdir/src/app.ts`
- Create: `e2e/fixtures/amplifier-home/projects/team-pulse/workdir/src/styles.css`
- Create: `e2e/fixtures/amplifier-home/projects/team-pulse/workdir/assets/logo.png`
- Create: `e2e/fixtures/amplifier-home/projects/ridecast/workdir/README.md`

The `workDir` in fixture events must use a **path that's dynamically resolved at test time**. But events.jsonl is static JSON. We'll use a relative path trick: the scanner reads events and gets a path. We need to set `cwd` in the events.jsonl to the absolute path of the fixture workdir.

**Problem:** We can't hardcode absolute paths in fixture files — they'd break on other machines. **Solution:** We'll use a test helper to rewrite the fixture events.jsonl at test setup time. But that's complex. **Simpler solution:** Update the `extractWorkDir` function in the previous task to also support a relative `cwd` resolved against the session directory. Actually, the simplest approach: we'll set `cwd` to a special marker and have the scanner resolve it. 

**Simplest approach that works:** Set `cwd` in events.jsonl to a relative path from the session dir, and have the scanner resolve it. Let's update `extractWorkDir` to also accept an optional `sessionDir` parameter for resolution.

**Step 1: Update extractWorkDir to accept a base directory for resolution**

In `src/main/events-parser.ts`, find the `extractWorkDir` function you added in Task 2:

```typescript
export function extractWorkDir(events: ParsedEvent[]): string | undefined {
  const startEvent = events.find((e) => e.type === 'session:start')
  if (!startEvent) return undefined

  const data = startEvent.data as Record<string, unknown>
  // Check common field names for working directory
  const workDir = (data.cwd as string) || (data.workDir as string) || (data.project_dir as string)
  return workDir || undefined
}
```

Replace it with:

```typescript
export function extractWorkDir(events: ParsedEvent[], sessionDir?: string): string | undefined {
  const startEvent = events.find((e) => e.type === 'session:start')
  if (!startEvent) return undefined

  const data = startEvent.data as Record<string, unknown>
  // Check common field names for working directory
  const rawDir = (data.cwd as string) || (data.workDir as string) || (data.project_dir as string)
  if (!rawDir) return undefined

  // If the path is relative and we have a session directory, resolve against it
  if (sessionDir && !require('path').isAbsolute(rawDir)) {
    return require('path').resolve(sessionDir, rawDir)
  }

  return rawDir
}
```

**Step 2: Update scanner.ts to pass sessionDir to extractWorkDir**

In `src/main/scanner.ts`, find this line inside the session loop:

```typescript
      const workDir = extractWorkDir(events)
```

Replace it with:

```typescript
      const sessionPath = join(sessionsDir, sessionId)
      const workDir = extractWorkDir(events, sessionPath)
```

**Step 3: Update fixture events.jsonl files to include cwd**

The `cwd` will be a relative path from the session directory to the project's workdir. For team-pulse sessions, the session dir is `projects/team-pulse/sessions/tp-session-001/` and the workdir is `projects/team-pulse/workdir/`. So relative path is `../../workdir`.

Replace the **entire contents** of `e2e/fixtures/amplifier-home/projects/team-pulse/sessions/tp-session-001/events.jsonl` with:

```
{"type":"session:start","timestamp":"2026-04-07T10:00:00Z","data":{"sessionId":"tp-session-001","projectSlug":"team-pulse","cwd":"../../workdir"}}
{"type":"tool_call","timestamp":"2026-04-07T10:00:05Z","data":{"tool":"read_file","args":{"path":"src/app.ts"}}}
{"type":"tool_call","timestamp":"2026-04-07T10:00:10Z","data":{"tool":"write_file","args":{"path":"src/app.ts"}}}
{"type":"tool_call","timestamp":"2026-04-07T10:00:15Z","data":{"tool":"edit_file","args":{"path":"src/utils.ts"}}}
{"type":"assistant_message","timestamp":"2026-04-07T10:00:20Z","data":{"text":"Done. I updated app.ts and utils.ts."}}
{"type":"session:end","timestamp":"2026-04-07T10:00:25Z","data":{"exitCode":0}}
```

Replace the **entire contents** of `e2e/fixtures/amplifier-home/projects/team-pulse/sessions/tp-session-002/events.jsonl` with:

```
{"type":"session:start","timestamp":"2026-04-07T11:00:00Z","data":{"sessionId":"tp-session-002","projectSlug":"team-pulse","cwd":"../../workdir"}}
{"type":"tool_call","timestamp":"2026-04-07T11:00:05Z","data":{"tool":"create_file","args":{"path":"src/new-feature.ts"}}}
{"type":"assistant_message","timestamp":"2026-04-07T11:00:10Z","data":{"text":"I created the new feature file."}}
```

Replace the **entire contents** of `e2e/fixtures/amplifier-home/projects/ridecast/sessions/rc-session-001/events.jsonl` with:

```
{"type":"session:start","timestamp":"2026-04-07T09:00:00Z","data":{"sessionId":"rc-session-001","projectSlug":"ridecast","cwd":"../../workdir"}}
{"type":"tool_call","timestamp":"2026-04-07T09:00:05Z","data":{"tool":"read_file","args":{"path":"README.md"}}}
{"type":"session:end","timestamp":"2026-04-07T09:00:10Z","data":{"exitCode":0}}
```

**Step 4: Create team-pulse workdir fixture files**

Create `e2e/fixtures/amplifier-home/projects/team-pulse/workdir/README.md`:

```markdown
# Team Pulse

A real-time team activity dashboard.

## Features

- Live activity feed
- Status indicators
- Project timeline

## Getting Started

```bash
npm install
npm run dev
```

Built with TypeScript and React.
```

Create `e2e/fixtures/amplifier-home/projects/team-pulse/workdir/src/app.ts`:

```typescript
import { createServer } from 'http'

const PORT = 3000

interface PulseEvent {
  userId: string
  action: string
  timestamp: Date
}

const events: PulseEvent[] = []

function handlePulse(event: PulseEvent): void {
  events.push(event)
  console.log(`[pulse] ${event.userId}: ${event.action}`)
}

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', events: events.length }))
    return
  }
  res.writeHead(404)
  res.end('Not found')
})

server.listen(PORT, () => {
  console.log(`Team Pulse running on port ${PORT}`)
})

export { handlePulse, events }
```

Create `e2e/fixtures/amplifier-home/projects/team-pulse/workdir/src/styles.css`:

```css
:root {
  --color-primary: #2C2825;
  --color-secondary: #8B8B90;
  --color-background: #F2F0EB;
  --color-accent: #3B82F6;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background-color: var(--color-background);
  color: var(--color-primary);
  margin: 0;
  padding: 0;
}

.container {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px;
}

.pulse-event {
  padding: 8px 12px;
  border-bottom: 1px solid #e0e0e0;
  font-size: 14px;
}
```

Create `e2e/fixtures/amplifier-home/projects/team-pulse/workdir/assets/logo.png`:

This needs to be a valid 1x1 pixel PNG file. Generate it with:

```bash
cd /Users/chrispark/Projects/amplifier-canvas
mkdir -p e2e/fixtures/amplifier-home/projects/team-pulse/workdir/assets
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82' > e2e/fixtures/amplifier-home/projects/team-pulse/workdir/assets/logo.png
```

**Step 5: Create ridecast workdir fixture files**

Create `e2e/fixtures/amplifier-home/projects/ridecast/workdir/README.md`:

```markdown
# Ridecast

Ride-sharing route prediction service.

## Overview

Ridecast uses historical trip data to predict optimal routes
and estimated arrival times for ride-sharing drivers.
```

**Step 6: Build and test**

```bash
cd /Users/chrispark/Projects/amplifier-canvas
npm run build && npx playwright test
```

**Expected:** Build succeeds. All 41 tests pass. The fixtures now have `cwd` in their events, and the scanner resolves it to absolute paths for `workDir`.

**Step 7: Commit**

```bash
git add e2e/fixtures/ src/main/events-parser.ts src/main/scanner.ts
git commit -m "feat: add workDir to fixtures, resolve relative cwd paths in scanner"
```

---

### Task 4: Sidebar Session Click + Status Dots

**Files:**
- Modify: `src/renderer/src/components/Sidebar.tsx`
- Modify: `e2e/sidebar.spec.ts`

**Step 1: Write the failing tests**

Append these tests to the end of `e2e/sidebar.spec.ts`:

```typescript
// --- S6: Session Selection ---

test('S6: clicking a session selects it', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Expand Team Pulse project first
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

  // Click the first session
  const session = appWindow.locator('[data-testid="session-item"]').first()
  await expect(session).toBeVisible({ timeout: 3000 })
  await session.click()

  const selected = await session.getAttribute('data-selected')
  expect(selected).toBe('true')
})

test('S6: clicking a different session deselects the previous one', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Expand Team Pulse project
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
  expect(sessionCount).toBeGreaterThanOrEqual(2)

  // Click the first session
  await sessions.first().click()
  const firstSelected = await sessions.first().getAttribute('data-selected')
  expect(firstSelected).toBe('true')

  // Click the second session
  await sessions.nth(1).click()
  const firstAfter = await sessions.first().getAttribute('data-selected')
  const secondAfter = await sessions.nth(1).getAttribute('data-selected')
  expect(firstAfter).toBe('false')
  expect(secondAfter).toBe('true')
})

// --- S7: Status Dots ---

test('S7: session items show status dots', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Expand Team Pulse project
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

  const dots = appWindow.locator('[data-testid="status-dot"]')
  await expect(dots.first()).toBeVisible({ timeout: 3000 })
  const dotCount = await dots.count()
  expect(dotCount).toBeGreaterThanOrEqual(2)

  // Each dot should have a non-empty background-color
  const firstDotBg = await dots.first().evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(firstDotBg).not.toBe('')
  expect(firstDotBg).not.toBe('rgba(0, 0, 0, 0)')
})
```

**Step 2: Run tests to verify they fail**

```bash
cd /Users/chrispark/Projects/amplifier-canvas
npm run build && npx playwright test e2e/sidebar.spec.ts
```

**Expected:** S1-S5 pass. S6 and S7 fail because sessions have no click handler and no status dots.

**Step 3: Implement session click + status dots in Sidebar.tsx**

Replace the **entire contents** of `src/renderer/src/components/Sidebar.tsx` with:

```typescript
import { useMemo } from 'react'
import { useCanvasStore } from '../store'
import type { SessionState, SessionStatus } from '../../../shared/types'

type SidebarProps = {
  collapsed: boolean
  onToggle: () => void
}

interface Project {
  slug: string
  name: string
  sessions: SessionState[]
}

const STATUS_COLORS: Record<SessionStatus, string> = {
  running: '#3B82F6',
  active: '#3B82F6',
  needs_input: '#F59E0B',
  done: '#10B981',
  failed: '#EF4444',
}

function Sidebar({ collapsed, onToggle }: SidebarProps): React.ReactElement {
  const sessions = useCanvasStore((s) => s.sessions)
  const selectedProjectSlug = useCanvasStore((s) => s.selectedProjectSlug)
  const selectedSessionId = useCanvasStore((s) => s.selectedSessionId)
  const selectProject = useCanvasStore((s) => s.selectProject)
  const selectSession = useCanvasStore((s) => s.selectSession)

  // Derive projects from sessions (stable reference via useMemo)
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
                      data-selected={selectedSessionId === session.id ? 'true' : 'false'}
                      onClick={() => selectSession(session.id)}
                      style={{
                        padding: '2px 0',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        backgroundColor:
                          selectedSessionId === session.id
                            ? 'rgba(44, 40, 37, 0.08)'
                            : 'transparent',
                        borderRadius: '3px',
                        paddingLeft: '4px',
                        paddingRight: '4px',
                      }}
                    >
                      <span
                        data-testid="status-dot"
                        data-status={session.status}
                        style={{
                          width: 6,
                          height: 6,
                          minWidth: 6,
                          borderRadius: '50%',
                          backgroundColor: STATUS_COLORS[session.status] || '#8B8B90',
                          display: 'inline-block',
                        }}
                      />
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

**Step 4: Run tests to verify all pass**

```bash
cd /Users/chrispark/Projects/amplifier-canvas
npm run build && npx playwright test
```

**Expected:** All tests pass including the new S6 and S7 tests.

**Step 5: Commit**

```bash
git add src/renderer/src/components/Sidebar.tsx e2e/sidebar.spec.ts
git commit -m "feat(sidebar): add session click selection and status dots"
```

---

### Task 5: Viewer Shell + App.tsx Layout Wiring

**Files:**
- Create: `src/renderer/src/components/Viewer.tsx`
- Modify: `src/renderer/src/App.tsx`
- Create: `e2e/viewer.spec.ts`

**Step 1: Write the failing test**

Create `e2e/viewer.spec.ts`:

```typescript
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
```

**Step 2: Run tests to verify they fail**

```bash
cd /Users/chrispark/Projects/amplifier-canvas
npm run build && npx playwright test e2e/viewer.spec.ts
```

**Expected:** All V1 tests fail because Viewer.tsx doesn't exist yet.

**Step 3: Create Viewer.tsx**

Create `src/renderer/src/components/Viewer.tsx`:

```typescript
import { useCanvasStore } from '../store'
import type { SessionStatus } from '../../../shared/types'

const STATUS_COLORS: Record<SessionStatus, string> = {
  running: '#3B82F6',
  active: '#3B82F6',
  needs_input: '#F59E0B',
  done: '#10B981',
  failed: '#EF4444',
}

function Viewer(): React.ReactElement {
  const selectedSessionId = useCanvasStore((s) => s.selectedSessionId)
  const getSelectedSession = useCanvasStore((s) => s.getSelectedSession)
  const session = getSelectedSession()

  if (!selectedSessionId || !session) {
    return <div />
  }

  return (
    <div
      data-testid="viewer-panel"
      style={{
        width: 350,
        minWidth: 350,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#FFFFFF',
        borderLeft: '1px solid #E8E6E1',
        overflow: 'hidden',
      }}
    >
      {/* Viewer header */}
      <div
        data-testid="viewer-header"
        style={{
          padding: '10px 12px',
          borderBottom: '1px solid #E8E6E1',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          minHeight: 40,
        }}
      >
        <span
          data-testid="viewer-status-dot"
          style={{
            width: 8,
            height: 8,
            minWidth: 8,
            borderRadius: '50%',
            backgroundColor: STATUS_COLORS[session.status] || '#8B8B90',
            display: 'inline-block',
          }}
        />
        <div style={{ overflow: 'hidden' }}>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: '#2C2825',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {session.projectName}
          </div>
          <div
            style={{
              fontSize: '10px',
              color: '#8B8B90',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {session.id}
          </div>
        </div>
      </div>

      {/* Content area */}
      <div
        data-testid="viewer-content"
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '12px',
        }}
      >
        <div
          style={{
            color: '#8B8B90',
            fontSize: '12px',
            textAlign: 'center',
            marginTop: '40px',
          }}
        >
          Select a file to view
        </div>
      </div>
    </div>
  )
}

export default Viewer
```

**Step 4: Update App.tsx to include Viewer**

Replace the **entire contents** of `src/renderer/src/App.tsx` with:

```typescript
import { useState } from 'react'
import TerminalComponent from './components/Terminal'
import Sidebar from './components/Sidebar'
import Viewer from './components/Viewer'
import { useCanvasStore } from './store'

// Register IPC listeners eagerly at module level (before React mount)
// so we catch the initial session push from main process on did-finish-load.
// The useEffect approach loses the first push because it fires after paint.
if (typeof window !== 'undefined' && window.electronAPI) {
  window.electronAPI.onSessionsChanged((sessions) => {
    useCanvasStore.getState().setSessions(sessions)
  })
  window.electronAPI.onFilesChanged(({ sessionId, files }) => {
    useCanvasStore.getState().updateFileActivity(sessionId, files)
  })
}

function App(): React.ReactElement {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const sessions = useCanvasStore((s) => s.sessions)
  const selectedSessionId = useCanvasStore((s) => s.selectedSessionId)

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

      {/* Main content: sidebar + terminal + viewer */}
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
        {selectedSessionId && <Viewer />}
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

**Step 5: Run all tests**

```bash
cd /Users/chrispark/Projects/amplifier-canvas
npm run build && npx playwright test
```

**Expected:** All tests pass, including the new V1 tests. The existing terminal and sidebar tests still pass because the Viewer only appears when a session is selected (which most existing tests don't do).

**Step 6: Commit**

```bash
git add src/renderer/src/components/Viewer.tsx src/renderer/src/App.tsx e2e/viewer.spec.ts
git commit -m "feat(viewer): add Viewer shell with session header and three-panel layout"
```

---

### Task 6: FileBrowser Component

**Files:**
- Create: `src/renderer/src/components/FileBrowser.tsx`
- Modify: `src/renderer/src/components/Viewer.tsx`
- Modify: `e2e/viewer.spec.ts`

**Step 1: Write the failing tests**

Append to `e2e/viewer.spec.ts`:

```typescript
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
```

**Step 2: Run tests to verify they fail**

```bash
cd /Users/chrispark/Projects/amplifier-canvas
npm run build && npx playwright test e2e/viewer.spec.ts --grep "V2"
```

**Expected:** All V2 tests fail because FileBrowser.tsx doesn't exist yet.

**Step 3: Create FileBrowser.tsx**

Create `src/renderer/src/components/FileBrowser.tsx`:

```typescript
import { useState, useEffect, useCallback } from 'react'
import type { FileEntry } from '../../../shared/types'

type FileBrowserProps = {
  rootPath: string
  onSelectFile: (filePath: string) => void
}

function FileBrowser({ rootPath, onSelectFile }: FileBrowserProps): React.ReactElement {
  const [currentPath, setCurrentPath] = useState(rootPath)
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(true)

  const loadDirectory = useCallback(async (dirPath: string) => {
    setLoading(true)
    try {
      const result = await window.electronAPI.listDir(dirPath)
      // Sort: directories first, then files alphabetically
      const sorted = [...result].sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        return a.name.localeCompare(b.name)
      })
      setEntries(sorted)
    } catch {
      console.error('[FileBrowser] Failed to load directory:', dirPath)
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setCurrentPath(rootPath)
  }, [rootPath])

  useEffect(() => {
    void loadDirectory(currentPath)
  }, [currentPath, loadDirectory])

  const handleEntryClick = (entry: FileEntry): void => {
    if (entry.isDirectory) {
      setCurrentPath(entry.path)
    } else {
      onSelectFile(entry.path)
    }
  }

  const navigateUp = (): void => {
    if (currentPath !== rootPath) {
      const parent = currentPath.substring(0, currentPath.lastIndexOf('/'))
      if (parent.length >= rootPath.length) {
        setCurrentPath(parent)
      } else {
        setCurrentPath(rootPath)
      }
    }
  }

  // Compute relative breadcrumb from rootPath
  const relativePath = currentPath.startsWith(rootPath)
    ? currentPath.slice(rootPath.length).replace(/^\//, '')
    : ''
  const breadcrumbParts = relativePath ? relativePath.split('/') : []

  return (
    <div data-testid="file-browser" style={{ fontSize: '12px' }}>
      {/* Breadcrumb */}
      <div
        data-testid="file-breadcrumb"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 0 8px 0',
          color: '#8B8B90',
          fontSize: '10px',
          flexWrap: 'wrap',
        }}
      >
        <span
          onClick={() => setCurrentPath(rootPath)}
          style={{ cursor: 'pointer', color: '#3B82F6' }}
        >
          root
        </span>
        {breadcrumbParts.map((part, i) => {
          // Build path up to this part
          const pathUpTo = rootPath + '/' + breadcrumbParts.slice(0, i + 1).join('/')
          return (
            <span key={pathUpTo}>
              <span style={{ margin: '0 2px' }}>/</span>
              <span
                onClick={() => setCurrentPath(pathUpTo)}
                style={{
                  cursor: 'pointer',
                  color: i === breadcrumbParts.length - 1 ? '#2C2825' : '#3B82F6',
                }}
              >
                {part}
              </span>
            </span>
          )
        })}
      </div>

      {/* Back button when not at root */}
      {currentPath !== rootPath && (
        <div
          onClick={navigateUp}
          style={{
            padding: '3px 4px',
            cursor: 'pointer',
            color: '#8B8B90',
            fontSize: '11px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span style={{ fontSize: '10px' }}>..</span>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ color: '#8B8B90', padding: '8px 0', fontSize: '11px' }}>
          Loading...
        </div>
      )}

      {/* Empty state */}
      {!loading && entries.length === 0 && (
        <div style={{ color: '#8B8B90', padding: '8px 0', fontSize: '11px' }}>
          Empty directory
        </div>
      )}

      {/* File entries */}
      {!loading &&
        entries.map((entry) => (
          <div
            key={entry.path}
            data-testid="file-entry"
            data-is-directory={entry.isDirectory ? 'true' : 'false'}
            onClick={() => handleEntryClick(entry)}
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
              ;(e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(44, 40, 37, 0.06)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'
            }}
          >
            <span style={{ fontSize: '12px', width: '16px', textAlign: 'center' }}>
              {entry.isDirectory ? '\uD83D\uDCC1' : '\uD83D\uDCC4'}
            </span>
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {entry.name}
            </span>
          </div>
        ))}
    </div>
  )
}

export default FileBrowser
```

**Step 4: Update Viewer.tsx to include FileBrowser**

Replace the **entire contents** of `src/renderer/src/components/Viewer.tsx` with:

```typescript
import { useState } from 'react'
import { useCanvasStore } from '../store'
import FileBrowser from './FileBrowser'
import type { SessionStatus } from '../../../shared/types'

const STATUS_COLORS: Record<SessionStatus, string> = {
  running: '#3B82F6',
  active: '#3B82F6',
  needs_input: '#F59E0B',
  done: '#10B981',
  failed: '#EF4444',
}

function Viewer(): React.ReactElement {
  const selectedSessionId = useCanvasStore((s) => s.selectedSessionId)
  const getSelectedSession = useCanvasStore((s) => s.getSelectedSession)
  const session = getSelectedSession()

  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)

  if (!selectedSessionId || !session) {
    return <div />
  }

  return (
    <div
      data-testid="viewer-panel"
      style={{
        width: 350,
        minWidth: 350,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#FFFFFF',
        borderLeft: '1px solid #E8E6E1',
        overflow: 'hidden',
      }}
    >
      {/* Viewer header */}
      <div
        data-testid="viewer-header"
        style={{
          padding: '10px 12px',
          borderBottom: '1px solid #E8E6E1',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          minHeight: 40,
        }}
      >
        <span
          data-testid="viewer-status-dot"
          style={{
            width: 8,
            height: 8,
            minWidth: 8,
            borderRadius: '50%',
            backgroundColor: STATUS_COLORS[session.status] || '#8B8B90',
            display: 'inline-block',
          }}
        />
        <div style={{ overflow: 'hidden' }}>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: '#2C2825',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {session.projectName}
          </div>
          <div
            style={{
              fontSize: '10px',
              color: '#8B8B90',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {session.id}
          </div>
        </div>
      </div>

      {/* Content area */}
      <div
        data-testid="viewer-content"
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '12px',
        }}
      >
        {session.workDir ? (
          <FileBrowser
            rootPath={session.workDir}
            onSelectFile={(filePath) => setSelectedFilePath(filePath)}
          />
        ) : (
          <div
            style={{
              color: '#8B8B90',
              fontSize: '12px',
              textAlign: 'center',
              marginTop: '40px',
            }}
          >
            No working directory for this session
          </div>
        )}

        {selectedFilePath && (
          <div
            data-testid="file-renderer-placeholder"
            style={{
              marginTop: '12px',
              padding: '8px',
              fontSize: '11px',
              color: '#8B8B90',
              borderTop: '1px solid #E8E6E1',
            }}
          >
            Selected: {selectedFilePath.split('/').pop()}
          </div>
        )}
      </div>
    </div>
  )
}

export default Viewer
```

**Step 5: Run all tests**

```bash
cd /Users/chrispark/Projects/amplifier-canvas
npm run build && npx playwright test
```

**Expected:** All tests pass including the new V2 tests. The FileBrowser loads the team-pulse workdir and shows README.md, src/, and assets/.

**Step 6: Commit**

```bash
git add src/renderer/src/components/FileBrowser.tsx src/renderer/src/components/Viewer.tsx e2e/viewer.spec.ts
git commit -m "feat(viewer): add FileBrowser with directory navigation and breadcrumbs"
```

---

### Task 7: FileRenderer + MarkdownRenderer + CodeRenderer

**Files:**
- Create: `src/renderer/src/components/FileRenderer.tsx`
- Create: `src/renderer/src/components/MarkdownRenderer.tsx`
- Create: `src/renderer/src/components/CodeRenderer.tsx`
- Create: `src/renderer/src/components/ImageRenderer.tsx`
- Modify: `src/renderer/src/components/Viewer.tsx`
- Modify: `e2e/viewer.spec.ts`

**Step 1: Write the failing tests**

Append to `e2e/viewer.spec.ts`:

```typescript
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
```

**Step 2: Run tests to verify they fail**

```bash
cd /Users/chrispark/Projects/amplifier-canvas
npm run build && npx playwright test e2e/viewer.spec.ts --grep "V3|V4"
```

**Expected:** V3 and V4 tests fail because the renderer components don't exist.

**Step 3: Create MarkdownRenderer.tsx**

Create `src/renderer/src/components/MarkdownRenderer.tsx`:

```typescript
import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import DOMPurify from 'dompurify'

type MarkdownRendererProps = {
  filePath: string
}

function MarkdownRenderer({ filePath }: MarkdownRendererProps): React.ReactElement {
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    void window.electronAPI.readTextFile(filePath).then((text) => {
      if (!cancelled) {
        // Sanitize the raw markdown text to prevent XSS
        const sanitized = DOMPurify.sanitize(text)
        setContent(sanitized)
        setLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [filePath])

  if (loading) {
    return (
      <div style={{ color: '#8B8B90', fontSize: '11px', padding: '8px 0' }}>
        Loading...
      </div>
    )
  }

  return (
    <div
      data-testid="markdown-renderer"
      style={{
        fontSize: '13px',
        lineHeight: 1.6,
        color: '#2C2825',
      }}
    >
      <style>{`
        [data-testid="markdown-renderer"] h1 {
          font-size: 20px;
          font-weight: 600;
          margin: 16px 0 8px 0;
          border-bottom: 1px solid #E8E6E1;
          padding-bottom: 4px;
        }
        [data-testid="markdown-renderer"] h2 {
          font-size: 16px;
          font-weight: 600;
          margin: 14px 0 6px 0;
        }
        [data-testid="markdown-renderer"] h3 {
          font-size: 14px;
          font-weight: 600;
          margin: 12px 0 4px 0;
        }
        [data-testid="markdown-renderer"] p {
          margin: 8px 0;
        }
        [data-testid="markdown-renderer"] ul,
        [data-testid="markdown-renderer"] ol {
          padding-left: 20px;
          margin: 8px 0;
        }
        [data-testid="markdown-renderer"] li {
          margin: 2px 0;
        }
        [data-testid="markdown-renderer"] code {
          background-color: #F2F0EB;
          padding: 1px 4px;
          border-radius: 3px;
          font-size: 12px;
          font-family: Menlo, Monaco, 'Courier New', monospace;
        }
        [data-testid="markdown-renderer"] pre {
          background-color: #F2F0EB;
          padding: 12px;
          border-radius: 4px;
          overflow-x: auto;
        }
        [data-testid="markdown-renderer"] pre code {
          background: none;
          padding: 0;
        }
      `}</style>
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  )
}

export default MarkdownRenderer
```

**Step 4: Create CodeRenderer.tsx**

Create `src/renderer/src/components/CodeRenderer.tsx`:

```typescript
import { useState, useEffect, useRef } from 'react'
import hljs from 'highlight.js'

type CodeRendererProps = {
  filePath: string
}

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  py: 'python',
  rs: 'rust',
  go: 'go',
  css: 'css',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  sh: 'bash',
  bash: 'bash',
  html: 'html',
  xml: 'xml',
  sql: 'sql',
  md: 'markdown',
}

function getLanguage(filePath: string): string | undefined {
  const ext = filePath.split('.').pop()?.toLowerCase()
  return ext ? EXTENSION_TO_LANGUAGE[ext] : undefined
}

function CodeRenderer({ filePath }: CodeRendererProps): React.ReactElement {
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const codeRef = useRef<HTMLElement>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    void window.electronAPI.readTextFile(filePath).then((text) => {
      if (!cancelled) {
        setContent(text)
        setLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [filePath])

  useEffect(() => {
    if (!loading && codeRef.current && content) {
      const language = getLanguage(filePath)
      if (language && hljs.getLanguage(language)) {
        const result = hljs.highlight(content, { language })
        codeRef.current.innerHTML = result.value
      } else {
        // Auto-detect
        const result = hljs.highlightAuto(content)
        codeRef.current.innerHTML = result.value
      }
    }
  }, [content, loading, filePath])

  if (loading) {
    return (
      <div style={{ color: '#8B8B90', fontSize: '11px', padding: '8px 0' }}>
        Loading...
      </div>
    )
  }

  const lines = content.split('\n')

  return (
    <div data-testid="code-renderer">
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
      <div
        style={{
          display: 'flex',
          fontSize: '12px',
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          lineHeight: 1.5,
          overflow: 'auto',
        }}
      >
        {/* Line numbers */}
        <div
          style={{
            color: '#8B8B90',
            textAlign: 'right',
            paddingRight: '12px',
            userSelect: 'none',
            minWidth: '32px',
            borderRight: '1px solid #E8E6E1',
            marginRight: '12px',
          }}
        >
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>

        {/* Code content */}
        <pre
          style={{
            margin: 0,
            padding: 0,
            overflow: 'visible',
            whiteSpace: 'pre',
            flex: 1,
          }}
        >
          <code ref={codeRef} style={{ fontFamily: 'inherit' }}>
            {content}
          </code>
        </pre>
      </div>
    </div>
  )
}

export default CodeRenderer
```

**Step 5: Create ImageRenderer.tsx (placeholder for now)**

Create `src/renderer/src/components/ImageRenderer.tsx`:

```typescript
type ImageRendererProps = {
  filePath: string
}

function ImageRenderer({ filePath }: ImageRendererProps): React.ReactElement {
  const fileName = filePath.split('/').pop() || 'image'

  return (
    <div
      data-testid="image-renderer"
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '12px',
      }}
    >
      <div style={{ color: '#8B8B90', fontSize: '11px', textAlign: 'center' }}>
        <div style={{ marginBottom: '8px' }}>{fileName}</div>
        <div>(Image preview requires canvas:// protocol — Task 8)</div>
      </div>
    </div>
  )
}

export default ImageRenderer
```

**Step 6: Create FileRenderer.tsx**

Create `src/renderer/src/components/FileRenderer.tsx`:

```typescript
import MarkdownRenderer from './MarkdownRenderer'
import CodeRenderer from './CodeRenderer'
import ImageRenderer from './ImageRenderer'

type FileRendererProps = {
  filePath: string
}

const CODE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'css',
  'json', 'yaml', 'yml', 'toml', 'sh', 'bash', 'html',
  'xml', 'sql', 'c', 'cpp', 'h', 'hpp', 'java', 'rb',
  'swift', 'kt', 'php',
])

const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp',
])

function getExtension(filePath: string): string {
  const parts = filePath.split('.')
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ''
}

function FileRenderer({ filePath }: FileRendererProps): React.ReactElement {
  const ext = getExtension(filePath)

  let renderer: React.ReactElement

  if (ext === 'md' || ext === 'markdown') {
    renderer = <MarkdownRenderer filePath={filePath} />
  } else if (CODE_EXTENSIONS.has(ext)) {
    renderer = <CodeRenderer filePath={filePath} />
  } else if (IMAGE_EXTENSIONS.has(ext)) {
    renderer = <ImageRenderer filePath={filePath} />
  } else {
    // Fallback: treat as plain text code
    renderer = <CodeRenderer filePath={filePath} />
  }

  return (
    <div data-testid="file-renderer">
      {renderer}
    </div>
  )
}

export default FileRenderer
```

**Step 7: Update Viewer.tsx to use FileRenderer**

Replace the **entire contents** of `src/renderer/src/components/Viewer.tsx` with:

```typescript
import { useState, useEffect } from 'react'
import { useCanvasStore } from '../store'
import FileBrowser from './FileBrowser'
import FileRenderer from './FileRenderer'
import type { SessionStatus } from '../../../shared/types'

const STATUS_COLORS: Record<SessionStatus, string> = {
  running: '#3B82F6',
  active: '#3B82F6',
  needs_input: '#F59E0B',
  done: '#10B981',
  failed: '#EF4444',
}

function Viewer(): React.ReactElement {
  const selectedSessionId = useCanvasStore((s) => s.selectedSessionId)
  const getSelectedSession = useCanvasStore((s) => s.getSelectedSession)
  const session = getSelectedSession()

  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)

  // Reset selected file when session changes
  useEffect(() => {
    setSelectedFilePath(null)
  }, [selectedSessionId])

  if (!selectedSessionId || !session) {
    return <div />
  }

  const handleBack = (): void => {
    setSelectedFilePath(null)
  }

  return (
    <div
      data-testid="viewer-panel"
      style={{
        width: 350,
        minWidth: 350,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#FFFFFF',
        borderLeft: '1px solid #E8E6E1',
        overflow: 'hidden',
      }}
    >
      {/* Viewer header */}
      <div
        data-testid="viewer-header"
        style={{
          padding: '10px 12px',
          borderBottom: '1px solid #E8E6E1',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          minHeight: 40,
        }}
      >
        <span
          data-testid="viewer-status-dot"
          style={{
            width: 8,
            height: 8,
            minWidth: 8,
            borderRadius: '50%',
            backgroundColor: STATUS_COLORS[session.status] || '#8B8B90',
            display: 'inline-block',
          }}
        />
        <div style={{ overflow: 'hidden', flex: 1 }}>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: '#2C2825',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {session.projectName}
          </div>
          <div
            style={{
              fontSize: '10px',
              color: '#8B8B90',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {session.id}
          </div>
        </div>
      </div>

      {/* Recent files bar (quick access links) */}
      {session.recentFiles.length > 0 && (
        <div
          data-testid="recent-files-bar"
          style={{
            padding: '6px 12px',
            borderBottom: '1px solid #E8E6E1',
            display: 'flex',
            gap: '6px',
            flexWrap: 'wrap',
            maxHeight: '52px',
            overflow: 'hidden',
          }}
        >
          {/* Deduplicate recent files by path, show last 5 */}
          {[...new Map(session.recentFiles.map((f) => [f.path, f])).values()]
            .slice(-5)
            .map((file) => {
              const fileName = file.path.split('/').pop() || file.path
              return (
                <span
                  key={file.path}
                  data-testid="recent-file-link"
                  onClick={() => {
                    if (session.workDir) {
                      setSelectedFilePath(session.workDir + '/' + file.path)
                    }
                  }}
                  style={{
                    fontSize: '10px',
                    color: '#3B82F6',
                    cursor: 'pointer',
                    padding: '1px 4px',
                    borderRadius: '3px',
                    backgroundColor: '#F2F0EB',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {fileName}
                </span>
              )
            })}
        </div>
      )}

      {/* Content area */}
      <div
        data-testid="viewer-content"
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '12px',
        }}
      >
        {selectedFilePath ? (
          <div>
            {/* Back to file browser button */}
            <div
              data-testid="back-to-browser"
              onClick={handleBack}
              style={{
                fontSize: '10px',
                color: '#3B82F6',
                cursor: 'pointer',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>&larr;</span> Back to files
            </div>

            {/* File name display */}
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#2C2825',
                marginBottom: '8px',
                paddingBottom: '6px',
                borderBottom: '1px solid #E8E6E1',
              }}
            >
              {selectedFilePath.split('/').pop()}
            </div>

            <FileRenderer filePath={selectedFilePath} />
          </div>
        ) : session.workDir ? (
          <FileBrowser
            rootPath={session.workDir}
            onSelectFile={(filePath) => setSelectedFilePath(filePath)}
          />
        ) : (
          <div
            style={{
              color: '#8B8B90',
              fontSize: '12px',
              textAlign: 'center',
              marginTop: '40px',
            }}
          >
            No working directory for this session
          </div>
        )}
      </div>
    </div>
  )
}

export default Viewer
```

**Step 8: Run all tests**

```bash
cd /Users/chrispark/Projects/amplifier-canvas
npm run build && npx playwright test
```

**Expected:** All tests pass including V3 (markdown rendering) and V4 (code rendering with highlight.js). The markdown renderer shows the Team Pulse README with an `<h1>` heading. The code renderer shows `app.ts` content with hljs classes.

**Step 9: Commit**

```bash
git add src/renderer/src/components/FileRenderer.tsx src/renderer/src/components/MarkdownRenderer.tsx src/renderer/src/components/CodeRenderer.tsx src/renderer/src/components/ImageRenderer.tsx src/renderer/src/components/Viewer.tsx e2e/viewer.spec.ts
git commit -m "feat(viewer): add FileRenderer with markdown, code, and image dispatching"
```

---

### Task 8: canvas:// Protocol + ImageRenderer Wiring

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/renderer/src/components/ImageRenderer.tsx`
- Modify: `e2e/viewer.spec.ts`

**Step 1: Write the failing test**

Append to `e2e/viewer.spec.ts`:

```typescript
// --- V5: canvas:// Protocol + ImageRenderer ---

test('V5: clicking an image file shows the image renderer', async ({ appWindow }) => {
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
```

**Step 2: Run tests to verify it fails**

```bash
cd /Users/chrispark/Projects/amplifier-canvas
npm run build && npx playwright test e2e/viewer.spec.ts --grep "V5"
```

**Expected:** V5 fails because the canvas:// protocol doesn't exist and ImageRenderer doesn't render an `<img>` tag.

**Step 3: Export isPathAllowed from ipc.ts**

In `src/main/ipc.ts`, the `isPathAllowed` function is currently not exported. Find this line:

```typescript
function isPathAllowed(requestedPath: string): boolean {
```

Replace it with:

```typescript
export function isPathAllowed(requestedPath: string): boolean {
```

**Step 4: Register canvas:// protocol in main/index.ts**

In `src/main/index.ts`, add the protocol import. Find this line:

```typescript
import { app, BrowserWindow, Menu, shell } from 'electron'
```

Replace it with:

```typescript
import { app, BrowserWindow, Menu, shell, net, protocol } from 'electron'
```

Add the import for `isPathAllowed`. Find this line:

```typescript
import { pushSessionsChanged, pushFilesChanged, setAllowedDirs } from './ipc'
```

Replace it with:

```typescript
import { pushSessionsChanged, pushFilesChanged, setAllowedDirs, isPathAllowed } from './ipc'
```

Now add the protocol registration. In `src/main/index.ts`, find this line:

```typescript
app.whenReady().then(() => {
```

Add the following **immediately before** that line:

```typescript
// Register canvas:// as a privileged scheme before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'canvas',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
    },
  },
])
```

Then, inside the `app.whenReady().then(() => {` block, add the protocol handler. Find this line inside the block:

```typescript
  const mainWindow = createWindow()
```

Add the following **immediately before** that line:

```typescript
  // Register canvas:// protocol handler for secure image serving
  protocol.handle('canvas', (request) => {
    // canvas:// URLs map to local file paths
    // e.g. canvas:///Users/chris/project/logo.png -> /Users/chris/project/logo.png
    const url = new URL(request.url)
    const filePath = decodeURIComponent(url.pathname)

    if (!isPathAllowed(filePath)) {
      console.error('[protocol] Blocked canvas:// access to disallowed path:', filePath)
      return new Response('Forbidden', { status: 403 })
    }

    // Use net.fetch with file:// to read the local file
    return net.fetch(`file://${filePath}`)
  })

```

**Step 5: Update ImageRenderer.tsx to use canvas:// protocol**

Replace the **entire contents** of `src/renderer/src/components/ImageRenderer.tsx` with:

```typescript
import { useState } from 'react'

type ImageRendererProps = {
  filePath: string
}

function ImageRenderer({ filePath }: ImageRendererProps): React.ReactElement {
  const [error, setError] = useState(false)
  const fileName = filePath.split('/').pop() || 'image'
  const canvasSrc = `canvas://${filePath}`

  if (error) {
    return (
      <div
        data-testid="image-renderer"
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '12px',
        }}
      >
        <div style={{ color: '#8B8B90', fontSize: '11px', textAlign: 'center' }}>
          Failed to load image: {fileName}
        </div>
      </div>
    )
  }

  return (
    <div
      data-testid="image-renderer"
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '12px',
      }}
    >
      <img
        src={canvasSrc}
        alt={fileName}
        onError={() => setError(true)}
        style={{
          maxWidth: '100%',
          maxHeight: '80vh',
          objectFit: 'contain',
          borderRadius: '4px',
        }}
      />
    </div>
  )
}

export default ImageRenderer
```

**Step 6: Run all tests**

```bash
cd /Users/chrispark/Projects/amplifier-canvas
npm run build && npx playwright test
```

**Expected:** All tests pass including V5. The canvas:// protocol serves the 1x1 PNG from the fixture directory. The img tag renders with a canvas:// src.

**Step 7: Commit**

```bash
git add src/main/index.ts src/main/ipc.ts src/renderer/src/components/ImageRenderer.tsx e2e/viewer.spec.ts
git commit -m "feat: register canvas:// protocol for secure image serving, wire up ImageRenderer"
```

---

### Task 9: Integration Tests

**Files:**
- Modify: `e2e/viewer.spec.ts`

**Step 1: Write the integration tests**

Append to `e2e/viewer.spec.ts`:

```typescript
// --- I1: Recent Files Quick Access ---

test('I1: clicking a recent file link opens it directly', async ({ appWindow }) => {
  await appWindow.waitForTimeout(2000)

  // Expand Team Pulse and click first session (tp-session-001 has recentFiles)
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

  // Find and click the session that has recent files
  const sessionCount = await sessions.count()
  for (let i = 0; i < sessionCount; i++) {
    const sessionName = await sessions.nth(i).locator('[data-testid="session-name"]').textContent()
    if (sessionName?.includes('tp-session-001')) {
      await sessions.nth(i).click()
      break
    }
  }

  // Recent files bar should appear
  const recentFilesBar = appWindow.locator('[data-testid="recent-files-bar"]')
  await expect(recentFilesBar).toBeVisible({ timeout: 3000 })

  // Should have recent file links
  const recentLinks = appWindow.locator('[data-testid="recent-file-link"]')
  await expect(recentLinks.first()).toBeVisible({ timeout: 3000 })

  // Click a recent file link
  await recentLinks.first().click()

  // File renderer should appear (skipping file browser navigation)
  const fileRenderer = appWindow.locator('[data-testid="file-renderer"]')
  await expect(fileRenderer).toBeVisible({ timeout: 5000 })
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
})
```

**Step 2: Run all tests**

```bash
cd /Users/chrispark/Projects/amplifier-canvas
npm run build && npx playwright test
```

**Expected:** All tests pass. The I1 test verifies that clicking a recent file link in the Viewer header opens the FileRenderer directly. The I2 test verifies the terminal keeps its output when the Viewer opens.

**Step 3: Commit**

```bash
git add e2e/viewer.spec.ts
git commit -m "test: add integration tests for recent files quick access and terminal persistence"
```

---

## Summary

At the end of Phase 1D, the project has:

| Component | What it does |
|-----------|-------------|
| `SessionState.workDir` | New optional field linking sessions to project directories |
| `extractWorkDir()` | Parser function to extract `cwd` from `session:start` events |
| Sidebar click + dots | Session selection with visual status indicators |
| `Viewer.tsx` | 350px right panel with session header, recent files bar, content area |
| `FileBrowser.tsx` | Directory listing with navigation, breadcrumbs, sorted entries |
| `FileRenderer.tsx` | Extension-based dispatch to markdown/code/image/text renderers |
| `MarkdownRenderer.tsx` | react-markdown + DOMPurify with styled typography |
| `CodeRenderer.tsx` | highlight.js syntax highlighting with line numbers |
| `ImageRenderer.tsx` | Images via `canvas://` custom protocol |
| `canvas://` protocol | Secure file serving with `isPathAllowed()` validation |
| Fixture workdirs | Browsable test files: README.md, src/app.ts, src/styles.css, assets/logo.png |

**Test count:** 41 existing + ~16 new = ~57 total tests.

**Pre-commit gate:** `npm run build && npx playwright test` must pass after every task.
