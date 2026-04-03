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
| **Sidebar** | Session list, status dots (running/needs_input/done/failed/paused), project grouping from disk structure, real-time updates via chokidar |
| **Viewer** | File browser, markdown rendering (react-markdown), code syntax highlighting (shiki), image preview |
| **Integration** | Session-viewer wiring, terminal persistence across session switches, design token alignment with component library |

**Phase 2 — Designed for, not built:**

| Feature | Why deferred |
|---------|-------------|
| Git Poller (5s per project) | No Phase 1 feature depends on git state. Architecture has a slot for it in the State Aggregator. |
| AppHeader (logo, breadcrumb, settings) | Chrome, not core. Phase 1 uses the window title bar. |
| Reverse channel hook (Amplifier → Canvas) | File watching is sufficient for the glanceable sidebar. Adds coupling to Amplifier's hook API. |
| Local store / database | All state derives from Amplifier's files. config.json covers Canvas preferences. |
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

**Why not Tauri?** xterm.js requires a full browser runtime. Tauri uses native webviews that don't guarantee this. The terminal is the primary workspace — can't compromise.

**Why not a web app?** The terminal is the primary workspace. Canvas embeds it. A web app would need a local server to spawn CLI processes and pipe them to the browser (that's what Grove does — Express + WebSocket). Two pieces to install and keep running instead of one app you double-click. Desktop wins on simplicity of the first experience: download, open, you're in. If Canvas ever needs web access (check on sessions from your phone, share a view with teammates), the path is a lightweight web companion — not replacing the desktop app.

**Why not amplifierd (Distro's server)?** Different product. Distro is a multi-user server with REST+SSE. Canvas is a local desktop app. We don't need auth, HTTP APIs, or a daemon. If amplifierd matures into the standard way to run Amplifier, Canvas could adopt it later — the architecture allows this because Canvas never couples to *how* it gets data, only *what shape* the data is.

**Build tooling:** electron-vite (handles the main/preload/renderer split cleanly with one config file) + electron-builder (packages the app for macOS). Single app, no monorepo needed.

## The Two-Process Architecture

Electron apps have two processes. This isn't a choice — it's how Electron works. But the split maps perfectly to what we need:

```
┌────────────────────────────────────────────────────────────┐
│  MAIN PROCESS (Node.js)                                    │
│  Everything that touches the OS                            │
│                                                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ PTY Manager  │  │ File Watcher │  │ Git Poller   │     │
│  │              │  │              │  │  (Phase 2)   │     │
│  │ Spawns       │  │ Watches      │  │              │     │
│  │ amplifier run│  │ events.jsonl │  │ Polls every  │     │
│  │ via node-pty │  │ via chokidar │  │ 5s per       │     │
│  │              │  │              │  │ project      │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                 │                 │              │
│         └────────┬────────┴────────┬────────┘              │
│                  ▼                 │                        │
│  ┌───────────────────────────────┐ │                       │
│  │ State Aggregator              │◄┘                       │
│  │                               │                         │
│  │ Merges PTY process state      │                         │
│  │ + parsed events.jsonl         │                         │
│  │ + git status (Phase 2)        │                         │
│  │ into canonical shape          │                         │
│  └─────────────┬─────────────────┘                         │
│                │ IPC (ipcMain.handle)                       │
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
'files:read-image'           → { path: string } → string (base64)
```

Phase 2 additions (slots exist, not wired):
```typescript
'state:git-changed'          → GitState[]
'session:start'              → { projectPath: string } → sessionId
'session:switch'             → { sessionId: string }
'session:resume'             → { sessionId: string }
'project:add'                → { path: string }
'project:archive'            → { projectId: string }
```

## Data Architecture

### Three Read-Only Sources

Canvas reads — it never writes to Amplifier's data.

| Source | What it gives us | How we read it | Update mechanism |
|--------|-----------------|----------------|-----------------|
| **Session files** (`~/.amplifier/projects/<slug>/sessions/<id>/events.jsonl`) | Session state, tool calls, agent output, status | Tail-read (track file offset, parse only new bytes) | chokidar file watcher |
| **Git state** (`.git/` in each project) | Branch, recent commits, PR status | `git` CLI commands | Poll every 5 seconds *(Phase 2)* |
| **File system** (project working directory) | Files created/modified by sessions | Directory listing | On-demand (when viewer opens) |

**Why tail-read for events.jsonl?** These files grow to megabytes. We track the byte offset of our last read and only parse new content. On startup, we read the last ~50 events (enough to derive current status) not the full file. Learned from both Grove and Distro — neither reads full event files.

### Session Discovery

**On startup:** Scan `~/.amplifier/projects/` for all session directories. Parse metadata (not full events). Group by working directory → project. This finds sessions from before Canvas was installed.

**During runtime:** Two signals for new sessions:
1. **PTY sessions** (started by Canvas): We know immediately because we spawned the process. Capture the session ID from Amplifier's startup banner in the PTY output (regex match, like Grove does).
2. **External sessions** (started from a regular terminal): chokidar watches `~/.amplifier/projects/` for new session directories.

### Status Derivation

| Status | Visual | How derived |
|--------|--------|------------|
| `running` | Amber pulsing dot | PTY process alive AND producing output |
| `needs_input` | Blue pulsing dot | Last event is `prompt:complete` (AI finished, waiting for user) |
| `done` | Green dot + checkmark | `session:end` event present |
| `failed` | Red dot | PTY process exited non-zero, or last event indicates error |
| `paused` | Gray dot | Session file exists on disk but no PTY process running. Can be resumed. |

**The `needs_input` challenge:** This is the hardest status to derive. Amplifier emits an event when it's waiting for user input, but there's a lag between the event being written to disk and our file watcher firing. For sessions started by Canvas (PTY-owned), we can detect this faster by watching the terminal output stream directly. For external sessions, we rely on events.jsonl.

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

### Viewer: Shiki, Not Monaco

Monaco is 5MB+ and designed for editing. We need read-only viewing.

- **Code:** Shiki (same highlighter as VS Code, ~200KB, read-only, accurate)
- **Markdown:** `react-markdown` with GitHub-flavored markdown
- **Images:** Native `<img>` tag
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
  status: 'running' | 'needs_input' | 'done' | 'failed' | 'paused';
  startedAt: string;
  isPtyOwned: boolean;       // true = Canvas started it, false = found on disk
}
```

**State flow is unidirectional:**
1. Main process detects change (file watcher, PTY event)
2. Main process updates State Aggregator
3. State Aggregator sends canonical state via IPC
4. Renderer Zustand store updates
5. React re-renders affected components

The renderer never reads files or talks to processes. It renders state and dispatches user actions.

## What Canvas Owns vs. Derives

| Canvas owns (persisted) | Canvas derives (in-memory, reconstructed on restart) |
|------------------------|------------------------------------------------------|
| UI preferences (sidebar width, theme) | Session state and status |
| Window position and size | File trees and previews |
| Active session selection | Session elapsed time |

**Persistence:** `~/.amplifier/canvas/config.json` — just the "owns" column. Everything else is re-derived from Amplifier's files on startup. No database.

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
│   │   └── file-reader.ts         # Read files for viewer (list-dir, read-text, read-image)
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

Phase 1 uses **E2E tests only** (Playwright + Electron). No unit tests, no component tests — yet.

| What | How |
|------|-----|
| **Test runner** | Playwright with Electron support (`_electron.launch`) |
| **Test count** | 10–15 E2E tests covering the 9 terminal regression requirements + sidebar + viewer |
| **Test data** | Fixture directories (`e2e/fixtures/`) with `AMPLIFIER_HOME` and `CANVAS_WORKDIR` env overrides |
| **Pre-commit gate** | `npm run build && npx playwright test` — must pass before every commit |

**When we add more testing layers:**
- **Unit tests:** When data logic (state-aggregator, status derivation, slug decoding) exceeds ~2,000 LOC
- **Component tests:** When component count exceeds ~15

This is deliberate — E2E tests catch integration bugs that unit tests miss, and Phase 1 is small enough that E2E coverage is sufficient.

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
| 2 | Reverse channel (Amplifier → Canvas) | Design for it, don't build it yet. File watching for v1. | Sidebar is a glanceable dashboard, not a real-time ticker. Half-second delay is invisible. |
| 3 | What happens when session finishes | Nothing. Terminal stays with last output. User decides. | Visibility layer, not workflow layer. Don't automate what different users would do differently. |
| 4 | Database | No database for v1. Design so we can add one later. | Core value is sidebar + terminal. Nobody skips Canvas because they can't rename a session. |
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

### 4. File watchers + tail-read for reactivity

chokidar watches events.jsonl files. On change, we tail-read (parse only new bytes from last offset). Near-instant UI updates. 500ms debounce on watcher updates keeps things responsive without thrashing.

### 5. All state derived, nothing cached

If Canvas restarts, it re-derives everything from Amplifier's files. No SQLite database, no index files. Just config.json for Canvas's own preferences. This means zero sync bugs, zero migration problems, zero stale state.

### 6. Session ID capture from terminal banner

Like Grove, we regex-match Amplifier's startup banner in the PTY output to capture the session ID. This is faster than filesystem scanning and gives us immediate session-to-PTY association. We store the mapping in memory (not persisted — re-derived on restart).

### 7. Inactive terminals use visibility:hidden

Learned from Grove. When switching sessions, inactive xterm.js instances are set to `visibility: hidden`, not unmounted or `display: none`. This preserves PTY dimensions (avoids SIGWINCH resize events) and keeps terminal state alive. xterm.js instances are never destroyed during the session lifetime.

## Architecture Comparison

How Canvas differs from the two reference projects:

| Dimension | Grove (Manoj) | Distro/Chat (Sam) | Canvas (Ours) |
|-----------|--------------|-------------------|---------------|
| Backend | Express + SQLite | FastAPI + filesystem | Electron main process (no server) |
| Frontend | React + Zustand | Preact + HTM (no build) | React + Zustand |
| Terminal | xterm.js + node-pty + WebSocket | None (chat UI) | xterm.js + node-pty + IPC |
| Amplifier comms | PTY + hook module reverse channel | REST API + SSE | PTY + file watchers |
| Session state | SQLite DB | In-memory SessionManager | In-memory, derived from files |
| Multi-user | OAuth (GitHub, Google) | PAM auth, proxy trust | None (local desktop) |
| Deployment | Web app + Electron wrapper | Server daemon | Desktop app only |

**Key difference:** Grove and Distro both have backends because they serve web UIs. Canvas doesn't need a backend because Electron's main process handles all OS interaction natively.

## Designed For: Reverse Channel (Phase 2 — not built, architecture accounts for it)

The State Aggregator accepts state from file watchers today. It is designed to accept state from additional sources without changing the renderer or any UI component. When any of these become necessary, we add an input — not a new architecture:

**Scenario 1: Instant status updates.** A lightweight Amplifier hook module (like Grove's `hooks-host-relay`) POSTs lifecycle events directly to Canvas. The State Aggregator accepts them alongside file watcher events. Status dots update instantly instead of within ~0.5s.

**Scenario 2: Amplifier opens a file in the viewer.** The AI decides you should see a file. File watching can detect this in events.jsonl, but a reverse channel makes it feel instant and intentional. The hook module sends `{action: "open-file", path: "VISION.md"}` and the State Aggregator routes it to the viewer.

**Why not build it now?** File watching is sufficient for Phase 1's glanceable sidebar. The reverse channel adds a second piece (plugin installed in Amplifier) and a coupling to Amplifier's hook API. We save that complexity for when a real user need demands it.

## Designed For: Local Store (Phase 2 — not built, architecture accounts for it)

Canvas has no database in Phase 1. All state is derived from Amplifier's files. `config.json` stores only what Canvas itself owns (UI preferences).

If users ask for features that require Canvas-specific data — session nicknames, starred sessions, notes, custom groupings — we add a small local store (SQLite or flat JSON). The Zustand store already separates "derived state" from "owned state" in its type definitions. Adding persisted Canvas data means extending the "owned" side without touching the "derived" side.
