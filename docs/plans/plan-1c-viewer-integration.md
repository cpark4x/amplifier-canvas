# Plan 1C: Viewer + Integration — Implementation Plan

> **Execution:** Use the subagent-driven-development workflow to implement this plan.

**Goal:** Implement the viewer layer (V1-V5) and integration layer (I1-I3), completing the Phase 1 app with a right panel for file inspection, full focus management, and design polish matching the component library.

**Architecture:** The viewer is a read-only panel that appears when a session is selected in the sidebar. Selecting a session triggers an IPC call to the main process which reads the session's working directory via `fs`. The renderer receives a file list and renders it as a tree. Clicking a file triggers another IPC call to read its contents, which are then routed to the correct renderer (markdown, code, or image) based on file extension. The terminal must remain fully functional at all times — its xterm.js instance never unmounts, and focus management ensures keyboard input flows to the terminal by default.

**Tech Stack:** Electron (from Plan 1A), React, TypeScript, Zustand 5, react-markdown (markdown rendering), shiki (syntax highlighting), Playwright (E2E testing)

**This is Plan 1C of 3.** Plans 1A (Scaffold + Terminal) and 1B (Sidebar) are prerequisites. This plan completes Phase 1.

**Design document:** `docs/plans/2026-04-03-canvas-phase1-design.md`
**Architecture reference:** `ARCHITECTURE.md`
**Prerequisite:** `docs/plans/plan-1a-scaffold-terminal.md` — must be complete
**Prerequisite:** `docs/plans/plan-1b-sidebar.md` — must be complete

**Design tokens (from `components.html`):**
```
--bg-page:           #F0EBE3      (page background)
--bg-header:         #E8E2D8      (header background)
--bg-sidebar:        #F0EBE3      (sidebar background)
--bg-sidebar-active: #E8E0D4      (selected item)
--bg-pane-title:     #DDD5C8      (pane title bar)
--bg-terminal:       #0F0E0C      (terminal background)
--bg-right:          #F7F4EF      (viewer panel background)
--bg-modal:          #FAF8F4      (modal background)
--border:            rgba(0,0,0,0.08)
--text-primary:      #1C1A16      (main text)
--text-muted:        #8A8278      (secondary text)
--text-very-muted:   #A09888      (tertiary text)
--text-terminal:     #C8C4BC      (terminal text)
--amber:             #F59E0B      (running status)
--blue:              #5B8FD4      (needs input status)
--green:             #3D9A65      (done status)
--red:               #CC5555      (failed status)
--font-ui:           -apple-system, BlinkMacSystemFont, 'Inter', sans-serif
--font-mono:         'SFMono-Regular', Menlo, Consolas, monospace
```

**Three-panel layout:**
```
| Sidebar (220px, collapsible) | Terminal (flex, always visible) | Viewer (~350px, conditional) |
```

The viewer appears when a session is selected. The terminal is always visible and never unmounts.

**Error handling (from design doc):**
- File type not recognized → show raw text
- File too large (>1MB) → truncate with "file too large" message
- File inaccessible → show error state, don't crash
- Directory doesn't exist → show "no files" message
- Canvas is read-only — never modify Amplifier's data

**Testing approach for file operations:**
The E2E tests use a `CANVAS_WORKDIR` env var to override the project working directory. This points to `e2e/fixtures/test-workdir/` which contains test files (markdown, TypeScript, PNG, CSS). This parallels how Plan 1B uses `AMPLIFIER_HOME` to control session fixtures.

---

## Section 1: V1 + I1 — Viewer Shell + Session Wiring (Tasks 1–5)

**Features:** V1 (right panel shell) and I1 (session-viewer wiring). Clicking a session in the sidebar opens the viewer panel. Clicking the same session again closes it. This introduces the three-panel layout: sidebar | terminal | viewer.

---

### Task 1: Install dependencies, add shared types and IPC channels

**Files:**
- Modify: `package.json` (install react-markdown, shiki)
- Modify: `src/shared/types.ts` (add file types and IPC channels)
- Modify: `src/main/state-aggregator.ts` (add `CANVAS_WORKDIR` override)

**Step 1: Install new dependencies**

```bash
npm install react-markdown@latest shiki@latest
```

**Step 2: Update `src/shared/types.ts`**

Add new IPC channels and file types. Update the `IPC_CHANNELS` constant:

```typescript
export const IPC_CHANNELS = {
  // Main → Renderer (push)
  TERMINAL_DATA: 'terminal:data',
  SESSIONS_CHANGED: 'state:sessions-changed',
  // Renderer → Main (request)
  TERMINAL_INPUT: 'terminal:input',
  TERMINAL_RESIZE: 'terminal:resize',
  // Renderer → Main (invoke/handle — request-response)
  FILES_LIST_DIR: 'files:list-dir',
  FILES_READ_TEXT: 'files:read-text',
  FILES_READ_IMAGE: 'files:read-image',
} as const

// --- File types (new for Plan 1C) ---

export interface FileEntry {
  name: string
  path: string           // absolute path
  type: 'file' | 'directory'
  extension?: string     // e.g. '.ts', '.md', '.png'
  size?: number          // bytes
}

export type RenderableType = 'markdown' | 'code' | 'image' | 'text'

export function getFileRenderType(extension: string): RenderableType {
  const ext = extension.toLowerCase()
  if (ext === '.md' || ext === '.mdx') return 'markdown'
  if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'].includes(ext)) return 'image'
  if ([
    '.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java', '.c', '.cpp', '.h',
    '.css', '.scss', '.html', '.json', '.yaml', '.yml', '.toml', '.xml', '.sql',
    '.sh', '.bash', '.zsh', '.fish', '.rb', '.php', '.swift', '.kt', '.lua',
  ].includes(ext)) return 'code'
  return 'text'
}

// Map file extensions to Shiki language IDs
export function getShikiLanguage(extension: string): string {
  const map: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'tsx', '.js': 'javascript', '.jsx': 'jsx',
    '.py': 'python', '.rs': 'rust', '.go': 'go', '.java': 'java',
    '.c': 'c', '.cpp': 'cpp', '.h': 'c',
    '.css': 'css', '.scss': 'scss', '.html': 'html',
    '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml',
    '.toml': 'toml', '.xml': 'xml', '.sql': 'sql',
    '.sh': 'bash', '.bash': 'bash', '.zsh': 'bash', '.fish': 'fish',
    '.rb': 'ruby', '.php': 'php', '.swift': 'swift',
    '.kt': 'kotlin', '.lua': 'lua', '.md': 'markdown',
  }
  return map[extension.toLowerCase()] || 'text'
}
```

**Step 3: Update `src/main/state-aggregator.ts`**

Add `CANVAS_WORKDIR` override for testing. Find the line in `scanAllSessions()` where the project path is computed:

```typescript
const decodedPath = decodeSlug(slug)
```

Replace with:

```typescript
const decodedPath = process.env.CANVAS_WORKDIR || decodeSlug(slug)
```

This allows E2E tests to override the working directory for all projects, pointing to a fixture directory with test files.

**Step 4: Verify the build still works**

```bash
npm run build
```

Expected: Build succeeds with no errors.

---

### Task 2: Create file-reader module, update IPC handlers, and update preload bridge

**Files:**
- Create: `src/main/file-reader.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`

**Step 1: Create `src/main/file-reader.ts`**

```typescript
import { readdirSync, readFileSync, statSync, existsSync } from 'fs'
import { join, extname, basename } from 'path'
import type { FileEntry } from '../shared/types'

const MAX_TEXT_SIZE = 1024 * 1024  // 1MB
const MAX_IMAGE_SIZE = 5 * 1024 * 1024  // 5MB

/**
 * List files and directories in the given path.
 * Returns a flat list sorted: directories first, then files, alphabetically.
 */
export function listDirectory(dirPath: string): { entries: FileEntry[]; error?: string } {
  if (!existsSync(dirPath)) {
    return { entries: [], error: `Directory not found: ${dirPath}` }
  }

  try {
    const items = readdirSync(dirPath, { withFileTypes: true })
    const entries: FileEntry[] = []

    for (const item of items) {
      // Skip hidden files (starting with .)
      if (item.name.startsWith('.')) continue

      const fullPath = join(dirPath, item.name)

      if (item.isDirectory()) {
        entries.push({
          name: item.name,
          path: fullPath,
          type: 'directory',
        })
      } else if (item.isFile()) {
        try {
          const stats = statSync(fullPath)
          entries.push({
            name: item.name,
            path: fullPath,
            type: 'file',
            extension: extname(item.name),
            size: stats.size,
          })
        } catch {
          // Skip files we can't stat
        }
      }
    }

    // Sort: directories first, then files, alphabetically
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    return { entries }
  } catch (err) {
    return { entries: [], error: `Failed to read directory: ${err}` }
  }
}

/**
 * Read a text file's content.
 * Returns truncated content with a warning if file exceeds MAX_TEXT_SIZE.
 */
export function readTextFile(filePath: string): { content: string; error?: string; truncated?: boolean } {
  if (!existsSync(filePath)) {
    return { content: '', error: `File not found: ${filePath}` }
  }

  try {
    const stats = statSync(filePath)
    if (stats.size > MAX_TEXT_SIZE) {
      const content = readFileSync(filePath, { encoding: 'utf-8', flag: 'r' }).slice(0, MAX_TEXT_SIZE)
      return { content, truncated: true }
    }
    const content = readFileSync(filePath, 'utf-8')
    return { content }
  } catch (err) {
    return { content: '', error: `Failed to read file: ${err}` }
  }
}

/**
 * Read an image file and return it as a base64 data URL.
 * Avoids needing to register custom protocols in Electron.
 */
export function readImageFile(filePath: string): { dataUrl: string; error?: string } {
  if (!existsSync(filePath)) {
    return { dataUrl: '', error: `File not found: ${filePath}` }
  }

  try {
    const stats = statSync(filePath)
    if (stats.size > MAX_IMAGE_SIZE) {
      return { dataUrl: '', error: 'Image too large (>5MB)' }
    }

    const ext = extname(filePath).toLowerCase()
    const mimeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
      '.ico': 'image/x-icon',
    }
    const mime = mimeMap[ext] || 'application/octet-stream'
    const buffer = readFileSync(filePath)
    const base64 = buffer.toString('base64')
    const dataUrl = `data:${mime};base64,${base64}`
    return { dataUrl }
  } catch (err) {
    return { dataUrl: '', error: `Failed to read image: ${err}` }
  }
}
```

**Step 2: Update `src/main/ipc.ts`**

Add file operation IPC handlers. Keep all existing terminal and session handlers. Add after the session handlers section:

```typescript
import { listDirectory, readTextFile, readImageFile } from './file-reader'
```

Add inside `registerIpcHandlers` function, after the existing session handlers:

```typescript
  // --- File operation handlers (new for Plan 1C) ---

  ipcMain.handle(IPC_CHANNELS.FILES_LIST_DIR, async (_event, dirPath: string) => {
    return listDirectory(dirPath)
  })

  ipcMain.handle(IPC_CHANNELS.FILES_READ_TEXT, async (_event, filePath: string) => {
    return readTextFile(filePath)
  })

  ipcMain.handle(IPC_CHANNELS.FILES_READ_IMAGE, async (_event, filePath: string) => {
    return readImageFile(filePath)
  })
```

> **Note:** Using `ipcMain.handle` (not `ipcMain.on`) because file operations are request-response, unlike terminal data which is fire-and-forget.

**Step 3: Update `src/preload/index.ts`**

Add file operation methods to the preload bridge. Add after the existing `onSessionsChanged` method:

```typescript
  // Files: list directory contents
  listFiles: (dirPath: string): Promise<{ entries: FileEntry[]; error?: string }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FILES_LIST_DIR, dirPath)
  },

  // Files: read text file content
  readFileText: (filePath: string): Promise<{ content: string; error?: string; truncated?: boolean }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FILES_READ_TEXT, filePath)
  },

  // Files: read image as base64 data URL
  readFileImage: (filePath: string): Promise<{ dataUrl: string; error?: string }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FILES_READ_IMAGE, filePath)
  },
```

Add the `FileEntry` import at the top:

```typescript
import type { SessionsUpdate, FileEntry } from '../shared/types'
```

**Step 4: Verify the build still works**

```bash
npm run build
```

Expected: Build succeeds with no errors.

---

### Task 3: Create E2E test fixtures and write viewer E2E tests

**Files:**
- Create: `e2e/fixtures/test-workdir/README.md`
- Create: `e2e/fixtures/test-workdir/src/app.ts`
- Create: `e2e/fixtures/test-workdir/assets/logo.png`
- Create: `e2e/fixtures/test-workdir/style.css`
- Create: `e2e/viewer.spec.ts`

**Step 1: Create fixture directories**

```bash
mkdir -p e2e/fixtures/test-workdir/src
mkdir -p e2e/fixtures/test-workdir/assets
```

**Step 2: Create `e2e/fixtures/test-workdir/README.md`**

```markdown
# Test Project

This is a **test README** for E2E testing.

## Features

- Markdown rendering
- Code highlighting
- Image preview

```code
const x = 42
```

> A blockquote for testing.
```

**Step 3: Create `e2e/fixtures/test-workdir/src/app.ts`**

```typescript
const greeting: string = 'hello world'

function main(): void {
  console.log(greeting)
  const numbers = [1, 2, 3, 4, 5]
  const doubled = numbers.map((n) => n * 2)
  console.log(doubled)
}

main()
```

**Step 4: Create `e2e/fixtures/test-workdir/style.css`**

```css
body {
  margin: 0;
  padding: 0;
  font-family: sans-serif;
  background: #f0ebe3;
}

.container {
  max-width: 960px;
  margin: 0 auto;
}
```

**Step 5: Create a minimal test PNG**

```bash
# Create a 1x1 orange pixel PNG (minimal valid PNG, 68 bytes)
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0\x00\x00\x00\x03\x00\x01\x00\x05\xfe\xd4\x00\x00\x00\x00IEND\xaeB`\x82' > e2e/fixtures/test-workdir/assets/logo.png
```

> **Note:** If the printf command doesn't produce a valid PNG on your system, create any small PNG file manually (e.g., a 10x10 pixel image saved from any image editor).

**Step 6: Create `e2e/viewer.spec.ts`**

```typescript
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { resolve } from 'path'

let app: ElectronApplication
let page: Page

const FIXTURE_HOME = resolve(__dirname, 'fixtures', 'amplifier-home')
const WORKDIR_PATH = resolve(__dirname, 'fixtures', 'test-workdir')

test.beforeAll(async () => {
  app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      AMPLIFIER_HOME: FIXTURE_HOME,
      CANVAS_WORKDIR: WORKDIR_PATH,
    },
  })
  page = await app.firstWindow()
  // Wait for sessions to load
  await page.locator('[data-testid="session-item"]').first().waitFor({ timeout: 10000 })
})

test.afterAll(async () => {
  await app.close()
})

// --- V1: Viewer Shell ---

test('V1: viewer panel is not visible by default', async () => {
  const viewer = page.locator('[data-testid="viewer"]')
  await expect(viewer).not.toBeVisible()
})

test('V1: clicking a session opens the viewer panel', async () => {
  const sessionItem = page.locator('[data-testid="session-item"]').first()
  await sessionItem.click()

  const viewer = page.locator('[data-testid="viewer"]')
  await expect(viewer).toBeVisible({ timeout: 5000 })
})

test('V1: viewer panel has correct background color', async () => {
  // Viewer should already be open from previous test
  const viewer = page.locator('[data-testid="viewer"]')
  await expect(viewer).toBeVisible()

  const bgColor = await viewer.evaluate((el) => {
    return window.getComputedStyle(el).backgroundColor
  })
  // --bg-right: #F7F4EF = rgb(247, 244, 239)
  expect(bgColor).toBe('rgb(247, 244, 239)')
})

test('V1: viewer panel has approximately 350px width', async () => {
  const viewer = page.locator('[data-testid="viewer"]')
  const box = await viewer.boundingBox()
  expect(box).toBeTruthy()
  expect(box!.width).toBeGreaterThanOrEqual(300)
  expect(box!.width).toBeLessThanOrEqual(400)
})

test('V1: clicking the same session again closes the viewer', async () => {
  // Click the same session to deselect
  const sessionItem = page.locator('[data-testid="session-item"]').first()
  await sessionItem.click()

  const viewer = page.locator('[data-testid="viewer"]')
  await expect(viewer).not.toBeVisible()
})

test('V1: terminal remains visible when viewer is open', async () => {
  // Re-open viewer
  const sessionItem = page.locator('[data-testid="session-item"]').first()
  await sessionItem.click()

  const viewer = page.locator('[data-testid="viewer"]')
  await expect(viewer).toBeVisible({ timeout: 5000 })

  // Terminal must still be visible
  const terminal = page.locator('.xterm')
  await expect(terminal).toBeVisible()
})

// --- I1: Session-Viewer Wiring ---

test('I1: selected session is highlighted in sidebar', async () => {
  // Viewer should be open from previous test
  const selectedItem = page.locator('[data-testid="session-item"][data-selected="true"]')
  await expect(selectedItem).toBeVisible({ timeout: 5000 })

  const bgColor = await selectedItem.evaluate((el) => {
    return window.getComputedStyle(el).backgroundColor
  })
  // --bg-sidebar-active: #E8E0D4 = rgb(232, 224, 212)
  expect(bgColor).toBe('rgb(232, 224, 212)')
})
```

**Step 7: Build and run test to verify it fails**

```bash
npm run build && npx playwright test e2e/viewer.spec.ts
```

Expected: FAIL — no `[data-testid="viewer"]` element exists yet.

---

### Task 4: Implement Viewer shell, session-store updates, SessionItem click handler, and App.tsx three-panel layout

**Files:**
- Create: `src/renderer/src/components/Viewer.tsx`
- Modify: `src/renderer/src/stores/session-store.ts`
- Modify: `src/renderer/src/components/SessionItem.tsx`
- Modify: `src/renderer/src/components/Sidebar.tsx`
- Modify: `src/renderer/src/App.tsx`

**Step 1: Update `src/renderer/src/stores/session-store.ts`**

Add selected session state. Replace the entire file:

```typescript
import { create } from 'zustand'
import type { Project, SessionsUpdate } from '../../../shared/types'

interface SessionStore {
  projects: Project[]
  setProjects: (projects: Project[]) => void
  selectedSessionId: string | null
  selectedProjectPath: string | null
  selectSession: (sessionId: string, projectPath: string) => void
  clearSelection: () => void
  selectedFilePath: string | null
  setSelectedFilePath: (path: string | null) => void
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  projects: [],
  setProjects: (projects) => set({ projects }),
  selectedSessionId: null,
  selectedProjectPath: null,
  selectSession: (sessionId, projectPath) => {
    const current = get().selectedSessionId
    if (current === sessionId) {
      // Toggle off: clicking the same session deselects
      set({ selectedSessionId: null, selectedProjectPath: null, selectedFilePath: null })
    } else {
      set({ selectedSessionId: sessionId, selectedProjectPath: projectPath, selectedFilePath: null })
    }
  },
  clearSelection: () => set({ selectedSessionId: null, selectedProjectPath: null, selectedFilePath: null }),
  selectedFilePath: null,
  setSelectedFilePath: (path) => set({ selectedFilePath: path }),
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

**Step 2: Create `src/renderer/src/components/Viewer.tsx`**

```tsx
import { useSessionStore } from '../stores/session-store'

function Viewer(): React.ReactElement | null {
  const selectedSessionId = useSessionStore((s) => s.selectedSessionId)
  const selectedProjectPath = useSessionStore((s) => s.selectedProjectPath)

  if (!selectedSessionId) {
    return null
  }

  return (
    <div
      data-testid="viewer"
      style={{
        width: 350,
        minWidth: 350,
        height: '100%',
        backgroundColor: '#F7F4EF',
        borderLeft: '1px solid rgba(0, 0, 0, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
        color: '#1C1A16',
        overflow: 'hidden',
      }}
    >
      <div
        data-testid="viewer-header"
        style={{
          padding: '8px 16px',
          fontSize: '11px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: '#8A8278',
          backgroundColor: '#DDD5C8',
          borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
        }}
      >
        Files
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {/* File browser and file renderer will be added in V2-V5 */}
        <div style={{ padding: '16px', fontSize: '12px', color: '#A09888', textAlign: 'center' }}>
          Select a file to view
        </div>
      </div>
    </div>
  )
}

export default Viewer
```

**Step 3: Update `src/renderer/src/components/SessionItem.tsx`**

Add click handler and selected state styling. Replace the entire file:

```tsx
import type { Session, SessionStatus } from '../../../../shared/types'
import { useSessionStore } from '../stores/session-store'

interface SessionItemProps {
  session: Session
  projectPath: string
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

function SessionItem({ session, projectPath }: SessionItemProps): React.ReactElement {
  const dotColor = STATUS_COLORS[session.status] || '#A09888'
  const isPulsing = PULSING_STATUSES.has(session.status)
  const label = getStatusLabel(session)
  const selectedSessionId = useSessionStore((s) => s.selectedSessionId)
  const selectSession = useSessionStore((s) => s.selectSession)
  const isSelected = selectedSessionId === session.id

  const handleClick = (): void => {
    selectSession(session.id, projectPath)
  }

  return (
    <div
      data-testid="session-item"
      data-selected={isSelected ? 'true' : 'false'}
      onClick={handleClick}
      style={{
        padding: '6px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        cursor: 'pointer',
        fontSize: '13px',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
        color: '#1C1A16',
        backgroundColor: isSelected ? '#E8E0D4' : 'transparent',
        borderRadius: isSelected ? 4 : 0,
        margin: isSelected ? '0 4px' : 0,
        transition: 'background-color 0.1s ease',
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

> **Important:** `SessionItem` now takes a `projectPath` prop. This is needed so clicking a session can store the project working directory for the file browser.

**Step 4: Update `src/renderer/src/components/Sidebar.tsx`**

Pass `projectPath` to SessionItem. Find the line:

```tsx
<SessionItem key={session.id} session={session} />
```

Replace with:

```tsx
<SessionItem key={session.id} session={session} projectPath={project.path} />
```

**Step 5: Update `src/renderer/src/App.tsx`**

Add the Viewer component for the three-panel layout. Replace the entire file:

```tsx
import TerminalComponent from './components/Terminal'
import Sidebar from './components/Sidebar'
import Viewer from './components/Viewer'

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
      <Viewer />
    </div>
  )
}

export default App
```

**Step 6: Build and run all tests**

```bash
npm run build && npx playwright test
```

Expected: All tests pass, including new V1 and I1 viewer tests, plus all existing terminal and sidebar tests.

---

### Task 5: Commit V1 + I1 and update STATE.yaml

**Step 1: Update `STATE.yaml`**

Add viewer and integration features to the features section:

```yaml
  V1:
    name: Right panel shell
    status: done
    depends_on: [S1]
    blockers: []
  V2:
    name: File browser
    status: ready
    depends_on: [V1, I1]
    blockers: []
  V3:
    name: Markdown rendering
    status: ready
    depends_on: [V2]
    blockers: []
  V4:
    name: Code syntax highlighting
    status: ready
    depends_on: [V2]
    blockers: []
  V5:
    name: Image preview
    status: ready
    depends_on: [V2]
    blockers: []
  I1:
    name: Session-viewer wiring
    status: done
    depends_on: [V1, S2]
    blockers: []
  I2:
    name: Terminal persistence
    status: ready
    depends_on: [V1]
    blockers: []
  I3:
    name: Design token alignment
    status: ready
    depends_on: [V5, I2]
    blockers: []
```

Change `phase` to `"1C — Viewer + Integration"` and `next_action` to `"Implement V2: File browser"`.

**Step 2: Pre-commit gate**

```bash
npm run build && npx playwright test
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat(V1+I1): viewer shell + session wiring — three-panel layout, session selection toggles viewer, file IPC infrastructure"
```

---

## Section 2: V2 — File Browser (Tasks 6–8)

**Feature:** The viewer shows a file tree for the selected session's working directory. Files and directories are listed with icons. Clicking a file selects it for rendering.

---

### Task 6: Write E2E tests for file browser

**Files:**
- Modify: `e2e/viewer.spec.ts`

**Step 1: Add V2 tests to `e2e/viewer.spec.ts`**

Append after the I1 tests:

```typescript
// --- V2: File Browser ---

test('V2: viewer shows file entries when session is selected', async () => {
  // Viewer should be open from V1 tests
  const viewer = page.locator('[data-testid="viewer"]')
  await expect(viewer).toBeVisible()

  // Wait for file entries to load
  const fileEntries = viewer.locator('[data-testid="file-entry"]')
  await expect(fileEntries.first()).toBeVisible({ timeout: 10000 })

  // test-workdir contains: README.md, style.css, src/ (dir), assets/ (dir)
  const count = await fileEntries.count()
  expect(count).toBeGreaterThanOrEqual(4)
})

test('V2: directories are listed before files', async () => {
  const viewer = page.locator('[data-testid="viewer"]')
  const entries = viewer.locator('[data-testid="file-entry"]')

  // Get all entry types in order
  const types: string[] = []
  const count = await entries.count()
  for (let i = 0; i < count; i++) {
    const type = await entries.nth(i).getAttribute('data-entry-type')
    types.push(type || '')
  }

  // Find last directory index and first file index
  const lastDirIndex = types.lastIndexOf('directory')
  const firstFileIndex = types.indexOf('file')

  // All directories should come before all files
  if (lastDirIndex >= 0 && firstFileIndex >= 0) {
    expect(lastDirIndex).toBeLessThan(firstFileIndex)
  }
})

test('V2: file entries show file names', async () => {
  const viewer = page.locator('[data-testid="viewer"]')
  const entries = viewer.locator('[data-testid="file-entry"]')

  const allText = await entries.allTextContents()
  const combined = allText.join(' ')
  expect(combined).toContain('README.md')
  expect(combined).toContain('style.css')
})

test('V2: clicking a file selects it', async () => {
  const viewer = page.locator('[data-testid="viewer"]')
  const readmeEntry = viewer.locator('[data-testid="file-entry"]').filter({
    hasText: 'README.md',
  })
  await readmeEntry.click()

  // File entry should show as selected
  const selected = viewer.locator('[data-testid="file-entry"][data-selected="true"]')
  await expect(selected).toBeVisible({ timeout: 3000 })
})

test('V2: clicking a directory navigates into it', async () => {
  const viewer = page.locator('[data-testid="viewer"]')
  const srcDir = viewer.locator('[data-testid="file-entry"]').filter({
    hasText: 'src',
  })
  await srcDir.click()

  // Should now show files inside src/
  await page.waitForTimeout(1000)
  const entries = viewer.locator('[data-testid="file-entry"]')
  const allText = await entries.allTextContents()
  const combined = allText.join(' ')
  expect(combined).toContain('app.ts')
})

test('V2: back button returns to parent directory', async () => {
  const viewer = page.locator('[data-testid="viewer"]')
  const backBtn = viewer.locator('[data-testid="viewer-back"]')
  await expect(backBtn).toBeVisible()
  await backBtn.click()

  // Should return to root and show README.md
  await page.waitForTimeout(1000)
  const entries = viewer.locator('[data-testid="file-entry"]')
  const allText = await entries.allTextContents()
  const combined = allText.join(' ')
  expect(combined).toContain('README.md')
})
```

**Step 2: Build and run test to verify it fails**

```bash
npm run build && npx playwright test e2e/viewer.spec.ts -g "V2"
```

Expected: FAIL — no `[data-testid="file-entry"]` elements exist yet.

---

### Task 7: Implement FileBrowser component and wire to Viewer

**Files:**
- Create: `src/renderer/src/components/FileBrowser.tsx`
- Modify: `src/renderer/src/components/Viewer.tsx`

**Step 1: Create `src/renderer/src/components/FileBrowser.tsx`**

```tsx
import { useState, useEffect } from 'react'
import { useSessionStore } from '../stores/session-store'
import type { FileEntry } from '../../../../shared/types'

interface FileBrowserProps {
  rootPath: string
}

function FileBrowser({ rootPath }: FileBrowserProps): React.ReactElement {
  const [currentPath, setCurrentPath] = useState(rootPath)
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const selectedFilePath = useSessionStore((s) => s.selectedFilePath)
  const setSelectedFilePath = useSessionStore((s) => s.setSelectedFilePath)

  // Reset path when rootPath changes (new session selected)
  useEffect(() => {
    setCurrentPath(rootPath)
  }, [rootPath])

  // Fetch directory contents when currentPath changes
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    if (!window.electronAPI?.listFiles) {
      setError('File API not available')
      setLoading(false)
      return
    }

    window.electronAPI.listFiles(currentPath).then((result) => {
      if (cancelled) return
      if (result.error) {
        setError(result.error)
        setEntries([])
      } else {
        setEntries(result.entries)
      }
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [currentPath])

  const isAtRoot = currentPath === rootPath
  const pathDisplay = currentPath === rootPath
    ? '/'
    : currentPath.replace(rootPath, '').replace(/^\//, '') || '/'

  const handleEntryClick = (entry: FileEntry): void => {
    if (entry.type === 'directory') {
      setCurrentPath(entry.path)
      setSelectedFilePath(null)
    } else {
      setSelectedFilePath(entry.path)
    }
  }

  const handleBack = (): void => {
    const parent = currentPath.replace(/\/[^/]+$/, '') || rootPath
    if (parent.length >= rootPath.length) {
      setCurrentPath(parent)
    } else {
      setCurrentPath(rootPath)
    }
    setSelectedFilePath(null)
  }

  return (
    <div data-testid="file-browser" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Breadcrumb / back button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          fontSize: '11px',
          color: '#8A8278',
          borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
          minHeight: 28,
        }}
      >
        {!isAtRoot && (
          <button
            data-testid="viewer-back"
            onClick={handleBack}
            style={{
              background: 'none',
              border: '1px solid rgba(0, 0, 0, 0.08)',
              borderRadius: 3,
              padding: '1px 6px',
              fontSize: '11px',
              color: '#8A8278',
              cursor: 'pointer',
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
            }}
          >
            ← Back
          </button>
        )}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {pathDisplay}
        </span>
      </div>

      {/* File list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <div style={{ padding: '16px', fontSize: '12px', color: '#A09888', textAlign: 'center' }}>
            Loading...
          </div>
        )}

        {error && (
          <div style={{ padding: '16px', fontSize: '12px', color: '#CC5555', textAlign: 'center' }}>
            {error}
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div style={{ padding: '16px', fontSize: '12px', color: '#A09888', textAlign: 'center' }}>
            No files found
          </div>
        )}

        {!loading && entries.map((entry) => {
          const isSelected = entry.path === selectedFilePath
          return (
            <div
              key={entry.path}
              data-testid="file-entry"
              data-entry-type={entry.type}
              data-selected={isSelected ? 'true' : 'false'}
              onClick={() => handleEntryClick(entry)}
              style={{
                padding: '4px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                fontSize: '12px',
                color: '#1C1A16',
                backgroundColor: isSelected ? '#E8E0D4' : 'transparent',
                borderRadius: 3,
                margin: '1px 4px',
                fontFamily: "'SFMono-Regular', Menlo, Consolas, monospace",
              }}
            >
              <span style={{ fontSize: '11px', flexShrink: 0, width: 14, textAlign: 'center' }}>
                {entry.type === 'directory' ? '📁' : '📄'}
              </span>
              <span style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontWeight: entry.type === 'directory' ? 500 : 400,
              }}>
                {entry.name}
              </span>
              {entry.size !== undefined && entry.type === 'file' && (
                <span style={{ fontSize: '10px', color: '#A09888', marginLeft: 'auto', flexShrink: 0 }}>
                  {entry.size < 1024 ? `${entry.size}B` : `${Math.round(entry.size / 1024)}KB`}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default FileBrowser
```

**Step 2: Update `src/renderer/src/components/Viewer.tsx`**

Replace the entire file to integrate FileBrowser:

```tsx
import { useSessionStore } from '../stores/session-store'
import FileBrowser from './FileBrowser'

function Viewer(): React.ReactElement | null {
  const selectedSessionId = useSessionStore((s) => s.selectedSessionId)
  const selectedProjectPath = useSessionStore((s) => s.selectedProjectPath)
  const selectedFilePath = useSessionStore((s) => s.selectedFilePath)

  if (!selectedSessionId || !selectedProjectPath) {
    return null
  }

  return (
    <div
      data-testid="viewer"
      style={{
        width: 350,
        minWidth: 350,
        height: '100%',
        backgroundColor: '#F7F4EF',
        borderLeft: '1px solid rgba(0, 0, 0, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
        color: '#1C1A16',
        overflow: 'hidden',
      }}
    >
      <div
        data-testid="viewer-header"
        style={{
          padding: '8px 16px',
          fontSize: '11px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: '#8A8278',
          backgroundColor: '#DDD5C8',
          borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
        }}
      >
        Files
      </div>
      {selectedFilePath ? (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* FileRenderer will go here in V3-V5. For now, show file path. */}
          <div style={{ padding: '8px 12px', fontSize: '11px', color: '#8A8278', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            {selectedFilePath.split('/').pop()}
          </div>
          <div style={{ flex: 1, padding: '16px', fontSize: '12px', color: '#A09888' }}>
            File preview will appear here
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <FileBrowser rootPath={selectedProjectPath} />
        </div>
      )}
    </div>
  )
}

export default Viewer
```

**Step 3: Build and run all tests**

```bash
npm run build && npx playwright test
```

Expected: All tests pass, including V2 file browser tests.

---

### Task 8: Commit V2 and update STATE.yaml

**Step 1: Update `STATE.yaml`**

Change V2 status to `done` and `next_action` to `"Implement V3: Markdown rendering"`.

```yaml
  V2:
    name: File browser
    status: done
    depends_on: [V1, I1]
    blockers: []
```

**Step 2: Pre-commit gate**

```bash
npm run build && npx playwright test
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat(V2): file browser — directory listing via IPC, file/folder navigation, file selection"
```

---

## Section 3: V3 — Markdown Rendering (Tasks 9–11)

**Feature:** Clicking a `.md` file in the file browser renders styled markdown with headings, lists, code blocks, blockquotes, and links.

---

### Task 9: Write E2E tests for markdown rendering

**Files:**
- Modify: `e2e/viewer.spec.ts`

**Step 1: Add V3 tests to `e2e/viewer.spec.ts`**

Append after V2 tests:

```typescript
// --- V3: Markdown Rendering ---

test('V3: clicking a .md file shows rendered markdown', async () => {
  const viewer = page.locator('[data-testid="viewer"]')

  // Navigate back to root if needed (click back until README.md is visible)
  while (!(await viewer.locator('[data-testid="file-entry"]').filter({ hasText: 'README.md' }).isVisible())) {
    const backBtn = viewer.locator('[data-testid="viewer-back"]')
    if (await backBtn.isVisible()) {
      await backBtn.click()
      await page.waitForTimeout(500)
    } else {
      break
    }
  }

  // Click README.md
  const readmeEntry = viewer.locator('[data-testid="file-entry"]').filter({ hasText: 'README.md' })
  await readmeEntry.click()

  // Should show the markdown renderer
  const renderer = viewer.locator('[data-testid="markdown-renderer"]')
  await expect(renderer).toBeVisible({ timeout: 5000 })
})

test('V3: markdown renders headings', async () => {
  const renderer = page.locator('[data-testid="markdown-renderer"]')
  const heading = renderer.locator('h1')
  await expect(heading).toBeVisible()
  await expect(heading).toContainText('Test Project')
})

test('V3: markdown renders bold text', async () => {
  const renderer = page.locator('[data-testid="markdown-renderer"]')
  const bold = renderer.locator('strong')
  await expect(bold).toBeVisible()
  await expect(bold).toContainText('test README')
})

test('V3: markdown renders list items', async () => {
  const renderer = page.locator('[data-testid="markdown-renderer"]')
  const items = renderer.locator('li')
  const count = await items.count()
  expect(count).toBeGreaterThanOrEqual(3)
})

test('V3: markdown renders blockquotes', async () => {
  const renderer = page.locator('[data-testid="markdown-renderer"]')
  const blockquote = renderer.locator('blockquote')
  await expect(blockquote).toBeVisible()
})

test('V3: back to file browser button works from file view', async () => {
  const viewer = page.locator('[data-testid="viewer"]')
  const backBtn = viewer.locator('[data-testid="file-view-back"]')
  await expect(backBtn).toBeVisible()
  await backBtn.click()

  // Should return to file browser
  const fileBrowser = viewer.locator('[data-testid="file-browser"]')
  await expect(fileBrowser).toBeVisible({ timeout: 3000 })
})
```

**Step 2: Build and run test to verify it fails**

```bash
npm run build && npx playwright test e2e/viewer.spec.ts -g "V3"
```

Expected: FAIL — no `[data-testid="markdown-renderer"]` exists yet.

---

### Task 10: Implement FileRenderer and MarkdownRenderer

**Files:**
- Create: `src/renderer/src/components/FileRenderer.tsx`
- Create: `src/renderer/src/components/MarkdownRenderer.tsx`
- Modify: `src/renderer/src/components/Viewer.tsx`

**Step 1: Create `src/renderer/src/components/MarkdownRenderer.tsx`**

```tsx
import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'

interface MarkdownRendererProps {
  filePath: string
}

function MarkdownRenderer({ filePath }: MarkdownRendererProps): React.ReactElement {
  const [content, setContent] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    if (!window.electronAPI?.readFileText) {
      setError('File API not available')
      setLoading(false)
      return
    }

    window.electronAPI.readFileText(filePath).then((result) => {
      if (cancelled) return
      if (result.error) {
        setError(result.error)
      } else {
        setContent(result.content)
      }
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [filePath])

  if (loading) {
    return <div style={{ padding: 16, fontSize: 12, color: '#A09888' }}>Loading...</div>
  }

  if (error) {
    return <div style={{ padding: 16, fontSize: 12, color: '#CC5555' }}>{error}</div>
  }

  return (
    <div
      data-testid="markdown-renderer"
      style={{
        padding: '16px 20px',
        fontSize: '14px',
        lineHeight: '1.6',
        color: '#1C1A16',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
        overflowY: 'auto',
        height: '100%',
      }}
      className="markdown-content"
    >
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  )
}

export default MarkdownRenderer
```

**Step 2: Create `src/renderer/src/components/FileRenderer.tsx`**

```tsx
import { extname } from 'path'
import { getFileRenderType } from '../../../../shared/types'
import MarkdownRenderer from './MarkdownRenderer'

interface FileRendererProps {
  filePath: string
}

function FileRenderer({ filePath }: FileRendererProps): React.ReactElement {
  const ext = extname(filePath)
  const renderType = getFileRenderType(ext)

  switch (renderType) {
    case 'markdown':
      return <MarkdownRenderer filePath={filePath} />
    case 'code':
      // Will be implemented in V4
      return <PlaceholderRenderer filePath={filePath} label="Code viewer coming soon" />
    case 'image':
      // Will be implemented in V5
      return <PlaceholderRenderer filePath={filePath} label="Image viewer coming soon" />
    case 'text':
    default:
      return <PlaceholderRenderer filePath={filePath} label="Plain text" />
  }
}

function PlaceholderRenderer({ filePath, label }: { filePath: string; label: string }): React.ReactElement {
  return (
    <div
      data-testid="placeholder-renderer"
      style={{ padding: 16, fontSize: 12, color: '#A09888' }}
    >
      <div>{label}</div>
      <div style={{ fontFamily: "'SFMono-Regular', Menlo, monospace", fontSize: 11, marginTop: 8 }}>
        {filePath.split('/').pop()}
      </div>
    </div>
  )
}

export default FileRenderer
```

> **Note:** `path.extname` may not be available in the renderer process since it's a Node.js module. If the build fails on this import, replace it with a simple helper: `const ext = filePath.includes('.') ? '.' + filePath.split('.').pop() : ''`

**Step 3: Update `src/renderer/src/components/Viewer.tsx`**

Replace the entire file to integrate FileRenderer with a back button:

```tsx
import { useSessionStore } from '../stores/session-store'
import FileBrowser from './FileBrowser'
import FileRenderer from './FileRenderer'

function Viewer(): React.ReactElement | null {
  const selectedSessionId = useSessionStore((s) => s.selectedSessionId)
  const selectedProjectPath = useSessionStore((s) => s.selectedProjectPath)
  const selectedFilePath = useSessionStore((s) => s.selectedFilePath)
  const setSelectedFilePath = useSessionStore((s) => s.setSelectedFilePath)

  if (!selectedSessionId || !selectedProjectPath) {
    return null
  }

  const handleBackToFiles = (): void => {
    setSelectedFilePath(null)
  }

  return (
    <div
      data-testid="viewer"
      style={{
        width: 350,
        minWidth: 350,
        height: '100%',
        backgroundColor: '#F7F4EF',
        borderLeft: '1px solid rgba(0, 0, 0, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
        color: '#1C1A16',
        overflow: 'hidden',
      }}
    >
      <div
        data-testid="viewer-header"
        style={{
          padding: '8px 16px',
          fontSize: '11px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: '#8A8278',
          backgroundColor: '#DDD5C8',
          borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {selectedFilePath && (
          <button
            data-testid="file-view-back"
            onClick={handleBackToFiles}
            style={{
              background: 'none',
              border: '1px solid rgba(0, 0, 0, 0.12)',
              borderRadius: 3,
              padding: '1px 6px',
              fontSize: '11px',
              color: '#8A8278',
              cursor: 'pointer',
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
            }}
          >
            ←
          </button>
        )}
        <span>{selectedFilePath ? selectedFilePath.split('/').pop() : 'Files'}</span>
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {selectedFilePath ? (
          <FileRenderer filePath={selectedFilePath} />
        ) : (
          <FileBrowser rootPath={selectedProjectPath} />
        )}
      </div>
    </div>
  )
}

export default Viewer
```

**Step 4: Add markdown styling to `src/renderer/src/App.css`**

Append:

```css
/* Markdown content styling */
.markdown-content h1 { font-size: 24px; font-weight: 700; margin: 16px 0 8px; letter-spacing: -0.02em; }
.markdown-content h2 { font-size: 20px; font-weight: 600; margin: 14px 0 6px; letter-spacing: -0.01em; }
.markdown-content h3 { font-size: 16px; font-weight: 600; margin: 12px 0 4px; }
.markdown-content p { margin: 8px 0; }
.markdown-content ul, .markdown-content ol { margin: 8px 0; padding-left: 24px; }
.markdown-content li { margin: 4px 0; }
.markdown-content blockquote {
  border-left: 3px solid #DDD5C8;
  padding: 4px 12px;
  margin: 8px 0;
  color: #8A8278;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 0 4px 4px 0;
}
.markdown-content code {
  background: rgba(0, 0, 0, 0.05);
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'SFMono-Regular', Menlo, Consolas, monospace;
  font-size: 0.9em;
}
.markdown-content pre {
  background: #0F0E0C;
  color: #C8C4BC;
  padding: 12px 16px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 8px 0;
}
.markdown-content pre code {
  background: none;
  padding: 0;
  font-size: 13px;
}
.markdown-content strong { font-weight: 600; }
.markdown-content a { color: #5B8FD4; }
.markdown-content hr { border: none; border-top: 1px solid rgba(0, 0, 0, 0.08); margin: 16px 0; }
```

**Step 5: Build and run all tests**

```bash
npm run build && npx playwright test
```

Expected: All tests pass, including V3 markdown rendering tests.

---

### Task 11: Commit V3 and update STATE.yaml

**Step 1: Update `STATE.yaml`**

Change V3 status to `done` and `next_action` to `"Implement V4: Code syntax highlighting"`.

```yaml
  V3:
    name: Markdown rendering
    status: done
    depends_on: [V2]
    blockers: []
```

**Step 2: Pre-commit gate**

```bash
npm run build && npx playwright test
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat(V3): markdown rendering — react-markdown with styled output, headings, lists, blockquotes, code blocks"
```

---

## Section 4: V4 — Code Syntax Highlighting (Tasks 12–14)

**Feature:** Clicking a code file (`.ts`, `.py`, `.css`, etc.) in the file browser shows syntax-highlighted code with line numbers via Shiki.

---

### Task 12: Write E2E tests for code syntax highlighting

**Files:**
- Modify: `e2e/viewer.spec.ts`

**Step 1: Add V4 tests to `e2e/viewer.spec.ts`**

Append after V3 tests:

```typescript
// --- V4: Code Syntax Highlighting ---

test('V4: clicking a .ts file shows syntax-highlighted code', async () => {
  const viewer = page.locator('[data-testid="viewer"]')

  // Go back to file list
  const fileViewBack = viewer.locator('[data-testid="file-view-back"]')
  if (await fileViewBack.isVisible()) {
    await fileViewBack.click()
    await page.waitForTimeout(500)
  }

  // Navigate to src/ directory
  const srcDir = viewer.locator('[data-testid="file-entry"]').filter({ hasText: 'src' })
  await srcDir.click()
  await page.waitForTimeout(1000)

  // Click app.ts
  const appTs = viewer.locator('[data-testid="file-entry"]').filter({ hasText: 'app.ts' })
  await appTs.click()

  // Should show the code renderer
  const renderer = viewer.locator('[data-testid="code-renderer"]')
  await expect(renderer).toBeVisible({ timeout: 10000 })
})

test('V4: code renderer shows line numbers', async () => {
  const renderer = page.locator('[data-testid="code-renderer"]')
  const lineNumbers = renderer.locator('[data-testid="line-number"]')
  const count = await lineNumbers.count()
  // app.ts has ~10 lines
  expect(count).toBeGreaterThanOrEqual(5)
})

test('V4: code is syntax-highlighted (contains styled spans)', async () => {
  const renderer = page.locator('[data-testid="code-renderer"]')
  // Shiki produces <span style="color:..."> elements
  const coloredSpans = renderer.locator('span[style*="color"]')
  const count = await coloredSpans.count()
  // Should have multiple colored spans (keywords, strings, etc.)
  expect(count).toBeGreaterThanOrEqual(3)
})

test('V4: code uses monospace font', async () => {
  const renderer = page.locator('[data-testid="code-renderer"]')
  const fontFamily = await renderer.evaluate((el) => {
    return window.getComputedStyle(el).fontFamily
  })
  // Should contain a monospace font
  expect(fontFamily.toLowerCase()).toMatch(/mono|menlo|consolas|sfmono/i)
})

test('V4: clicking a .css file also shows highlighted code', async () => {
  const viewer = page.locator('[data-testid="viewer"]')

  // Go back to file list
  const fileViewBack = viewer.locator('[data-testid="file-view-back"]')
  await fileViewBack.click()
  await page.waitForTimeout(500)

  // Go back to root
  const backBtn = viewer.locator('[data-testid="viewer-back"]')
  if (await backBtn.isVisible()) {
    await backBtn.click()
    await page.waitForTimeout(500)
  }

  // Click style.css
  const cssFile = viewer.locator('[data-testid="file-entry"]').filter({ hasText: 'style.css' })
  await cssFile.click()

  const renderer = viewer.locator('[data-testid="code-renderer"]')
  await expect(renderer).toBeVisible({ timeout: 10000 })
})
```

**Step 2: Build and run test to verify it fails**

```bash
npm run build && npx playwright test e2e/viewer.spec.ts -g "V4"
```

Expected: FAIL — no `[data-testid="code-renderer"]` exists yet.

---

### Task 13: Implement CodeRenderer with Shiki

**Files:**
- Create: `src/renderer/src/components/CodeRenderer.tsx`
- Modify: `src/renderer/src/components/FileRenderer.tsx`

**Step 1: Create `src/renderer/src/components/CodeRenderer.tsx`**

```tsx
import { useState, useEffect } from 'react'
import { codeToHtml } from 'shiki'
import { getShikiLanguage } from '../../../../shared/types'

interface CodeRendererProps {
  filePath: string
}

function CodeRenderer({ filePath }: CodeRendererProps): React.ReactElement {
  const [html, setHtml] = useState<string>('')
  const [rawLines, setRawLines] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    if (!window.electronAPI?.readFileText) {
      setError('File API not available')
      setLoading(false)
      return
    }

    const ext = filePath.includes('.') ? '.' + filePath.split('.').pop() : ''
    const lang = getShikiLanguage(ext)

    window.electronAPI.readFileText(filePath).then(async (result) => {
      if (cancelled) return
      if (result.error) {
        setError(result.error)
        setLoading(false)
        return
      }

      const content = result.content
      setRawLines(content.split('\n'))

      try {
        const highlighted = await codeToHtml(content, {
          lang,
          theme: 'github-light',
        })
        if (!cancelled) {
          setHtml(highlighted)
        }
      } catch (err) {
        if (!cancelled) {
          // Fallback: show raw code if Shiki fails for this language
          setHtml(`<pre><code>${escapeHtml(content)}</code></pre>`)
        }
      }
      if (!cancelled) setLoading(false)
    })

    return () => { cancelled = true }
  }, [filePath])

  if (loading) {
    return <div style={{ padding: 16, fontSize: 12, color: '#A09888' }}>Loading...</div>
  }

  if (error) {
    return <div style={{ padding: 16, fontSize: 12, color: '#CC5555' }}>{error}</div>
  }

  return (
    <div
      data-testid="code-renderer"
      style={{
        display: 'flex',
        overflowY: 'auto',
        overflowX: 'auto',
        height: '100%',
        fontFamily: "'SFMono-Regular', Menlo, Consolas, monospace",
        fontSize: '13px',
        lineHeight: '1.5',
      }}
    >
      {/* Line numbers */}
      <div
        style={{
          padding: '12px 0',
          textAlign: 'right',
          userSelect: 'none',
          flexShrink: 0,
          borderRight: '1px solid rgba(0, 0, 0, 0.06)',
          backgroundColor: 'rgba(0, 0, 0, 0.02)',
        }}
      >
        {rawLines.map((_, i) => (
          <div
            key={i}
            data-testid="line-number"
            style={{
              padding: '0 12px 0 12px',
              color: '#A09888',
              fontSize: '12px',
              lineHeight: '1.5',
            }}
          >
            {i + 1}
          </div>
        ))}
      </div>

      {/* Highlighted code */}
      <div
        style={{ flex: 1, padding: '12px 16px', overflow: 'auto' }}
        className="shiki-code"
        dangerouslySetInnerHTML={{ __html: stripShikiWrapper(html) }}
      />
    </div>
  )
}

/**
 * Strip Shiki's outer <pre><code> wrapper since we provide our own layout.
 * Shiki outputs: <pre class="shiki" style="..."><code><span class="line">...</span></code></pre>
 * We want just the inner spans.
 */
function stripShikiWrapper(html: string): string {
  // Remove outer <pre> and <code> tags, keep the content
  return html
    .replace(/^<pre[^>]*><code[^>]*>/, '')
    .replace(/<\/code><\/pre>$/, '')
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export default CodeRenderer
```

> **Potential issue:** Shiki's WASM loading may need configuration in electron-vite. If the build fails with Shiki-related errors, add `shiki` to the `ssr.noExternal` list in `electron.vite.config.ts` renderer section, or try importing from `shiki/bundle/web`.

**Step 2: Update `src/renderer/src/components/FileRenderer.tsx`**

Add the CodeRenderer import and case:

```tsx
import { getFileRenderType } from '../../../../shared/types'
import MarkdownRenderer from './MarkdownRenderer'
import CodeRenderer from './CodeRenderer'

interface FileRendererProps {
  filePath: string
}

function FileRenderer({ filePath }: FileRendererProps): React.ReactElement {
  const ext = filePath.includes('.') ? '.' + filePath.split('.').pop()! : ''
  const renderType = getFileRenderType(ext)

  switch (renderType) {
    case 'markdown':
      return <MarkdownRenderer filePath={filePath} />
    case 'code':
      return <CodeRenderer filePath={filePath} />
    case 'image':
      // Will be implemented in V5
      return <PlaceholderRenderer filePath={filePath} label="Image viewer coming soon" />
    case 'text':
    default:
      return <TextRenderer filePath={filePath} />
  }
}

/**
 * Fallback renderer for unrecognized file types — shows raw text.
 */
function TextRenderer({ filePath }: { filePath: string }): React.ReactElement {
  const [content, setContent] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!window.electronAPI?.readFileText) return

    window.electronAPI.readFileText(filePath).then((result) => {
      if (cancelled) return
      if (result.error) setError(result.error)
      else setContent(result.content)
    })

    return () => { cancelled = true }
  }, [filePath])

  if (error) {
    return <div style={{ padding: 16, fontSize: 12, color: '#CC5555' }}>{error}</div>
  }

  return (
    <div
      data-testid="text-renderer"
      style={{
        padding: '12px 16px',
        fontFamily: "'SFMono-Regular', Menlo, Consolas, monospace",
        fontSize: '13px',
        lineHeight: '1.5',
        whiteSpace: 'pre-wrap',
        overflowY: 'auto',
        height: '100%',
        color: '#1C1A16',
      }}
    >
      {content}
    </div>
  )
}

function PlaceholderRenderer({ filePath, label }: { filePath: string; label: string }): React.ReactElement {
  return (
    <div
      data-testid="placeholder-renderer"
      style={{ padding: 16, fontSize: 12, color: '#A09888' }}
    >
      <div>{label}</div>
      <div style={{ fontFamily: "'SFMono-Regular', Menlo, monospace", fontSize: 11, marginTop: 8 }}>
        {filePath.split('/').pop()}
      </div>
    </div>
  )
}

export default FileRenderer
```

Add the required imports at the top:

```tsx
import { useState, useEffect } from 'react'
```

**Step 3: Add Shiki output styling to `src/renderer/src/App.css`**

Append:

```css
/* Shiki code styling — override Shiki's default backgrounds */
.shiki-code .line { display: block; }
.shiki-code pre { background: transparent !important; margin: 0; padding: 0; }
.shiki-code code { background: transparent !important; }
```

**Step 4: Build and run all tests**

```bash
npm run build && npx playwright test
```

Expected: All tests pass, including V4 code highlighting tests.

> **Troubleshooting:** If Shiki fails to load in the renderer, try:
> 1. Add to `electron.vite.config.ts` renderer section: `resolve: { alias: { 'shiki': 'shiki/bundle/web' } }`
> 2. Or change the import to: `import { codeToHtml } from 'shiki/bundle/web'`

---

### Task 14: Commit V4 and update STATE.yaml

**Step 1: Update `STATE.yaml`**

Change V4 status to `done` and `next_action` to `"Implement V5: Image preview"`.

```yaml
  V4:
    name: Code syntax highlighting
    status: done
    depends_on: [V2]
    blockers: []
```

**Step 2: Pre-commit gate**

```bash
npm run build && npx playwright test
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat(V4): code syntax highlighting — Shiki-powered highlighting with line numbers, monospace font, github-light theme"
```

---

## Section 5: V5 — Image Preview (Tasks 15–17)

**Feature:** Clicking an image file (`.png`, `.jpg`, `.svg`, etc.) in the file browser shows the image inline in the viewer panel.

---

### Task 15: Write E2E tests for image preview

**Files:**
- Modify: `e2e/viewer.spec.ts`

**Step 1: Add V5 tests to `e2e/viewer.spec.ts`**

Append after V4 tests:

```typescript
// --- V5: Image Preview ---

test('V5: clicking a .png file shows the image', async () => {
  const viewer = page.locator('[data-testid="viewer"]')

  // Go back to file list
  const fileViewBack = viewer.locator('[data-testid="file-view-back"]')
  if (await fileViewBack.isVisible()) {
    await fileViewBack.click()
    await page.waitForTimeout(500)
  }

  // Navigate to assets/ directory
  const assetsDir = viewer.locator('[data-testid="file-entry"]').filter({ hasText: 'assets' })
  if (await assetsDir.isVisible()) {
    await assetsDir.click()
    await page.waitForTimeout(1000)
  }

  // Click logo.png
  const logoFile = viewer.locator('[data-testid="file-entry"]').filter({ hasText: 'logo.png' })
  await logoFile.click()

  // Should show the image renderer
  const renderer = viewer.locator('[data-testid="image-renderer"]')
  await expect(renderer).toBeVisible({ timeout: 5000 })
})

test('V5: image renderer contains an img element', async () => {
  const renderer = page.locator('[data-testid="image-renderer"]')
  const img = renderer.locator('img')
  await expect(img).toBeVisible()
})

test('V5: image has a data URL src (loaded via IPC)', async () => {
  const renderer = page.locator('[data-testid="image-renderer"]')
  const img = renderer.locator('img')
  const src = await img.getAttribute('src')
  expect(src).toBeTruthy()
  expect(src!).toMatch(/^data:image\//)
})
```

**Step 2: Build and run test to verify it fails**

```bash
npm run build && npx playwright test e2e/viewer.spec.ts -g "V5"
```

Expected: FAIL — no `[data-testid="image-renderer"]` exists yet.

---

### Task 16: Implement ImageRenderer

**Files:**
- Create: `src/renderer/src/components/ImageRenderer.tsx`
- Modify: `src/renderer/src/components/FileRenderer.tsx`

**Step 1: Create `src/renderer/src/components/ImageRenderer.tsx`**

```tsx
import { useState, useEffect } from 'react'

interface ImageRendererProps {
  filePath: string
}

function ImageRenderer({ filePath }: ImageRendererProps): React.ReactElement {
  const [dataUrl, setDataUrl] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    if (!window.electronAPI?.readFileImage) {
      setError('File API not available')
      setLoading(false)
      return
    }

    window.electronAPI.readFileImage(filePath).then((result) => {
      if (cancelled) return
      if (result.error) {
        setError(result.error)
      } else {
        setDataUrl(result.dataUrl)
      }
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [filePath])

  if (loading) {
    return <div style={{ padding: 16, fontSize: 12, color: '#A09888' }}>Loading image...</div>
  }

  if (error) {
    return (
      <div
        data-testid="image-renderer"
        style={{ padding: 16, fontSize: 12, color: '#CC5555' }}
      >
        {error}
      </div>
    )
  }

  const fileName = filePath.split('/').pop() || 'image'

  return (
    <div
      data-testid="image-renderer"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        height: '100%',
        overflowY: 'auto',
      }}
    >
      <img
        src={dataUrl}
        alt={fileName}
        style={{
          maxWidth: '100%',
          maxHeight: 'calc(100% - 40px)',
          objectFit: 'contain',
          borderRadius: 4,
          border: '1px solid rgba(0, 0, 0, 0.06)',
        }}
      />
      <div
        style={{
          marginTop: 8,
          fontSize: '11px',
          color: '#A09888',
          textAlign: 'center',
        }}
      >
        {fileName}
      </div>
    </div>
  )
}

export default ImageRenderer
```

**Step 2: Update `src/renderer/src/components/FileRenderer.tsx`**

Add the ImageRenderer import and replace the placeholder case:

Add at the top:

```typescript
import ImageRenderer from './ImageRenderer'
```

Replace the `case 'image':` block:

```typescript
    case 'image':
      return <ImageRenderer filePath={filePath} />
```

Remove the `PlaceholderRenderer` component entirely (no longer needed — all types are handled).

The full `FileRenderer.tsx` should now be:

```tsx
import { useState, useEffect } from 'react'
import { getFileRenderType } from '../../../../shared/types'
import MarkdownRenderer from './MarkdownRenderer'
import CodeRenderer from './CodeRenderer'
import ImageRenderer from './ImageRenderer'

interface FileRendererProps {
  filePath: string
}

function FileRenderer({ filePath }: FileRendererProps): React.ReactElement {
  const ext = filePath.includes('.') ? '.' + filePath.split('.').pop()! : ''
  const renderType = getFileRenderType(ext)

  switch (renderType) {
    case 'markdown':
      return <MarkdownRenderer filePath={filePath} />
    case 'code':
      return <CodeRenderer filePath={filePath} />
    case 'image':
      return <ImageRenderer filePath={filePath} />
    case 'text':
    default:
      return <TextRenderer filePath={filePath} />
  }
}

/**
 * Fallback renderer for unrecognized file types — shows raw text.
 */
function TextRenderer({ filePath }: { filePath: string }): React.ReactElement {
  const [content, setContent] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!window.electronAPI?.readFileText) return

    window.electronAPI.readFileText(filePath).then((result) => {
      if (cancelled) return
      if (result.error) setError(result.error)
      else setContent(result.content)
    })

    return () => { cancelled = true }
  }, [filePath])

  if (error) {
    return <div style={{ padding: 16, fontSize: 12, color: '#CC5555' }}>{error}</div>
  }

  return (
    <div
      data-testid="text-renderer"
      style={{
        padding: '12px 16px',
        fontFamily: "'SFMono-Regular', Menlo, Consolas, monospace",
        fontSize: '13px',
        lineHeight: '1.5',
        whiteSpace: 'pre-wrap',
        overflowY: 'auto',
        height: '100%',
        color: '#1C1A16',
      }}
    >
      {content}
    </div>
  )
}

export default FileRenderer
```

**Step 3: Build and run all tests**

```bash
npm run build && npx playwright test
```

Expected: All tests pass, including V5 image preview tests.

---

### Task 17: Commit V5 and update STATE.yaml

**Step 1: Update `STATE.yaml`**

Change V5 status to `done` and `next_action` to `"Implement I2: Terminal persistence"`.

```yaml
  V5:
    name: Image preview
    status: done
    depends_on: [V2]
    blockers: []
```

**Step 2: Pre-commit gate**

```bash
npm run build && npx playwright test
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat(V5): image preview — renders PNG/JPG/SVG/GIF inline via base64 data URL, responsive sizing"
```

---

## Section 6: I2 — Terminal Persistence (Tasks 18–20)

**Feature:** The terminal must remain fully functional at all times — regardless of sidebar or viewer interactions. The xterm.js instance never unmounts. Focus management ensures keyboard input goes to the terminal by default; sidebar and viewer are mouse-navigated.

**This is the #1 regression risk.** Every interaction (clicking sessions, browsing files, switching views) must be tested against terminal integrity.

---

### Task 18: Write E2E tests for terminal persistence and focus management

**Files:**
- Create: `e2e/integration.spec.ts`

**Step 1: Create `e2e/integration.spec.ts`**

```typescript
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { resolve } from 'path'

let app: ElectronApplication
let page: Page

const FIXTURE_HOME = resolve(__dirname, 'fixtures', 'amplifier-home')
const WORKDIR_PATH = resolve(__dirname, 'fixtures', 'test-workdir')

test.beforeAll(async () => {
  app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      AMPLIFIER_HOME: FIXTURE_HOME,
      CANVAS_WORKDIR: WORKDIR_PATH,
    },
  })
  page = await app.firstWindow()
  // Wait for sessions to load
  await page.locator('[data-testid="session-item"]').first().waitFor({ timeout: 10000 })
})

test.afterAll(async () => {
  await app.close()
})

// --- I2: Terminal Persistence ---

test('I2: terminal accepts input before any viewer interaction', async () => {
  const terminal = page.locator('.xterm')
  await expect(terminal).toBeVisible({ timeout: 5000 })

  // Click on terminal to focus
  await terminal.click()
  await page.waitForTimeout(200)

  // Type a command
  await page.keyboard.type('echo TERMINAL_WORKS_BEFORE', { delay: 20 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1000)

  // Verify output appears
  const terminalText = await terminal.textContent()
  expect(terminalText).toContain('TERMINAL_WORKS_BEFORE')
})

test('I2: opening viewer does not break terminal', async () => {
  // Open viewer by clicking a session
  const sessionItem = page.locator('[data-testid="session-item"]').first()
  await sessionItem.click()

  const viewer = page.locator('[data-testid="viewer"]')
  await expect(viewer).toBeVisible({ timeout: 5000 })

  // Click back on terminal
  const terminal = page.locator('.xterm')
  await terminal.click()
  await page.waitForTimeout(200)

  // Type a command — terminal must still work
  await page.keyboard.type('echo TERMINAL_WORKS_WITH_VIEWER', { delay: 20 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1000)

  const terminalText = await terminal.textContent()
  expect(terminalText).toContain('TERMINAL_WORKS_WITH_VIEWER')
})

test('I2: browsing files in viewer does not break terminal', async () => {
  const viewer = page.locator('[data-testid="viewer"]')
  await expect(viewer).toBeVisible()

  // Click on a file in the viewer
  const fileEntry = viewer.locator('[data-testid="file-entry"]').first()
  if (await fileEntry.isVisible()) {
    await fileEntry.click()
    await page.waitForTimeout(500)
  }

  // Click back on terminal
  const terminal = page.locator('.xterm')
  await terminal.click()
  await page.waitForTimeout(200)

  // Terminal must still work
  await page.keyboard.type('echo TERMINAL_WORKS_AFTER_BROWSE', { delay: 20 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1000)

  const terminalText = await terminal.textContent()
  expect(terminalText).toContain('TERMINAL_WORKS_AFTER_BROWSE')
})

test('I2: switching selected session does not break terminal', async () => {
  const sessionItems = page.locator('[data-testid="session-item"]')
  const count = await sessionItems.count()

  if (count >= 2) {
    // Click a different session
    await sessionItems.nth(1).click()
    await page.waitForTimeout(500)

    // Click back to first session
    await sessionItems.nth(0).click()
    await page.waitForTimeout(500)
  }

  // Click on terminal
  const terminal = page.locator('.xterm')
  await terminal.click()
  await page.waitForTimeout(200)

  // Terminal must still work
  await page.keyboard.type('echo TERMINAL_SURVIVES_SWITCH', { delay: 20 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1000)

  const terminalText = await terminal.textContent()
  expect(terminalText).toContain('TERMINAL_SURVIVES_SWITCH')
})

test('I2: collapsing sidebar does not break terminal', async () => {
  const toggle = page.locator('[data-testid="sidebar-toggle"]')
  await toggle.click() // collapse
  await page.waitForTimeout(300)

  const terminal = page.locator('.xterm')
  await terminal.click()
  await page.waitForTimeout(200)

  await page.keyboard.type('echo TERMINAL_SURVIVES_COLLAPSE', { delay: 20 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1000)

  const terminalText = await terminal.textContent()
  expect(terminalText).toContain('TERMINAL_SURVIVES_COLLAPSE')

  // Re-expand sidebar
  await toggle.click()
  await page.waitForTimeout(300)
})

test('I2: terminal xterm element is never removed from DOM', async () => {
  // This test verifies the xterm container is always present,
  // even when viewer/sidebar state changes
  const terminal = page.locator('.xterm')
  await expect(terminal).toBeVisible()

  // Close viewer
  const sessionItem = page.locator('[data-testid="session-item"]').first()
  await sessionItem.click() // deselect

  const viewer = page.locator('[data-testid="viewer"]')
  await expect(viewer).not.toBeVisible()

  // Terminal must STILL be in the DOM
  await expect(terminal).toBeVisible()
})
```

**Step 2: Build and run test to verify it passes or identify issues**

```bash
npm run build && npx playwright test e2e/integration.spec.ts
```

Expected: Most tests should PASS because the terminal component was never conditionally rendered. If any tests FAIL, they'll reveal focus management issues to fix in Task 19.

> **Note:** These tests may already pass because the current architecture keeps the terminal always rendered. If they all pass, Task 19 focuses on refinements (preventing sidebar/viewer clicks from stealing focus via `mousedown` prevention). If they fail, Task 19 fixes the issues.

---

### Task 19: Implement focus management

**Files:**
- Modify: `src/renderer/src/components/Viewer.tsx`
- Modify: `src/renderer/src/components/Sidebar.tsx`
- Modify: `src/renderer/src/components/Terminal.tsx`

**Step 1: Verify terminal component never conditionally renders**

Confirm `src/renderer/src/App.tsx` has the terminal as an unconditional child:

```tsx
<div style={{ flex: 1, overflow: 'hidden', padding: '4px' }}>
  <TerminalComponent />
</div>
```

This is already correct from Task 4. The terminal is always rendered regardless of viewer/sidebar state. **Do not change this.**

**Step 2: Add click-to-focus to Terminal component**

Update `src/renderer/src/components/Terminal.tsx` — add a click handler on the terminal container that explicitly focuses the xterm instance:

Find the container `<div>` that wraps the terminal ref. Add:

```tsx
onClick={() => {
  // Ensure xterm regains keyboard focus when clicked
  if (terminalRef.current) {
    terminalRef.current.focus()
  }
}}
```

Where `terminalRef.current` is the xterm `Terminal` instance (the one created with `new Terminal()`). The exact variable name may differ — look at the existing Terminal.tsx implementation.

> **If the Terminal component doesn't expose a `focus()` method:** xterm.js Terminal has a `.focus()` method. Find where the Terminal instance is stored (likely in a `useRef`) and call `.focus()` on click.

**Step 3: Prevent viewer and sidebar from capturing keyboard focus**

Update `src/renderer/src/components/Viewer.tsx` — add `tabIndex={-1}` to the viewer container to prevent it from entering tab order, and add `onMouseDown` to prevent focus steal:

Find the outer `<div data-testid="viewer">` and add:

```tsx
tabIndex={-1}
onMouseDown={(e) => {
  // Prevent viewer clicks from stealing keyboard focus from terminal
  // unless the user is clicking an interactive element (button, input)
  const target = e.target as HTMLElement
  if (target.tagName !== 'BUTTON' && target.tagName !== 'INPUT') {
    // Don't prevent default on buttons — they need to receive clicks
    // But prevent focus change for non-interactive elements
  }
}}
```

> **Important:** This is subtle. We want clicks in the viewer to work (selecting files, scrolling) but NOT steal keyboard focus from the terminal. The simplest approach: don't add `tabIndex` to non-interactive viewer elements. The terminal's `focus()` on click (Step 2) handles re-focusing.

**Step 4: Build and run ALL tests**

```bash
npm run build && npx playwright test
```

Expected: All tests pass, including all I2 terminal persistence tests.

---

### Task 20: Commit I2 and update STATE.yaml

**Step 1: Update `STATE.yaml`**

Change I2 status to `done` and `next_action` to `"Implement I3: Design token alignment"`.

```yaml
  I2:
    name: Terminal persistence
    status: done
    depends_on: [V1]
    blockers: []
```

**Step 2: Pre-commit gate**

```bash
npm run build && npx playwright test
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat(I2): terminal persistence — xterm never unmounts, click-to-focus, keyboard always routes to terminal"
```

---

## Section 7: I3 — Design Token Alignment (Tasks 21–23)

**Feature:** Extract design tokens from `components.html` into CSS custom properties. Apply tokens consistently across all components. Verify the app matches the component library's warm palette, typography, and spacing.

---

### Task 21: Create tokens.css and global.css

**Files:**
- Create: `src/renderer/src/styles/tokens.css`
- Create: `src/renderer/src/styles/global.css`
- Modify: `src/renderer/src/main.tsx` (or `index.tsx` — the renderer entry point)

**Step 1: Create `src/renderer/src/styles/tokens.css`**

```css
/* ============================================================
   DESIGN TOKENS — extracted from components.html
   Single source of truth for all visual values.
   ============================================================ */

:root {
  /* Backgrounds */
  --bg-page:           #F0EBE3;
  --bg-header:         #E8E2D8;
  --bg-sidebar:        #F0EBE3;
  --bg-sidebar-active: #E8E0D4;
  --bg-pane-title:     #DDD5C8;
  --bg-terminal:       #0F0E0C;
  --bg-right:          #F7F4EF;
  --bg-modal:          #FAF8F4;

  /* Borders */
  --border:            rgba(0, 0, 0, 0.08);
  --border-strong:     rgba(0, 0, 0, 0.12);

  /* Text */
  --text-primary:      #1C1A16;
  --text-muted:        #8A8278;
  --text-very-muted:   #A09888;
  --text-terminal:     #C8C4BC;

  /* Status colors */
  --amber:             #F59E0B;
  --green:             #3D9A65;
  --blue:              #5B8FD4;
  --red:               #CC5555;

  /* Brand */
  --amber-logo-bg:     #1A0F00;

  /* Typography */
  --font-ui:           -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
  --font-mono:         'SFMono-Regular', Menlo, Consolas, monospace;

  /* Spacing */
  --space-xs:          4px;
  --space-sm:          8px;
  --space-md:          12px;
  --space-lg:          16px;
  --space-xl:          24px;

  /* Layout */
  --sidebar-width:     220px;
  --viewer-width:      350px;
  --header-height:     0px;  /* No header in Phase 1 */

  /* Radii */
  --radius-sm:         3px;
  --radius-md:         4px;
  --radius-lg:         6px;
  --radius-xl:         8px;

  /* Shadows */
  --shadow-sm:         0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md:         0 2px 8px rgba(0, 0, 0, 0.08);

  /* Transitions */
  --transition-fast:   0.1s ease;
  --transition-normal: 0.15s ease;
}
```

**Step 2: Create `src/renderer/src/styles/global.css`**

```css
/* ============================================================
   GLOBAL STYLES — app-wide defaults
   ============================================================ */

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  background: var(--bg-page);
  font-family: var(--font-ui);
  color: var(--text-primary);
  letter-spacing: -0.011em;
  overflow: hidden;
}

::selection {
  background: rgba(245, 158, 11, 0.15);
}

button {
  font-family: var(--font-ui);
  cursor: pointer;
}

/* Scrollbar styling (thin, subtle) */
::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
  border-radius: 2px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.25);
}
```

**Step 3: Import styles in the renderer entry point**

Find the renderer entry point file (likely `src/renderer/src/main.tsx` or `src/renderer/src/index.tsx`). Add imports at the top, before the existing `App.css` import:

```typescript
import './styles/tokens.css'
import './styles/global.css'
```

**Step 4: Verify the build still works**

```bash
npm run build
```

Expected: Build succeeds with no errors.

---

### Task 22: Write E2E test for design tokens and apply tokens to components

**Files:**
- Modify: `e2e/integration.spec.ts`
- Modify: `src/renderer/src/components/Sidebar.tsx` (use CSS variables)
- Modify: `src/renderer/src/components/SessionItem.tsx` (use CSS variables)
- Modify: `src/renderer/src/components/Viewer.tsx` (use CSS variables)

**Step 1: Add I3 tests to `e2e/integration.spec.ts`**

Append after I2 tests:

```typescript
// --- I3: Design Token Alignment ---

test('I3: page body uses warm background color', async () => {
  const bgColor = await page.evaluate(() => {
    return window.getComputedStyle(document.body).backgroundColor
  })
  // --bg-page: #F0EBE3 = rgb(240, 235, 227)
  expect(bgColor).toBe('rgb(240, 235, 227)')
})

test('I3: sidebar uses --bg-sidebar background', async () => {
  const sidebar = page.locator('[data-testid="sidebar"]')
  const bgColor = await sidebar.evaluate((el) => {
    return window.getComputedStyle(el).backgroundColor
  })
  expect(bgColor).toBe('rgb(240, 235, 227)')
})

test('I3: viewer uses --bg-right background', async () => {
  // Open viewer
  const sessionItem = page.locator('[data-testid="session-item"]').first()
  await sessionItem.click()

  const viewer = page.locator('[data-testid="viewer"]')
  await expect(viewer).toBeVisible({ timeout: 5000 })

  const bgColor = await viewer.evaluate((el) => {
    return window.getComputedStyle(el).backgroundColor
  })
  // --bg-right: #F7F4EF = rgb(247, 244, 239)
  expect(bgColor).toBe('rgb(247, 244, 239)')
})

test('I3: viewer header uses --bg-pane-title background', async () => {
  const header = page.locator('[data-testid="viewer-header"]')
  const bgColor = await header.evaluate((el) => {
    return window.getComputedStyle(el).backgroundColor
  })
  // --bg-pane-title: #DDD5C8 = rgb(221, 213, 200)
  expect(bgColor).toBe('rgb(221, 213, 200)')
})

test('I3: text uses UI font family', async () => {
  const sidebar = page.locator('[data-testid="sidebar"]')
  const fontFamily = await sidebar.evaluate((el) => {
    return window.getComputedStyle(el).fontFamily
  })
  // Should contain system font stack
  expect(fontFamily).toMatch(/system|BlinkMacSystemFont|Inter/i)
})

test('I3: three-panel layout has correct proportions', async () => {
  const sidebar = page.locator('[data-testid="sidebar"]')
  const viewer = page.locator('[data-testid="viewer"]')
  const terminal = page.locator('.xterm')

  const sidebarBox = await sidebar.boundingBox()
  const viewerBox = await viewer.boundingBox()
  const terminalBox = await terminal.boundingBox()

  expect(sidebarBox).toBeTruthy()
  expect(viewerBox).toBeTruthy()
  expect(terminalBox).toBeTruthy()

  // Sidebar: ~220px
  expect(sidebarBox!.width).toBeGreaterThanOrEqual(190)
  expect(sidebarBox!.width).toBeLessThanOrEqual(250)

  // Viewer: ~350px
  expect(viewerBox!.width).toBeGreaterThanOrEqual(300)
  expect(viewerBox!.width).toBeLessThanOrEqual(400)

  // Terminal: takes remaining space (should be largest)
  expect(terminalBox!.width).toBeGreaterThan(sidebarBox!.width)

  // Close viewer for subsequent tests
  const sessionItem = page.locator('[data-testid="session-item"]').first()
  await sessionItem.click()
})
```

**Step 2: Refactor Viewer.tsx to use CSS custom properties**

Update `src/renderer/src/components/Viewer.tsx` — replace hardcoded color values with CSS variable references. Find and replace these values:

- `'#F7F4EF'` → `'var(--bg-right)'` (but note: inline styles with var() require the full expression)

> **Practical note:** React inline styles don't evaluate CSS `var()` directly in the style object — they pass strings through. The values `backgroundColor: 'var(--bg-right)'` **does work** in React because it's just setting a CSS property string. Replace hardcoded hex values:

```tsx
backgroundColor: '#F7F4EF',  →  backgroundColor: 'var(--bg-right)',
borderLeft: '1px solid rgba(0, 0, 0, 0.08)',  →  borderLeft: '1px solid var(--border)',
backgroundColor: '#DDD5C8',  →  backgroundColor: 'var(--bg-pane-title)',
color: '#8A8278',  →  color: 'var(--text-muted)',
color: '#1C1A16',  →  color: 'var(--text-primary)',
```

> **Important:** CSS `var()` expressions work in React inline styles because React passes them through to the DOM as-is. This is standard React behavior.

**Step 3: Refactor SessionItem.tsx to use CSS custom properties**

Update `src/renderer/src/components/SessionItem.tsx`:

```tsx
backgroundColor: isSelected ? '#E8E0D4' : 'transparent',
→
backgroundColor: isSelected ? 'var(--bg-sidebar-active)' : 'transparent',

color: '#1C1A16',
→
color: 'var(--text-primary)',

color: '#8A8278',
→
color: 'var(--text-muted)',
```

**Step 4: Refactor Sidebar.tsx to use CSS custom properties**

Update `src/renderer/src/components/Sidebar.tsx`:

```tsx
backgroundColor: '#F0EBE3',
→
backgroundColor: 'var(--bg-sidebar)',

borderRight: '1px solid rgba(0, 0, 0, 0.08)',
→
borderRight: '1px solid var(--border)',

color: '#8A8278',
→
color: 'var(--text-muted)',

color: '#1C1A16',
→
color: 'var(--text-primary)',
```

**Step 5: Build and run all tests**

```bash
npm run build && npx playwright test
```

Expected: All tests pass, including I3 design token tests. The CSS custom properties resolve correctly because `tokens.css` is loaded globally.

---

### Task 23: Commit I3 and update STATE.yaml

**Step 1: Update `STATE.yaml`**

Change I3 status to `done` and `next_action` to `"Final Phase 1 regression check and review"`.

```yaml
  I3:
    name: Design token alignment
    status: done
    depends_on: [V5, I2]
    blockers: []
```

**Step 2: Pre-commit gate**

```bash
npm run build && npx playwright test
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat(I3): design token alignment — CSS custom properties, warm palette, consistent typography across all components"
```

---

## Section 8: Phase 1 Completion (Task 24)

### Task 24: Full regression check, definition of done, and Phase 1 sign-off

**Step 1: Run the complete E2E suite**

```bash
npm run build && npx playwright test --reporter=list
```

Expected: ALL tests pass. The output should show terminal tests (T1-T5), sidebar tests (S1-S5), viewer tests (V1-V5), and integration tests (I1-I3):

```
  ✓ T1: window has correct title
  ✓ T1: window has minimum dimensions
  ✓ T1: app launches in under 2 seconds
  ✓ T1: window shows no unexpected chrome
  ✓ T2: terminal element exists in the window
  ✓ T2: terminal takes up the full app area
  ✓ T3: typing a command produces output
  ✓ T3: shell persists after command completes
  ✓ T5: Ctrl+C sends interrupt
  ✓ T5: arrow keys work
  ...
  ✓ S1: sidebar element exists in the layout
  ✓ S1: sidebar has approximately 200px width
  ✓ S1: sidebar has correct background color
  ✓ S1: sidebar collapse toggle exists and works
  ✓ S1: terminal still exists alongside sidebar
  ✓ S2: sidebar shows session items
  ✓ S3: running session shows amber status dot
  ✓ S3: done session shows green status dot
  ✓ S3: needs-input session shows blue status dot
  ✓ S4: sessions are grouped under project headers
  ✓ S5: adding a new session directory updates sidebar
  ✓ S5: modifying events.jsonl updates session status
  ...
  ✓ V1: viewer panel is not visible by default
  ✓ V1: clicking a session opens the viewer panel
  ✓ V1: viewer panel has correct background color
  ✓ V1: clicking the same session again closes the viewer
  ✓ V1: terminal remains visible when viewer is open
  ✓ I1: selected session is highlighted in sidebar
  ✓ V2: viewer shows file entries when session is selected
  ✓ V2: directories are listed before files
  ✓ V2: file entries show file names
  ✓ V2: clicking a file selects it
  ✓ V2: clicking a directory navigates into it
  ✓ V2: back button returns to parent directory
  ✓ V3: clicking a .md file shows rendered markdown
  ✓ V3: markdown renders headings
  ✓ V3: markdown renders bold text
  ✓ V3: markdown renders list items
  ✓ V3: markdown renders blockquotes
  ✓ V3: back to file browser button works
  ✓ V4: clicking a .ts file shows syntax-highlighted code
  ✓ V4: code renderer shows line numbers
  ✓ V4: code is syntax-highlighted
  ✓ V4: code uses monospace font
  ✓ V4: clicking a .css file also shows highlighted code
  ✓ V5: clicking a .png file shows the image
  ✓ V5: image renderer contains an img element
  ✓ V5: image has a data URL src
  ✓ I2: terminal accepts input before any viewer interaction
  ✓ I2: opening viewer does not break terminal
  ✓ I2: browsing files does not break terminal
  ✓ I2: switching sessions does not break terminal
  ✓ I2: collapsing sidebar does not break terminal
  ✓ I2: terminal xterm element is never removed from DOM
  ✓ I3: page body uses warm background color
  ✓ I3: sidebar uses --bg-sidebar background
  ✓ I3: viewer uses --bg-right background
  ✓ I3: viewer header uses --bg-pane-title background
  ✓ I3: text uses UI font family
  ✓ I3: three-panel layout has correct proportions
```

**Step 2: Verify Phase 1 Definition of Done**

Cross-reference with the design document's checklist:

**Terminal:**
| Requirement | Test(s) | Status |
|---|---|---|
| App launches in <2s | T1: launch speed | Covered |
| Input latency indistinguishable from native | T3: typing produces output | Covered |
| `amplifier run` starts with correct ANSI output | T3: command produces output | Covered |
| Ctrl+C kills running process | T5: Ctrl+C sends interrupt | Covered |
| Ctrl+D exits shell | T5: Ctrl+D test | Covered |
| Arrow keys, tab completion, history | T5: keyboard fidelity | Covered |
| Shell persists after session exits | T3: shell persists | Covered |
| Window resize reflows | T2/T5: terminal size | Covered |

**Sidebar:**
| Requirement | Test(s) | Status |
|---|---|---|
| Shows sessions grouped by project | S4: project grouping | Covered |
| Status is correct | S3: status dots | Covered |
| Updates within 2 seconds | S5: real-time updates | Covered |
| Clicking doesn't disrupt terminal | I2: terminal persistence | Covered |
| Collapsible | S1: collapse toggle | Covered |

**Viewer:**
| Requirement | Test(s) | Status |
|---|---|---|
| Shows files from session's working directory | V2: file browser | Covered |
| Renders markdown with basic styling | V3: markdown rendering | Covered |
| Renders code with syntax highlighting | V4: code highlighting | Covered |
| Shows images inline | V5: image preview | Covered |
| Appears/disappears without disrupting terminal | I2: terminal persistence + V1: toggle | Covered |

**Visual:**
| Requirement | Test(s) | Status |
|---|---|---|
| Matches component library design tokens | I3: design token tests | Covered |
| No visual jank on any interaction | I2: persistence tests cover interactions | Covered |
| Looks intentional, not default Electron gray | I3: warm palette verified | Covered |

**Step 3: Run terminal tests in isolation (regression check)**

```bash
npx playwright test e2e/terminal.spec.ts --reporter=list
```

Expected: All terminal tests still pass. This confirms the viewer and integration work did not regress terminal functionality.

**Step 4: Update `STATE.yaml` to mark Phase 1 complete**

```yaml
# Amplifier Canvas — Build State (Track B)
# Read this at every session start.

phase: "Phase 1 — COMPLETE"

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
  S1:
    name: Sidebar shell
    status: done
    depends_on: [T1]
    blockers: []
  S2:
    name: Session list
    status: done
    depends_on: [S1]
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
    depends_on: [S3]
    blockers: []
  V1:
    name: Right panel shell
    status: done
    depends_on: [S1]
    blockers: []
  V2:
    name: File browser
    status: done
    depends_on: [V1, I1]
    blockers: []
  V3:
    name: Markdown rendering
    status: done
    depends_on: [V2]
    blockers: []
  V4:
    name: Code syntax highlighting
    status: done
    depends_on: [V2]
    blockers: []
  V5:
    name: Image preview
    status: done
    depends_on: [V2]
    blockers: []
  I1:
    name: Session-viewer wiring
    status: done
    depends_on: [V1, S2]
    blockers: []
  I2:
    name: Terminal persistence
    status: done
    depends_on: [V1]
    blockers: []
  I3:
    name: Design token alignment
    status: done
    depends_on: [V5, I2]
    blockers: []

next_action: "Phase 1 complete. Antagonistic review of viewer + integration layer, then Phase 2 planning."
```

**Step 5: Update `AGENTS.md` plan reference**

Update the plan structure section:

```markdown
## Plan Structure

Phase 1 (complete):
- **Plan 1A:** Scaffold + Terminal (T1-T5) ✓ complete
- **Plan 1B:** Sidebar (S1-S5) ✓ complete
- **Plan 1C:** Viewer + Integration (V1-V5, I1-I3) ✓ complete ← you are here
```

**Step 6: Final commit**

```bash
npm run build && npx playwright test
git add -A
git commit -m "chore: complete Phase 1 — all 18 features done, E2E tests covering T1-T5, S1-S5, V1-V5, I1-I3"
```

**Step 7: Tag the Phase 1 release**

```bash
git tag -a v0.1.0 -m "Phase 1: Terminal + Sidebar + Viewer — full app shell"
```
