# Amplifier Canvas Architecture

> Living document. Last validated: 2026-04-08 (architecture validation review).

## Process Model

Two-process Electron architecture. Main process owns all OS interaction (PTY, filesystem, SQLite). Renderer process owns all UI (React, xterm.js, Zustand). They communicate via typed IPC through a preload bridge. No direct Node.js access from renderer.

## Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Platform | Electron | node-pty needs OS access, xterm.js needs full browser. Desktop-first. |
| UI | React 18 | Component model maps to three-panel layout. Ecosystem for xterm.js, markdown, syntax highlighting. |
| State | Zustand | Flat store, no boilerplate. Proven by Grove in identical use case. |
| Types | TypeScript | Type safety across the IPC boundary. |
| Build | electron-vite | Single config handles main/preload/renderer split. |
| Package | electron-builder | macOS first. |
| DB | better-sqlite3 | Crash-safe lifecycle persistence. Incremental cost -- electron-rebuild already required for node-pty. |
| Code viewer | highlight.js | Pure JS, no WASM. Eliminates Shiki build risk. Good enough for read-only. |
| Markdown | react-markdown + DOMPurify | GitHub-flavored markdown with HTML sanitization. |

## Component Architecture

Three-panel layout with flat component tree:

```
App
├── Sidebar (220px, collapsible)
│   └── SessionItem[]
├── Terminal (flex, always visible)
│   └── xterm.js (never unmounted, visibility:hidden when inactive)
└── Viewer (~350px, conditional)
    ├── FileBrowser
    └── FileRenderer
        ├── MarkdownRenderer
        ├── CodeRenderer
        └── ImageRenderer
```

Terminal never unmounts. Switching sessions uses `visibility:hidden` on inactive xterm.js instances -- preserves PTY dimensions and avoids SIGWINCH resize events. Viewer appears when a session is selected.

## Event Ingestion

### Phase 1: File Watching Only

Single ingestion path. No hook module.

- **Startup:** Scan `~/.amplifier/projects/` to discover all session directories. Parse metadata, group by project. Populate canvas.db.
- **Canvas-started sessions:** Canvas spawns the PTY and knows the project path. It watches that project's session directory for the new session to appear, then tail-reads events.jsonl.
- **External sessions:** Sparse chokidar watchers on `~/.amplifier/projects/` detect new session directories. Same tail-read mechanism.
- **Status derivation:** New bytes in events.jsonl within last 30s = running. `session:end` event = done. Non-zero PTY exit = failed. Last event is assistant message with no pending tool calls = needs_input.
- **Latency:** ~500ms for status updates. Acceptable for status dots.
- **Session-to-PTY association:** Canvas spawns the PTY, knows the project path, watches for new session directory. Before/after directory listing gives reliable association.

The state aggregator interface accepts events from any source, keeping the slot open for Phase 2's hook module.

### Phase 2: Dual Ingestion (Deferred)

Hook module (canvas-relay) streams events in real-time via HTTP to Canvas's main process. File watchers remain for external sessions. Byte-offset deduplication prevents double-counting when both paths report the same events.

## Data Layer

### Canvas Derives (Read-Only)

- Session content -- events, tool outputs, agent messages (from events.jsonl)
- File trees and file content (from project working directory)
- Terminal output (from PTY stream)
- Git state (Phase 2, from .git/)

### Canvas Owns (Persisted in canvas.db)

- Project registry -- which project paths Canvas knows about
- Session lifecycle -- startedBy (canvas/external), startedAt, endedAt, status
- Byte offsets -- last read position in each events.jsonl
- UI preferences -- sidebar width, last selected session, collapsed state

**Location:** `~/.amplifier/canvas/canvas.db`

**Recovery:** If canvas.db is deleted, Canvas re-derives from full disk scan of `~/.amplifier/projects/` (~5 seconds). The database is a performance cache. The source of truth is always Amplifier's files.

**Future note:** UI preferences may migrate to a separate JSON file (`~/.amplifier/canvas/preferences.json`) so they survive database resets. Not a Phase 1 concern.

## IPC Contract

### Main → Renderer (Push)

| Channel | Payload | Description |
|---------|---------|-------------|
| `state:sessions-changed` | `SessionState[]` | Full session list on any state change |
| `terminal:data` | `{ sessionId: string, data: Buffer }` | PTY output bytes |
| `session:files-changed` | `{ sessionId: string, files: FileActivity[] }` | Files touched by session (extracted from events.jsonl) |

### Renderer → Main (Send)

| Channel | Payload | Description |
|---------|---------|-------------|
| `terminal:input` | `{ sessionId: string, data: string }` | User keystrokes to PTY |
| `terminal:resize` | `{ sessionId: string, cols: number, rows: number }` | Terminal dimension changes |

### Renderer → Main (Invoke/Handle)

| Channel | Request | Response | Description |
|---------|---------|----------|-------------|
| `files:list-dir` | `{ path: string }` | `FileEntry[]` | Directory listing |
| `files:read-text` | `{ path: string }` | `string` | File content |

Seven IPC messages total.

### Types

```typescript
interface SessionState {
  id: string;
  projectSlug: string;
  projectName: string;
  status: 'running' | 'needs_input' | 'done' | 'failed' | 'active';
  startedAt: string;
  startedBy: 'canvas' | 'external';
  byteOffset: number;
  recentFiles: FileActivity[];
}

interface FileActivity {
  path: string;
  operation: 'read' | 'write' | 'edit' | 'create' | 'delete';
  timestamp: string;
}
```

The `recentFiles` field enables the viewer to surface files a session touched -- the key feature that differentiates Canvas from a terminal + VS Code side-by-side.

## Security

- Renderer has no direct Node.js access. All OS interaction goes through the preload bridge.
- `contextIsolation: true`, `nodeIntegration: false` on all BrowserWindows.
- File access scoped to project working directories and `~/.amplifier/`.
- DOMPurify sanitizes all rendered markdown/HTML.
- `canvas://` custom protocol for serving local images into the renderer.

## Phase 1 Scope

17 features across 4 layers.

### Terminal (T1-T5)

- T1: Electron shell (window, menu, lifecycle)
- T2: xterm.js terminal instance
- T3: Bidirectional PTY pipe via node-pty
- T4: `amplifier canvas` CLI launch command
- T5: Keyboard fidelity (Ctrl+C, Ctrl+D, arrows, tab)

### Sidebar (S1-S5)

- S1: Sidebar shell (220px, collapsible)
- S2: Session list from canvas.db
- S3: Status dots (running/needs_input/done/failed/active)
- S4: Project grouping from disk structure
- S5: Real-time updates via chokidar file watchers (single path, no hook module)

### Viewer (V1-V5)

- V1: Viewer panel shell (conditional, ~350px)
- V2: File browser (list-dir, navigate)
- V3: Markdown rendering (react-markdown + DOMPurify)
- V4: Code syntax highlighting (highlight.js)
- V5: Image preview (canvas:// protocol)

### Integration (I1-I3)

- I1: Session-viewer wiring (includes file activity extraction from events.jsonl via `recentFiles`)
- I2: Terminal persistence across session switches (visibility:hidden)
- I3: Design token alignment with canvas.html component library

## Testing Strategy

E2E tests (Playwright + Electron) as the primary validation mechanism. No unit tests in Phase 1 -- component count is small enough that E2E covers critical paths.

**Pre-commit gate:** `npm run build && npx playwright test`

| Layer | Tests | Verification |
|-------|-------|-------------|
| Terminal (T1-T5) | PTY round-trip assertions | Send command via IPC, verify output. Keyboard sequences produce correct escape codes. |
| Sidebar (S1-S5) | Accessibility tree snapshots | Session list, status dots, project grouping. |
| Viewer (V1-V5) | Content rendering assertions | Markdown, code highlighting, images, file browser. |
| Integration (I1-I3) | Cross-panel assertions | Session selection updates viewer. Terminal persists across switches. |

**Fixtures:** `e2e/fixtures/` with fake `~/.amplifier` and project directories. `AMPLIFIER_HOME` and `CANVAS_WORKDIR` env overrides isolate from real data.

**Terminal caveat:** xterm.js renders to HTML canvas (opaque to accessibility tree). Terminal tests use PTY round-trip, not DOM inspection.

**Visual validation:** After each milestone, Playwright screenshots compared against canvas.html using nano-banana. Checkpoint review, not pre-commit gate.

## Phase 2 Deferred

Explicitly deferred from Phase 1:

- **Hook module (canvas-relay):** Real-time event streaming from Amplifier to Canvas via HTTP hook.
- **HTTP receiver in main process:** Endpoint to receive hook payloads.
- **Dual event ingestion:** Simultaneous hook + file watcher paths with byte-offset deduplication.
- **Session summary derivation:** Parsing events.jsonl for human-readable session summaries (AI problem, not engineering).
- **Git state integration:** Branch, diff, and commit status in the viewer.
