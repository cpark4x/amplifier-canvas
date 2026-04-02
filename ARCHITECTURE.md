# Amplifier-Canvas Architecture

## The Core Constraint

Canvas is a **visibility layer** over the Amplifier CLI. It does not replace the CLI, extend its capabilities, or own any agent execution. Every piece of data Canvas displays originates from Amplifier's existing artifacts — session files, git state, and file system.

This means: if Canvas crashes, nothing is lost. If Canvas is closed, Amplifier keeps working. Canvas reads; Amplifier writes.

## Tech Stack

**Electron + React + TypeScript**

| Choice | Why |
|--------|-----|
| Electron | Desktop app that can spawn CLI processes, access the file system, and embed a terminal emulator. Cross-platform (macOS first, Windows/Linux follow). |
| React | Component model maps directly to our UI: sidebar, terminal, viewer panels. Large ecosystem for terminal emulators (xterm.js) and file viewers. |
| TypeScript | Type safety for the data flow between Amplifier artifacts and UI state. |

**Why not Tauri?** Tauri is lighter, but xterm.js (our terminal emulator) requires a full browser runtime. Electron gives us that natively. The terminal is the primary workspace — we can't compromise on it.

**Why not a web app?** Canvas needs to spawn local CLI processes, watch the local file system, and access git repos. A web app would require a local server bridging all of this. Electron gives us direct access.

## Component Architecture

```
┌─────────────────────────────────────────────────────┐
│  Electron Shell                                     │
│  ┌─────────────────────────────────────────────────┐│
│  │  App Header                                     ││
│  │  [Logo] Amplifier Canvas          [Layout] [⚙]  ││
│  ├────────────┬────────────────────────────────────┤│
│  │  Sidebar   │  Main Area                         ││
│  │            │  ┌────────────────────────────────┐││
│  │  Projects  │  │  Pane Title                    │││
│  │  ┌──────┐  │  ├────────────────────────────────┤││
│  │  │Proj A│  │  │                                │││
│  │  │ sess │  │  │  Terminal (xterm.js)            │││
│  │  │ sess │  │  │  — or —                        │││
│  │  │Proj B│  │  │  Viewer (file preview)          │││
│  │  │ sess │  │  │  — or —                        │││
│  │  │      │  │  │  Project Overview               │││
│  │  │──────│  │  │                                │││
│  │  │▸ Arch│  │  │                                │││
│  │  │ (3)  │  │  │                                │││
│  │  └──────┘  │  └────────────────────────────────┘││
│  └────────────┴────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

### Components

| Component | Responsibility | Data Source |
|-----------|---------------|-------------|
| **AppHeader** | Logo, app name, layout toggle, settings | App config |
| **Sidebar** | Project list, session rows, status dots, archived section | SessionStore |
| **ProjectSection** | One project's sessions, expand/collapse | SessionStore |
| **SessionRow** | One session: dot + name + status label | SessionStore |
| **ArchivedSection** | Collapsed chevron with count | SessionStore |
| **TerminalPane** | xterm.js instance connected to Amplifier CLI process | PTY process |
| **ViewerPane** | File preview (syntax highlight, markdown render, images) | File system |
| **ProjectOverview** | Project-level stats, AI summary, session history | Session files + git |
| **PaneTitle** | Shows current session name + project context | UI state |

## Data Architecture

### Where does Canvas get its data?

Canvas reads — it never writes to Amplifier's data. There are three data sources:

```
┌──────────────────────┐
│  1. Session Files     │  ~/.amplifier/sessions/<id>/events.jsonl
│     (Amplifier owns)  │  → session state, tool calls, agent output
├──────────────────────┤
│  2. Git State         │  .git/ in each project repo
│     (git owns)        │  → branches, commits, PR status, diffs
├──────────────────────┤
│  3. File System       │  project working directory
│     (OS owns)         │  → files created/modified by sessions
└──────────────────────┘
         │
         ▼
┌──────────────────────┐
│  SessionStore         │  In-memory reactive state
│  (Canvas owns)        │  → derived from sources above
│                       │  → drives all UI components
└──────────────────────┘
```

### SessionStore (the single source of truth for UI)

The SessionStore is a reactive in-memory store that aggregates data from all three sources into the shape the UI needs.

```typescript
interface SessionStore {
  projects: Project[];
  archivedProjects: Project[];
}

interface Project {
  id: string;
  name: string;           // repo directory name
  path: string;           // absolute path to repo
  sessions: Session[];
  isActive: boolean;      // has any running/pending sessions
  lastActivity: Date;
}

interface Session {
  id: string;
  name: string;           // user-given or derived from first prompt
  status: SessionStatus;
  startedAt: Date;
  elapsedTime?: string;   // for running sessions: "48m"
  outcome?: string;       // for completed: "PR #48", "committed", "merged"
  error?: string;         // for failed: "test failed"
}

type SessionStatus =
  | 'running'             // amber pulsing dot
  | 'needs_input'         // blue pulsing dot
  | 'done'                // green static dot + checkmark
  | 'failed';             // red static dot
```

### Data Flow

```
Amplifier CLI writes events.jsonl
         │
         ▼
File watcher (chokidar) detects change
         │
         ▼
Session parser reads new events
         │
         ▼
SessionStore updates reactive state
         │
         ▼
React re-renders affected components
```

**Polling vs watching:** We use file watchers (chokidar) on `events.jsonl` files, not polling. When Amplifier writes a new event, the watcher fires, we parse the tail of the file, and update state. For git status, we poll on a 5-second interval (git has no native watch mechanism).

### How status is derived

| Status | Derived from |
|--------|-------------|
| `running` | Session process is alive (PID exists) AND last event is not terminal |
| `needs_input` | Last event in events.jsonl is a user prompt request (agent is waiting) |
| `done` | Session process exited with code 0. Outcome derived from last tool calls (git commit → "committed", gh pr create → "PR #N", git merge → "merged") |
| `failed` | Session process exited with non-zero code, or last event indicates failure |

### How session-to-project mapping works

Canvas needs to know which sessions belong to which project. Amplifier sessions store the working directory in their metadata. Canvas groups sessions by project path:

```
Session events.jsonl → read metadata → extract working_directory
  /Users/chris/repos/canvas-app    → Canvas-App project
  /Users/chris/repos/api-service   → API-Service project
  /Users/chris/repos/amplifier-docs → Amplifier-Docs project
```

## Process Architecture

Canvas manages Amplifier CLI processes — it doesn't embed Amplifier as a library.

```
┌──────────────────────────────────────────────────┐
│  Electron Main Process                            │
│  ├── Window management                            │
│  ├── File watchers (chokidar on events.jsonl)     │
│  ├── Git poller (5s interval per project)         │
│  ├── PTY manager (node-pty)                       │
│  │   ├── PTY 1: amplifier run (Canvas-App)        │
│  │   ├── PTY 2: amplifier run (API-Service)       │
│  │   └── PTY 3: amplifier run (Amplifier-Docs)    │
│  └── Session discovery (scan ~/.amplifier/sessions)│
├──────────────────────────────────────────────────┤
│  Electron Renderer Process                        │
│  ├── React app                                    │
│  ├── SessionStore (reactive state)                │
│  ├── Sidebar components                           │
│  ├── xterm.js (terminal emulator, one per PTY)    │
│  └── Viewer components (Monaco, markdown, images) │
└──────────────────────────────────────────────────┘
```

**Each session is a PTY process.** When the user starts a session in Canvas, we spawn `amplifier run` in a pseudo-terminal via node-pty. xterm.js in the renderer connects to that PTY. The user types in xterm.js; keystrokes go to the PTY; Amplifier CLI responds; output flows back to xterm.js.

**Background sessions.** All PTYs stay alive regardless of which session is currently displayed. Switching sessions in the sidebar just swaps which PTY's output is piped to xterm.js. The others keep running.

## What Canvas Owns vs. Derives

| Canvas owns | Canvas derives |
|-------------|---------------|
| Which projects the user has added | Session state (from events.jsonl) |
| Project archive/active state | Session status labels (from events + process state) |
| UI preferences (layout, theme) | File tree and previews (from file system) |
| Window size and position | Git state (from git CLI) |
| Which session is currently displayed | Session elapsed time (from process start time) |

Canvas persists its own config at `~/.amplifier/canvas/config.json`:

```json
{
  "projects": [
    { "name": "Canvas-App", "path": "/Users/chris/repos/canvas-app", "archived": false },
    { "name": "API-Service", "path": "/Users/chris/repos/api-service", "archived": false },
    { "name": "Amplifier-Docs", "path": "/Users/chris/repos/amplifier-docs", "archived": true }
  ],
  "activeSession": "session_abc123",
  "window": { "width": 1400, "height": 900, "x": 100, "y": 100 },
  "theme": "light"
}
```

## Key Architectural Decisions

### Decision 1: Read-only relationship with Amplifier

Canvas never writes to Amplifier's data. It never calls Amplifier APIs. It reads files that Amplifier produces. This means:
- No coupling to Amplifier's internal APIs (which change)
- No risk of Canvas corrupting session state
- Canvas works with any version of Amplifier that produces events.jsonl

### Decision 2: PTY-based terminal, not embedded Amplifier

Canvas spawns `amplifier run` as a CLI process in a PTY, not as a library. This means:
- The terminal experience is identical to using Amplifier in a regular terminal
- Canvas doesn't need to understand Amplifier's internals
- Users can still open a regular terminal alongside Canvas

### Decision 3: File watchers for reactivity

Instead of polling, Canvas watches events.jsonl files for changes. This gives near-instant UI updates when sessions produce output. Git state is the exception — polled at 5s intervals because git has no watch API.

### Decision 4: SessionStore as derived state

All UI state is derived from three sources (session files, git, file system). Canvas never caches or duplicates this data beyond what's in memory. If Canvas restarts, it re-derives everything from source. This means no sync bugs, no stale state, no migration problems.

## Open Questions

1. **How do we discover existing sessions on startup?** Scan `~/.amplifier/sessions/` for all session directories, parse their metadata, group by project path. What about sessions from before Canvas was installed?

2. **How do we handle session events.jsonl parsing efficiently?** These files can be very large (100k+ token lines). We need to tail-read, not full-read. Only parse new events since last read.

3. **What's the viewer component stack?** Monaco for code? A lighter syntax highlighter? Markdown renderer? How do we handle binary files, images, PDFs?

4. **How does "Add Project" work?** File picker → select repo directory → Canvas adds it to config → starts watching for sessions in that directory.

5. **How does archiving work?** User action (right-click → archive) or automatic when all sessions are done? Canvas just moves the project entry in config.json from active to archived.
