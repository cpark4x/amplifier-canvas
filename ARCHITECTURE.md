# Amplifier-Canvas Architecture

## The Core Constraint

Canvas is a **visibility layer** over the Amplifier CLI. It does not replace the CLI, extend its capabilities, or own any agent execution. Every piece of data Canvas displays originates from Amplifier's existing artifacts — session files, git state, and file system.

If Canvas crashes, nothing is lost. If Canvas is closed, Amplifier keeps working. Canvas reads; Amplifier writes.

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

**Build tooling:** Vite (fast dev server, fast builds) + electron-builder (packages the app for macOS). Single app, no monorepo needed.

## The Two-Process Architecture

Electron apps have two processes. This isn't a choice — it's how Electron works. But the split maps perfectly to what we need:

```
┌────────────────────────────────────────────────────────┐
│  MAIN PROCESS (Node.js)                                │
│  Everything that touches the OS                        │
│                                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ PTY Manager  │  │ File Watcher │  │ Git Poller   │ │
│  │              │  │              │  │              │ │
│  │ Spawns       │  │ Watches      │  │ Polls every  │ │
│  │ amplifier run│  │ events.jsonl │  │ 5s per       │ │
│  │ via node-pty │  │ via chokidar │  │ project      │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │
│         │                 │                 │          │
│         └────────┬────────┴────────┬────────┘          │
│                  ▼                 │                    │
│  ┌───────────────────────────┐    │                    │
│  │ State Aggregator          │◄───┘                    │
│  │                           │                         │
│  │ Merges PTY process state  │                         │
│  │ + parsed events.jsonl     │                         │
│  │ + git status              │                         │
│  │ into canonical shape      │                         │
│  └─────────────┬─────────────┘                         │
│                │ IPC (ipcMain.handle)                   │
├────────────────┼───────────────────────────────────────┤
│                ▼                                        │
│  RENDERER PROCESS (Chromium)                           │
│  Everything the user sees                              │
│                                                        │
│  ┌───────────────────────────┐                         │
│  │ Zustand Store             │                         │
│  │ (mirrors main process     │                         │
│  │  state via IPC)           │                         │
│  └─────────────┬─────────────┘                         │
│                │                                        │
│    ┌───────────┼───────────────────────────┐           │
│    ▼           ▼                           ▼           │
│  ┌──────┐  ┌──────────────────────┐  ┌──────────┐     │
│  │Sidebar│  │ Terminal (xterm.js)  │  │ Viewer   │     │
│  │      │  │ connected to PTY     │  │ (files,  │     │
│  │      │  │ via IPC passthrough  │  │  preview)│     │
│  └──────┘  └──────────────────────┘  └──────────┘     │
└────────────────────────────────────────────────────────┘
```

**Why this matters:** The main process owns all I/O (filesystem, PTY, git). The renderer owns all UI. They talk via Electron IPC. This gives us:
- Renderer can't corrupt filesystem or kill processes (security)
- Main process doesn't need to know about React (separation)
- IPC messages are the contract between them (testable)

### IPC Contract

The main→renderer channel is the real API of this app:

```typescript
// Main → Renderer (push: state updates)
'state:sessions-changed'     → SessionState[]
'state:git-changed'          → GitState[]
'terminal:data'              → { sessionId: string, data: Buffer }

// Renderer → Main (request: user actions)
'session:start'              → { projectPath: string } → sessionId
'session:switch'             → { sessionId: string }
'session:resume'             → { sessionId: string }
'terminal:input'             → { sessionId: string, data: string }
'terminal:resize'            → { sessionId: string, cols: number, rows: number }
'project:add'                → { path: string }
'project:archive'            → { projectId: string }
'project:unarchive'          → { projectId: string }
```

## Data Architecture

### Three Read-Only Sources

Canvas reads — it never writes to Amplifier's data.

| Source | What it gives us | How we read it | Update mechanism |
|--------|-----------------|----------------|-----------------|
| **Session files** (`~/.amplifier/projects/<slug>/sessions/<id>/events.jsonl`) | Session state, tool calls, agent output, status | Tail-read (track file offset, parse only new bytes) | chokidar file watcher |
| **Git state** (`.git/` in each project) | Branch, recent commits, PR status | `git` CLI commands | Poll every 5 seconds |
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
| `needs_input` | Blue pulsing dot | PTY process alive AND last event is orchestrator waiting for user input (parsed from events.jsonl) |
| `done` | Green dot + checkmark | PTY process exited code 0. Outcome label from last meaningful tool call: `git commit` → "committed", `gh pr create` → "PR #48", `git push` → "pushed" |
| `failed` | Red dot | PTY process exited non-zero, or last event indicates error |
| `paused` | Gray dot | Session file exists on disk but no PTY process running. Can be resumed. |

**The `needs_input` challenge:** This is the hardest status to derive. Amplifier emits an event when it's waiting for user input, but there's a lag between the event being written to disk and our file watcher firing. For sessions started by Canvas (PTY-owned), we can detect this faster by watching the terminal output stream directly. For external sessions, we rely on events.jsonl.

**Future: hook module.** If detection lag becomes a problem, we can ship a lightweight Amplifier hook module (like Grove's `hooks-host-relay`) that signals Canvas directly. The architecture allows this — we'd just add another input to the State Aggregator. Not needed for v1.

## Component Architecture

Components map directly to the storyboard:

```
App
├── AppHeader                    Fixed top bar
│   ├── Logo + "Amplifier Canvas"
│   ├── Breadcrumb (project > session)
│   └── Settings gear
├── Sidebar                      Left panel, resizable
│   ├── ProjectSection[]         One per active project
│   │   ├── ProjectHeader        Name + status summary
│   │   └── SessionRow[]         Dot + name + label
│   ├── ArchivedSection          "▸ Archived (3)"
│   │   └── ProjectSection[]     Same component, collapsed
│   └── AddProjectButton         "+ Add Project"
└── MainArea                     Right of sidebar
    ├── TerminalPane             xterm.js instance
    ├── ViewerPane               File preview (progressive disclosure)
    │   ├── CodeViewer           Syntax highlighted (shiki, not Monaco)
    │   ├── MarkdownViewer       Rendered markdown
    │   └── ImageViewer          Images, screenshots
    └── ProjectOverview          Stats, session history, AI summary
```

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

## State Management

### Zustand Store (Renderer)

```typescript
interface CanvasStore {
  // Projects
  projects: Project[];
  archivedProjects: Project[];
  activeProjectId: string | null;
  activeSessionId: string | null;

  // UI
  sidebarWidth: number;
  viewerVisible: boolean;
  viewerFile: string | null;
  theme: 'light' | 'dark';

  // Actions (dispatch to main process via IPC)
  startSession: (projectPath: string) => void;
  switchSession: (sessionId: string) => void;
  archiveProject: (projectId: string) => void;
  addProject: (path: string) => void;
}

interface Project {
  id: string;
  name: string;
  path: string;
  sessions: Session[];
  gitBranch?: string;
  gitStatus?: string;        // "clean" | "3 uncommitted"
  lastActivity: Date;
}

interface Session {
  id: string;
  name: string;
  status: 'running' | 'needs_input' | 'done' | 'failed' | 'paused';
  startedAt: Date;
  elapsed?: string;          // "48m" for running sessions
  outcome?: string;          // "PR #48" for done sessions
  error?: string;            // for failed sessions
  isPtyOwned: boolean;       // true = Canvas started it, false = found on disk
}
```

**State flow is unidirectional:**
1. Main process detects change (file watcher, PTY event, git poll)
2. Main process updates State Aggregator
3. State Aggregator sends canonical state via IPC
4. Renderer Zustand store updates
5. React re-renders affected components

The renderer never reads files or talks to processes. It renders state and dispatches user actions.

## What Canvas Owns vs. Derives

| Canvas owns (persisted) | Canvas derives (in-memory, reconstructed on restart) |
|------------------------|------------------------------------------------------|
| Project list + paths | Session state and status |
| Archive/active state per project | Git branch and status |
| UI preferences (sidebar width, theme) | File trees and previews |
| Window position and size | Session elapsed time |
| Active session selection | Outcome labels ("PR #48") |

**Persistence:** `~/.amplifier/canvas/config.json` — just the "owns" column. Everything else is re-derived from Amplifier's files on startup.

## Confirmed Product Decisions

These were validated through structured product review (not assumed):

| # | Decision | Answer | Principle |
|---|----------|--------|-----------|
| 1 | Desktop vs web | Desktop. One app, double-click, done. | Simplicity of first experience. Web needs a local server + browser tab — two pieces. |
| 2 | Reverse channel (Amplifier → Canvas) | Design for it, don't build it yet. File watching for v1. | Sidebar is a glanceable dashboard, not a real-time ticker. Half-second delay is invisible. |
| 3 | What happens when session finishes | Nothing. Terminal stays with last output. User decides. | Visibility layer, not workflow layer. Don't automate what different users would do differently. |
| 4 | Database | No database for v1. Design so we can add one later. | Core value is sidebar + terminal. Nobody skips Canvas because they can't rename a session. |
| 5 | Build tooling | Vite + electron-builder. Standard, boring, fast. | One app, no monorepo. |
| 6 | Session lifecycle | User manages sessions. Exit or delete — Canvas doesn't auto-clean. | Sessions are the user's to manage. |
| 7 | File viewer | Essential. Ships with v1. | The viewer is part of the core experience (Act 2), not a nice-to-have. |

## Key Architectural Decisions

### 1. Electron main process IS the backend

No Express server. No separate backend. Electron's main process handles PTY spawning, file watching, git polling, and state aggregation. IPC to the renderer is the API. This is simpler than Grove (Express + WebSocket) and simpler than Distro (FastAPI + SSE) because Canvas is local-only — we don't need HTTP, auth, or multi-user.

### 2. Read-only relationship with Amplifier

Canvas never writes to Amplifier's data. Never calls Amplifier APIs. This means:
- No coupling to Amplifier internals (which change across versions)
- No risk of corrupting session state
- Canvas works with any Amplifier version that produces events.jsonl
- If Canvas breaks, Amplifier is unaffected

### 3. PTY-based terminal via node-pty + xterm.js

Canvas spawns `amplifier run` in a pseudo-terminal. The terminal experience is identical to a regular terminal. When a session finishes, the terminal stays with the last output — Canvas doesn't decide what happens next. The user exits or deletes the session when they're done.

### 4. File watchers + tail-read for reactivity

chokidar watches events.jsonl files. On change, we tail-read (parse only new bytes from last offset). Near-instant UI updates. Git state is polled at 5s intervals (no watch mechanism for git).

### 5. All state derived, nothing cached

If Canvas restarts, it re-derives everything from Amplifier's files. No SQLite database (unlike Grove), no index files. Just config.json for Canvas's own preferences + project list. This means zero sync bugs, zero migration problems, zero stale state.

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

## File Structure (Planned)

```
amplifier-canvas/
├── VISION.md
├── OUTCOMES.md
├── STORYBOARD.md
├── ARCHITECTURE.md
├── SCORECARD.md
├── canvas.html                    # Design reference (22 screens)
├── src/
│   ├── main/                      # Electron main process
│   │   ├── index.ts               # App entry, window creation
│   │   ├── ipc.ts                 # IPC handler registration
│   │   ├── pty-manager.ts         # PTY spawning and lifecycle
│   │   ├── session-watcher.ts     # chokidar on events.jsonl
│   │   ├── git-poller.ts          # Git status polling
│   │   ├── state-aggregator.ts    # Merges all sources → canonical state
│   │   └── config.ts              # Read/write config.json
│   ├── renderer/                  # React app
│   │   ├── App.tsx                # Root component
│   │   ├── store.ts               # Zustand store
│   │   ├── components/
│   │   │   ├── Sidebar/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── ProjectSection.tsx
│   │   │   │   ├── SessionRow.tsx
│   │   │   │   └── ArchivedSection.tsx
│   │   │   ├── Terminal/
│   │   │   │   └── TerminalPane.tsx
│   │   │   ├── Viewer/
│   │   │   │   ├── ViewerPane.tsx
│   │   │   │   ├── CodeViewer.tsx
│   │   │   │   └── MarkdownViewer.tsx
│   │   │   └── Header/
│   │   │       └── AppHeader.tsx
│   │   └── hooks/
│   │       ├── useIPC.ts          # IPC communication hook
│   │       └── useTerminal.ts     # xterm.js lifecycle hook
│   ├── shared/                    # Types shared across processes
│   │   └── types.ts               # Project, Session, IPC message types
│   └── preload/
│       └── preload.ts             # Electron preload (exposes IPC to renderer)
├── package.json
├── electron.config.ts
└── tsconfig.json
```

## Designed For: Reverse Channel (not built, but accounted for)

The State Aggregator accepts state from file watchers today. It is designed to accept state from additional sources without changing the renderer or any UI component. When any of these become necessary, we add an input — not a new architecture:

**Scenario 1: Instant status updates.** A lightweight Amplifier hook module (like Grove's `hooks-host-relay`) POSTs lifecycle events directly to Canvas. The State Aggregator accepts them alongside file watcher events. Status dots update instantly instead of within ~0.5s.

**Scenario 2: Amplifier opens a file in the viewer.** This is Act 2.2 — the AI decides you should see a file. File watching can detect this in events.jsonl, but a reverse channel makes it feel instant and intentional. The hook module sends `{action: "open-file", path: "VISION.md"}` and the State Aggregator routes it to the viewer.

**Scenario 3: Future web companion.** If we ever want a lightweight web view to check on sessions remotely, the State Aggregator can push state via WebSocket instead of (or in addition to) Electron IPC. The renderer components don't change — they consume the same Zustand store shape regardless of transport.

```python
# amplifier-module-canvas-relay (future)
# Hook that notifies Canvas directly when session state changes
# Canvas sets CANVAS_IPC_PORT env var when spawning PTY
# Hook POSTs to localhost:<port>/events — fire and forget
```

**Why not build it now?** File watching is sufficient for v1's glanceable sidebar. The reverse channel adds a second piece (plugin installed in Amplifier) and a coupling to Amplifier's hook API. We save that complexity for when a real user need demands it.

## Designed For: Local Store (not built, but accounted for)

Canvas has no database in v1. All state is derived from Amplifier's files. `config.json` stores only what Canvas itself owns (project list, UI preferences).

If users ask for features that require Canvas-specific data — session nicknames, starred sessions, notes, custom groupings — we add a small local store (SQLite or flat JSON). The Zustand store already separates "derived state" from "owned state" in its type definitions. Adding persisted Canvas data means extending the "owned" side without touching the "derived" side.
