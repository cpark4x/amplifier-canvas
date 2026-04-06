# Amplifier-Canvas Architecture

## The Core Constraint

Canvas is a **visibility layer** over the Amplifier CLI. It does not replace the CLI, extend its capabilities, or own any agent execution. Every piece of data Canvas displays originates from Amplifier's existing artifacts — session files, git state, and file system.

If Canvas crashes, nothing is lost. If Canvas is closed, Amplifier keeps working. Canvas reads; Amplifier writes.

## Phase 1 Scope

Phase 1 delivers the core experience: see your sessions, work in the terminal, inspect files.

**Phase 1 — Building:**

| Layer | Features |
|-------|----------|
| **Terminal** | xterm.js + node-pty, bidirectional PTY pipe, `amplifier canvas` CLI launch, keyboard fidelity (Ctrl+C, Ctrl+D, arrows, tab) |
| **Sidebar** | Session list, status dots (running/needs_input/done/failed/paused), project grouping from disk structure, real-time updates via hook module (Canvas-started sessions) + chokidar file watchers (external sessions), SQLite-backed session lifecycle |
| **Viewer** | File browser, markdown rendering (react-markdown), code syntax highlighting (highlight.js), image preview |
| **Integration** | Session-viewer wiring, terminal persistence across session switches, design token alignment with component library |

**Phase 2 — Designed for, not built:**

| Feature | Why deferred |
|---------|-------------|
| Git Poller (5s per project) | No Phase 1 feature depends on git state. Architecture has a slot for it in the State Aggregator. |
| AppHeader (logo, breadcrumb, settings) | Chrome, not core. Phase 1 uses the window title bar. |
| Multi-session terminals | Phase 1 supports one PTY terminal. Multiple tabs are a Phase 2 UX decision. |
| Project archive/unarchive | Project management is Phase 2. Phase 1 shows what's on disk. |

The architecture accounts for all Phase 2 items — adding them means extending existing modules, not restructuring.

## Tech Stack

**Electron + React + TypeScript**

| Choice | Why |
|--------|-----|
| Electron | Spawns CLI processes (node-pty), accesses filesystem, embeds terminal (xterm.js requires browser runtime). macOS first, Windows/Linux follow. |
| React | Component model maps to our UI: sidebar, terminal, viewer. Ecosystem for xterm.js, syntax highlighting, markdown rendering. |
| TypeScript | Type safety across the IPC boundary between main and renderer. |
| Zustand | Proven in Grove's identical use case (React + Electron + session state). Flat store, no boilerplate, works with React devtools. |
| better-sqlite3 | Session lifecycle persistence (projects, sessions, byte offsets). Sync API — no async overhead in Electron main process. Already paying electron-rebuild tax for node-pty. |
| highlight.js | Code syntax highlighting. Pure JS, no WASM — eliminates Shiki's build risk with electron-vite. Good enough for read-only viewer. |
| DOMPurify | HTML sanitization for markdown rendering. Defense-in-depth against XSS in the viewer. |

**Why not Tauri?** xterm.js requires a full browser runtime. Tauri uses native webviews that don't guarantee this. The terminal is the primary workspace — can't compromise.

**Why not a web app?** The terminal is the primary workspace. Canvas embeds it. A web app would need a local server to spawn CLI processes and pipe them to the browser (that's what Grove does — Express + WebSocket). Two pieces to install and keep running instead of one app you double-click. Desktop wins on simplicity of the first experience: download, open, you're in. If Canvas ever needs web access (check on sessions from your phone, share a view with teammates), the path is a lightweight web companion — not replacing the desktop app.

**Why not amplifierd (Distro's server)?** Different product. Distro is a multi-user server with REST+SSE. Canvas is a local desktop app. We don't need auth, HTTP APIs, or a daemon. If amplifierd matures into the standard way to run Amplifier, Canvas could adopt it later — the architecture allows this because Canvas never couples to *how* it gets data, only *what shape* the data is.

**Build tooling:** electron-vite (handles the main/preload/renderer split cleanly with one config file) + electron-builder (packages the app for macOS). Single app, no monorepo needed.

**Native dependencies:** Both node-pty and better-sqlite3 require native compilation via electron-rebuild. Pin exact Electron + node-pty + better-sqlite3 versions. electron-rebuild runs as a postinstall script.

## The Two-Process Architecture

Electron apps have two processes. This isn't a choice — it's how Electron works. But the split maps perfectly to what we need:

```
┌────────────────────────────────────────────────────────────┐
│  MAIN PROCESS (Node.js)                                    │
│  Everything that touches the OS                            │
│                                                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ PTY Manager  │  │ File Watcher │  │Hook Receiver │     │
│  │              │  │ (sparse —    │  │              │     │
│  │ Spawns       │  │  external    │  │ HTTP server, │     │
│  │ amplifier run│  │  sessions    │  │ localhost;   │     │
│  │ via node-pty │  │  only)       │  │ canvas-relay │     │
│  │              │  │              │  │ hook events  │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                 │                 │              │
│         └────────┬────────┴─────────────────┬────────┘         │
│                  ▼                                 │          │
│  ┌───────────────────────────────┐  ┌─────────────┐ │  │
│  │ State Aggregator              │  │ State Store │◄┘  │
│  │                               │  │ SQLite via  │     │
│  │ Merges: PTY state             │  │ better-     │     │
│  │ + hook events (Canvas)        │  │ sqlite3     │     │
│  │ + file watcher (external)     │  │ (canvas.db) │     │
│  │ + SQLite lifecycle data       │  │             │     │
│  │                               │  │ Git Poller  │     │
│  │                               │  │ (Phase 2)   │     │
│  └─────────────┬─────────────────┘  └─────────────┘     │
│                │ IPC (ipcMain.handle)                       │
│  ┌─────────────┴───────────────────────────────┐             │
│  │ canvas:// Protocol (serves project files to renderer) │             │
│  └─────────────┬───────────────────────────────┘             │
├────────────────┼───────────────────────────────────────────┤
│                ▼                                           │
│  RENDERER PROCESS (Chromium)                               │
│  Everything the user sees                                  │
│                                                            │
│  ┌───────────────────────────────┐                         │
│  │ Zustand Store                 │                         │
│  │ (mirrors main process         │                         │
│  │  state via IPC)               │                         │
│  └─────────────┬─────────────────┘                         │
│                │                                           │
│    ┌───────────┼───────────────────────────────┐           │
│    ▼           ▼                               ▼           │
│  ┌──────┐  ┌──────────────────────┐  ┌──────────┐         │
│  │Sidebar│  │ Terminal (xterm.js)  │  │ Viewer   │         │
│  │      │  │ connected to PTY     │  │ (files,  │         │
│  │      │  │ via IPC passthrough  │  │  preview) │         │
│  └──────┘  └──────────────────────┘  └──────────┘         │
└────────────────────────────────────────────────────────────┘
```

**Why this matters:** The main process owns all I/O (filesystem, PTY). The renderer owns all UI. They talk via Electron IPC. This gives us:
- Renderer can't corrupt filesystem or kill processes (security)
- Main process doesn't need to know about React (separation)
- IPC messages are the contract between them (testable)

### IPC Contract

The main→renderer channel is the real API of this app:

```typescript
// Main → Renderer (push: state updates)
'state:sessions-changed'     → SessionState[]
'terminal:data'              → { sessionId: string, data: Buffer }

// Renderer → Main (request: user actions)
'terminal:input'             → { sessionId: string, data: string }
'terminal:resize'            → { sessionId: string, cols: number, rows: number }

// Renderer → Main (invoke/handle: request-response)
'files:list-dir'             → { path: string } → FileEntry[]
'files:read-text'            → { path: string } → string
// Images served via canvas:// custom protocol — no IPC needed for binary files

// Hook event ingestion (Phase 1)
'hook:event'                 → { sessionId: string, event: string, data: any }
```

Phase 2 reserved channels (slots defined, not wired):
```typescript
'state:git-changed'          → GitState[]
'session:start'              → { projectPath: string } → sessionId
'session:switch'             → { sessionId: string }
'session:resume'             → { sessionId: string }
'project:add'                → { path: string }
'project:archive'            → { projectId: string }

// Reserved — Session → UI intent signals (Phase 2, slots defined)
'session:open-file'          → { sessionId: string, filePath: string }
'session:notification'       → { sessionId: string, message: string, type: string }
'session:tool-output'        → { sessionId: string, toolName: string, output: string }
```

## Data Architecture

### Data Sources

Canvas reads — it never writes to Amplifier's data.

| Source | What it gives us | How we read it | Update mechanism | Owner |
|--------|-----------------|----------------|-----------------|-------|
| **Session files** (`events.jsonl`) | Session events, tool calls, agent output | Tail-read (track byte offset in SQLite, parse only new bytes) | Hook events (Canvas-started) or chokidar watcher (external) | Amplifier (read-only) |
| **File system** (project working directory) | Files created/modified by sessions | canvas:// custom protocol (renderer) or fs (main) | On-demand (when viewer opens) | Amplifier (read-only) |
| **Git state** (`.git/` in each project) | Branch, recent commits | `git` CLI commands | Poll every 5s *(Phase 2)* | Git (read-only) |
| **canvas.db** (`~/.amplifier/canvas/canvas.db`) | Project registry, session lifecycle, byte offsets, startedBy flags, UI preferences | better-sqlite3 sync API | Written by Canvas main process | Canvas (read-write) |

Canvas maintains a read-only relationship with Amplifier's data — it never writes to events.jsonl, session directories, or Amplifier config. canvas.db is Canvas's own data store for lifecycle metadata that doesn't exist in Amplifier's files.

### Event Ingestion (Dual Path)

Canvas receives session events through two paths:

**Primary path — Hook module (Canvas-started sessions):**
When Canvas auto-starts `amplifier run` in a PTY, it injects the `canvas-relay` hook via the PTY environment. The hook POSTs lifecycle events (`session:start`, `session:end`, tool calls) to Canvas's localhost HTTP receiver. Latency: ~10ms. This provides session-to-PTY association without banner regex.

**Fallback path — File watchers (external sessions):**
Sessions started outside Canvas (in a regular terminal) have no hook. Canvas discovers them via sparse chokidar watchers on `~/.amplifier/projects/` and tail-reads their events.jsonl for status. Latency: ~500ms.

**Ownership rule:** Each session has exactly one primary event source. Canvas-started sessions use hook events. External sessions use file watchers. No session is ever dual-sourced. When both paths deliver the same event (hook first, watcher later), the state aggregator deduplicates by byte offset.

**Graceful degradation:** Every Canvas feature must work on the file watcher path alone. The hook module enhances speed and precision but is never required. If the hook fails to load, Canvas falls back to file watching automatically.

### Session Discovery

**On startup:** Read known projects and sessions from canvas.db. If canvas.db is empty or corrupt (first launch, or database deleted), perform a full scan of `~/.amplifier/projects/` to discover all session directories. Parse metadata (not full events). Group by working directory → project. Populate canvas.db. Subsequent startups read canvas.db directly — no full scan.

**Canvas-started sessions:** Hook module sends `session:start` with the session ID. Canvas records it in canvas.db with `startedBy: 'canvas'` and associates it with the PTY that spawned it. Immediate, reliable.

**External sessions:** Sparse chokidar watcher on `~/.amplifier/projects/` detects new session directories. Canvas adds them to canvas.db with `startedBy: 'external'`. Status derived from events.jsonl via tail-read.

**After /exit:** When a user `/exit`s an Amplifier session and drops to a bare shell, then manually runs `amplifier run` again, the new session appears via the external path (file watcher). Canvas does not try to inject hooks into manual re-runs.

### Status Derivation

| Status | Visual | How derived |
|--------|--------|-------------|
| `running` | Amber pulsing dot | Hook: events arriving. File watcher: new bytes in events.jsonl within last 30s |
| `needs_input` | Blue pulsing dot | Hook: `prompt:complete` event. File watcher: last event is assistant message with no pending tool calls |
| `done` | Green dot + checkmark | Hook or file watcher: `session:end` event present |
| `failed` | Red dot | PTY process exited non-zero, or last event indicates error |
| `active` | Gray dot | External session with recent events.jsonl activity but no Canvas PTY. Replaces `paused`. |
| `terminal_active_no_session` | Terminal icon | PTY alive but no Amplifier session running (user at shell prompt) |

## Component Architecture

Phase 1 uses a flat component structure — no nested subdirectories:

```
App
├── Sidebar
│   └── SessionItem[]
├── Terminal (xterm.js)
└── Viewer
    ├── FileBrowser
    └── FileRenderer
        ├── MarkdownRenderer
        ├── CodeRenderer
        └── ImageRenderer
```

**Three-panel layout:** `Sidebar (220px, collapsible) | Terminal (flex, always visible) | Viewer (~350px, conditional)`

The viewer appears when a session is selected in the sidebar. The terminal is always visible and never unmounts.

### Terminal Management

Learned from Grove: **never unmount xterm.js instances.**

- Each session gets one xterm.js instance, created on first view
- Switching sessions: `visibility: hidden` on inactive terminals (not `display: none` — preserves PTY dimensions)
- Rolling buffer: 256KB per terminal, discards oldest lines when exceeded
- On reconnect/restart: replay terminal output from a stored buffer (last screen-clear `\x1b[2J` forward)

### Viewer: highlight.js, Not Monaco

Monaco is 5MB+ and designed for editing. We need read-only viewing.

- **Code:** highlight.js (pure JavaScript, ~30KB core + language grammars, no WASM, zero build risk with electron-vite)
- **Markdown:** `react-markdown` with GitHub-flavored markdown, sanitized with DOMPurify
- **Images:** Served via `canvas://` custom protocol — no base64 IPC
- **Other:** Raw text fallback with line numbers
- **Error handling:** File type not recognized → raw text. File >1MB → truncated. File inaccessible → error state, don't crash.

## State Management

### Zustand Store (Renderer)

```typescript
interface CanvasStore {
  // Sessions (derived from main process via IPC)
  sessions: SessionState[];
  activeSessionId: string | null;

  // Viewer
  viewerVisible: boolean;
  viewerFile: string | null;

  // UI
  sidebarCollapsed: boolean;
}

interface SessionState {
  id: string;
  projectSlug: string;
  projectName: string;       // last segment of decoded slug
  status: 'running' | 'needs_input' | 'done' | 'failed' | 'active';
  startedAt: string;
  startedBy: 'canvas' | 'external';  // Persisted in canvas.db
  byteOffset: number;                 // Last read position in events.jsonl
}
```

**State flow is unidirectional:**
1. Main process detects change (hook event, file watcher, or PTY event)
2. Main process updates State Aggregator
3. State Aggregator persists lifecycle changes to canvas.db
4. State Aggregator sends canonical state via IPC
5. Renderer Zustand store updates
6. React re-renders affected components

The renderer never reads files or talks to processes. It renders state and dispatches user actions.

## What Canvas Owns vs. Derives

| Canvas owns (persisted in canvas.db) | Canvas derives (in-memory, from Amplifier files) |
|--------------------------------------|--------------------------------------------------|
| Project registry (paths, names) | Session content (events, tool outputs, agent messages) |
| Session lifecycle (startedBy, startedAt, endedAt) | File tree for viewer |
| Session byte offsets for tail-read | Git status (Phase 2) |
| PTY-to-session association | Terminal output |
| UI preferences (sidebar width, last selected session) | Current session status hints (running/needs_input) |

**Persistence:** `~/.amplifier/canvas/canvas.db` (SQLite). On corruption or deletion, Canvas re-derives from Amplifier's files via full disk scan (~5 seconds). No user data is lost because Canvas doesn't own the data — Amplifier's files are untouched.

## File Structure (Planned)

```
amplifier-canvas/
├── VISION.md
├── OUTCOMES.md
├── STORYBOARD.md
├── ARCHITECTURE.md
├── SCORECARD.md
├── STATE.yaml                     # Feature tracking
├── LESSONS.md                     # Recurring patterns
├── docs/plans/                    # Implementation plans (1A, 1B, 1C)
├── canvas.html                    # Design reference (22 screens)
├── electron.vite.config.ts        # Single config for main/preload/renderer
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── tsconfig.web.json
├── src/
│   ├── main/                      # Electron main process
│   │   ├── index.ts               # App entry, window creation
│   │   ├── ipc.ts                 # IPC handler registration
│   │   ├── pty.ts                 # PTY spawning and lifecycle
│   │   ├── watcher.ts             # chokidar on events.jsonl
│   │   ├── state-aggregator.ts    # Merges all sources → canonical state
│   │   ├── state-store.ts         # SQLite via better-sqlite3 (canvas.db)
│   │   ├── hook-receiver.ts       # HTTP server for canvas-relay hook events
│   │   ├── protocol.ts            # canvas:// custom protocol handler
│   │   └── file-reader.ts         # Read files for viewer (list-dir, read-text)
│   ├── renderer/                  # React app
│   │   ├── index.html             # HTML shell
│   │   └── src/
│   │       ├── main.tsx           # Renderer entry point
│   │       ├── App.tsx            # Root component, layout
│   │       ├── App.css            # Global styles, design tokens
│   │       ├── stores/
│   │       │   └── session-store.ts   # Zustand store
│   │       └── components/        # Flat — no subdirectories
│   │           ├── Terminal.tsx
│   │           ├── Sidebar.tsx
│   │           ├── SessionItem.tsx
│   │           ├── Viewer.tsx
│   │           ├── FileBrowser.tsx
│   │           ├── FileRenderer.tsx
│   │           ├── MarkdownRenderer.tsx
│   │           ├── CodeRenderer.tsx
│   │           └── ImageRenderer.tsx
│   ├── shared/                    # Types shared across processes
│   │   ├── types.ts               # SessionState, FileEntry, IPC channel types
│   │   └── constants.ts           # IPC channel names, paths
│   └── preload/
│       └── index.ts               # contextBridge — exposes IPC to renderer
├── e2e/                           # Playwright E2E tests
│   ├── app.spec.ts                # Scaffold smoke test
│   ├── terminal.spec.ts           # T1-T5 terminal tests
│   ├── sidebar.spec.ts            # S1-S5 sidebar tests
│   ├── viewer.spec.ts             # V1-V5 viewer tests
│   ├── integration.spec.ts        # I1-I3 cross-layer tests
│   └── fixtures/                  # Test data
│       ├── amplifier-home/        # Fake ~/.amplifier for sidebar tests
│       └── test-workdir/          # Fake project dir for viewer tests
└── build/                         # electron-builder output (gitignored)
```

## Testing Strategy

Phase 1 uses **E2E tests** (Playwright + Electron) with a **two-tier validation approach**:

| What | How |
|------|-----|
| **E2E tests** | Playwright with Electron support (`_electron.launch`). 10-15 scripted tests covering terminal, sidebar, viewer. |
| **Per-feature validation** | Accessibility tree snapshots for sidebar and viewer components. PTY round-trip assertions for terminal (send command, verify output). |
| **Per-milestone validation** | Playwright screenshots + nano-banana visual comparison against component library. Run at layer completion (after 1A, 1B, 1C). |
| **Test data** | Fixture directories (`e2e/fixtures/`) with `AMPLIFIER_HOME` and `CANVAS_WORKDIR` env overrides |
| **Pre-commit gate** | `npm run build && npx playwright test` — must pass before every commit |

**Terminal validation caveat:** xterm.js renders to an HTML canvas element, which is opaque to the accessibility tree. Terminal validation uses PTY round-trip assertions (functional) + screenshots at milestones (visual). Sidebar and viewer use accessibility tree snapshots for structural validation.

## Build Practices

| Practice | Detail |
|----------|--------|
| **Feature tracking** | `STATE.yaml` — updated after each feature completes |
| **Lessons learned** | `LESSONS.md` — recurring patterns and gotchas captured during build |
| **Feature specs** | Scaled to size: S (inline), M (1-page), L (multi-page with diagrams) |
| **Antagonistic review** | After each component layer (terminal, sidebar, viewer) — dedicated review pass |
| **Pre-commit gate** | Build + full E2E suite before every commit |
| **Stop conditions** | Blocker, ambiguity, repeated failure (3×), coherence loss → stop and escalate |
| **Implementation plans** | `docs/plans/plan-1a-scaffold-terminal.md`, `plan-1b-sidebar.md`, `plan-1c-viewer-integration.md` |

## Confirmed Product Decisions

These were validated through structured product review (not assumed):

| # | Decision | Answer | Principle |
|---|----------|--------|-----------|
| 1 | Desktop vs web | Desktop. One app, double-click, done. | Simplicity of first experience. Web needs a local server + browser tab — two pieces. |
| 2 | Reverse channel (Amplifier → Canvas) | Hook module (canvas-relay) in Phase 1 for Canvas-started sessions. File watching as fallback for external sessions. Every feature works without the hook. | The hook enhances speed and precision. File watching ensures correctness. Dual path gives us both. |
| 3 | What happens when session finishes | Nothing. Terminal stays with last output. User decides. | Visibility layer, not workflow layer. Don't automate what different users would do differently. |
| 4 | Database | SQLite (better-sqlite3) for session lifecycle. Canvas.db at `~/.amplifier/canvas/canvas.db`. | Crash-safe, query-capable, handles schema evolution. Already paying electron-rebuild tax for node-pty. Validated by Grove. |
| 5 | Build tooling | electron-vite + electron-builder. Standard, boring, fast. | One config file handles main/preload/renderer split. |
| 6 | Session lifecycle | User manages sessions. Exit or delete — Canvas doesn't auto-clean. | Sessions are the user's to manage. |
| 7 | File viewer | Essential. Ships with v1. | The viewer is part of the core experience (Act 2), not a nice-to-have. |

## Key Architectural Decisions

### 1. Electron main process IS the backend

No Express server. No separate backend. Electron's main process handles PTY spawning, file watching, and state aggregation. IPC to the renderer is the API. This is simpler than Grove (Express + WebSocket) and simpler than Distro (FastAPI + SSE) because Canvas is local-only — we don't need HTTP, auth, or multi-user.

### 2. Read-only relationship with Amplifier

Canvas never writes to Amplifier's data. Never calls Amplifier APIs. This means:
- No coupling to Amplifier internals (which change across versions)
- No risk of corrupting session state
- Canvas works with any Amplifier version that produces events.jsonl
- If Canvas breaks, Amplifier is unaffected

### 3. PTY-based terminal via node-pty + xterm.js

Canvas spawns `amplifier run` in a pseudo-terminal. The terminal experience is identical to a regular terminal. When a session finishes, the terminal stays with the last output — Canvas doesn't decide what happens next. The user exits or deletes the session when they're done.

### 4. Dual event ingestion: hook module + file watchers

Canvas receives session events through two paths. For sessions Canvas starts, it injects the canvas-relay hook module via the PTY environment. The hook POSTs lifecycle events directly to Canvas's localhost HTTP receiver (~10ms latency). For sessions started externally, Canvas uses sparse chokidar watchers on events.jsonl with tail-read (~500ms latency). Each session has exactly one primary source — no dual-sourcing, no conflicts. Deduplication by byte offset when both paths observe the same event.

### 5. SQLite data layer for session lifecycle

Canvas persists project registry, session lifecycle, byte offsets, and UI preferences in canvas.db (SQLite via better-sqlite3). Session content (events, tool outputs) is still derived from Amplifier's files — never cached. If canvas.db is deleted, Canvas re-derives from a full disk scan (~5 seconds). SQLite provides crash safety (WAL journal), concurrent-read support, and schema migrations that a JSON file would not.

### 6. Session-to-PTY association via hook module

When Canvas auto-starts `amplifier run`, the canvas-relay hook sends `session:start` with the session ID. This provides immediate, reliable session-to-PTY association. For fallback (hook fails to load), Canvas uses before/after directory scan of the project's session directory. Banner regex is not used — it's fragile against terminal formatting changes, ANSI codes, and line wrapping.

### 7. Inactive terminals use visibility:hidden

Learned from Grove. When switching sessions, inactive xterm.js instances are set to `visibility: hidden`, not unmounted or `display: none`. This preserves PTY dimensions (avoids SIGWINCH resize events) and keeps terminal state alive. xterm.js instances are never destroyed during the session lifetime.

## Architecture Comparison

How Canvas differs from the two reference projects:

| Dimension | Grove (Manoj) | Distro/Chat (Sam) | Canvas (Ours) |
|-----------|--------------|-------------------|---------------|
| Backend | Express + SQLite | FastAPI + filesystem | Electron main process (no server) |
| Frontend | React + Zustand | Preact + HTM (no build) | React + Zustand |
| Terminal | xterm.js + node-pty + WebSocket | None (chat UI) | xterm.js + node-pty + IPC |
| Amplifier comms | PTY + hook module reverse channel | REST API + SSE | PTY + hook module (canvas-relay) + file watchers |
| Session state | SQLite DB | In-memory SessionManager | SQLite (lifecycle) + in-memory (content, derived from files) |
| Multi-user | OAuth (GitHub, Google) | PAM auth, proxy trust | None (local desktop) |
| Deployment | Web app + Electron wrapper | Server daemon | Desktop app only |

**Key difference:** Grove and Distro both have backends because they serve web UIs. Canvas doesn't need a backend because Electron's main process handles all OS interaction natively.

## Hook Module: canvas-relay

Canvas includes a lightweight Amplifier hook module (~80 lines) that relays lifecycle events from Amplifier sessions to Canvas's main process.

**How it works:**
1. Canvas spawns a PTY and sets `AMPLIFIER_HOOKS=canvas-relay` in the environment
2. When the user runs `amplifier run`, the hook loads automatically
3. On each lifecycle event (session:start, session:end, tool calls), the hook POSTs to Canvas's localhost HTTP receiver
4. Canvas's state aggregator processes the event and updates canvas.db + Zustand store

**What it provides:**
- Immediate session-to-PTY association (no banner regex)
- Real-time status updates (~10ms vs ~500ms file watching)
- File activity tracking (which files the session created/modified)
- Foundation for Phase 2 intent signals (e.g., "Amplifier wants to show you this file")

**Graceful degradation:** If the hook fails to load (Amplifier version incompatibility, environment issue), Canvas falls back to file watching. Every feature works without the hook. The hook enhances speed and precision — it never gates functionality.

**Scope:** The hook is read-only from Amplifier's perspective. It observes events and relays them. It never modifies Amplifier's behavior, data, or configuration.

## Security

### canvas:// Custom Protocol

The renderer accesses project files via a registered `canvas://` Electron protocol — not `file://` URLs (which would require disabling web security) and not base64 IPC (which bloats memory).

**Security controls:**
- **Path normalization:** `path.resolve()` eliminates `../` traversal before any file access
- **Allowlist:** Only serves files under project paths registered in canvas.db
- **Blocklist:** Explicit rejection of sensitive paths (`~/.ssh/`, `~/.amplifier/keys.env`, `/etc/`)
- **Read-only:** Protocol handler only reads files, never writes

### Markdown Sanitization

The viewer renders markdown with `react-markdown`. All HTML in markdown is sanitized through DOMPurify before rendering. No raw HTML execution in the renderer. This prevents XSS from crafted markdown files in projects.

### Electron Security

- `webSecurity` remains enabled (default) — renderer cannot load `file://` URLs
- `nodeIntegration` is disabled — renderer has no direct Node.js access
- All main process access goes through the preload bridge (`contextBridge.exposeInMainWorld`)
