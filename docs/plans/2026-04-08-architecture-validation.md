# Architecture Validation Design

## Goal

Validate the existing Canvas architecture (Electron + React + Zustand), pressure-test decisions, and codify two changes: (1) defer the hook module (canvas-relay) from Phase 1, (2) add session-to-file awareness to the IPC contract.

## Background

Amplifier Canvas is a desktop workspace companion for the Amplifier CLI. Before beginning Phase 1C (Viewer) and Phase 1D (Integration), we walked through each architectural layer to confirm decisions or surface changes. Two material changes emerged; everything else was confirmed as-is.

## Approach

Section-by-section review of six architectural layers: stack & foundation, event ingestion, data layer, component architecture & IPC, Phase 1 scope, and testing strategy. Each section was validated before moving to the next. Changes were only accepted when they improved the Phase 1 delivery path or addressed a user experience gap.

## Architecture

### Section 1: Stack & Foundation (Confirmed)

| Choice | Decision | Rationale |
|--------|----------|-----------|
| Platform | Electron | node-pty needs OS access, xterm.js needs full browser. Desktop-first. |
| UI | React 18 | Component model maps to three-panel layout. Ecosystem for xterm.js, markdown, syntax highlighting. |
| State | Zustand | Flat store, no boilerplate. Proven by Grove in identical use case. |
| Types | TypeScript | Type safety across the IPC boundary. |
| Build | electron-vite | Single config handles main/preload/renderer split. |
| Package | electron-builder | macOS first. |
| DB | better-sqlite3 | Crash-safe lifecycle persistence. Incremental cost -- electron-rebuild already required for node-pty. |
| Code viewer | highlight.js | Pure JS, no WASM. Eliminates Shiki build risk. Good enough for read-only. |
| Markdown | react-markdown + DOMPurify | GitHub-flavored markdown with HTML sanitization. |

Two-process model: main process owns all OS interaction (PTY, filesystem, SQLite), renderer owns all UI (React, xterm.js, Zustand). They communicate via typed IPC through a preload bridge.

### Section 2: Event Ingestion (CHANGED -- Single Path for Phase 1)

The original architecture specified dual event ingestion: hook module (canvas-relay) for Canvas-started sessions and chokidar file watchers for external sessions, with deduplication by byte offset. This has been revised to a single path for Phase 1.

**Phase 1: File watching only.**

- On startup: scan `~/.amplifier/projects/` to discover all session directories. Parse metadata, group by project. Populate canvas.db.
- For Canvas-started sessions: Canvas spawns the PTY and knows the project path. It watches that project's session directory for the new session to appear, then tail-reads events.jsonl.
- For external sessions: sparse chokidar watchers on `~/.amplifier/projects/` detect new session directories. Same tail-read mechanism.
- Status derivation: new bytes in events.jsonl within last 30s = running. `session:end` event = done. Non-zero PTY exit = failed. Last event is assistant message with no pending tool calls = needs_input.

Latency: ~500ms for status updates. Acceptable for status dots.

Session-to-PTY association: Canvas spawns the PTY, knows the project path, watches for new session directory. Before/after directory listing gives reliable association.

**Deferred to Phase 2:** hook module (canvas-relay), HTTP receiver in main process, dual-path deduplication logic. The architecture keeps the slot -- the state aggregator interface accepts events from any source.

### Section 3: Data Layer (Confirmed)

Canvas derives (read-only, never persisted by Canvas):
- Session content -- events, tool outputs, agent messages (from events.jsonl)
- File trees and file content (from project working directory)
- Terminal output (from PTY stream)
- Git state (Phase 2, from .git/)

Canvas owns (persisted in canvas.db via better-sqlite3):
- Project registry -- which project paths Canvas knows about
- Session lifecycle -- startedBy (canvas/external), startedAt, endedAt, status
- Byte offsets -- last read position in each events.jsonl
- UI preferences -- sidebar width, last selected session, collapsed state

Location: `~/.amplifier/canvas/canvas.db`

Recovery: If canvas.db is deleted, Canvas re-derives from full disk scan of `~/.amplifier/projects/` (~5 seconds).

Future note: UI preferences may migrate to a separate JSON file (`~/.amplifier/canvas/preferences.json`) so they survive database resets. Not a Phase 1 concern.

### Section 4: Component Architecture & IPC (CHANGED -- Added Session-File Awareness)

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

Terminal never unmounts. Switching uses `visibility:hidden` to preserve PTY dimensions. Viewer appears when session is selected.

**Revised IPC contract (Phase 1):**

```typescript
// Main → Renderer (push: state updates)
'state:sessions-changed'     → SessionState[]
'terminal:data'              → { sessionId: string, data: Buffer }
'session:files-changed'      → { sessionId: string, files: FileActivity[] }  // NEW

// Renderer → Main (request: user actions)
'terminal:input'             → { sessionId: string, data: string }
'terminal:resize'            → { sessionId: string, cols: number, rows: number }

// Renderer → Main (invoke/handle: request-response)
'files:list-dir'             → { path: string } → FileEntry[]
'files:read-text'            → { path: string } → string
```

The new `session:files-changed` channel and `recentFiles` field in SessionState enable the viewer to show which files a session created/modified -- the key feature that makes Canvas an upgrade over a bare terminal with VS Code.

**Extended SessionState:**

```typescript
interface SessionState {
  id: string;
  projectSlug: string;
  projectName: string;
  status: 'running' | 'needs_input' | 'done' | 'failed' | 'active';
  startedAt: string;
  startedBy: 'canvas' | 'external';
  byteOffset: number;
  recentFiles: FileActivity[];  // NEW - files touched by this session
}

interface FileActivity {
  path: string;
  operation: 'read' | 'write' | 'edit' | 'create' | 'delete';
  timestamp: string;
}
```

Seven IPC messages total (6 original + 1 new).

## Components

### Terminal (T1-T5) -- Unchanged

- T1: Electron shell (window, menu, lifecycle)
- T2: xterm.js terminal instance
- T3: Bidirectional PTY pipe via node-pty
- T4: `amplifier canvas` CLI launch command
- T5: Keyboard fidelity (Ctrl+C, Ctrl+D, arrows, tab)

### Sidebar (S1-S5) -- Simplified

- S1: Sidebar shell (220px, collapsible)
- S2: Session list from canvas.db
- S3: Status dots (running/needs_input/done/failed/active)
- S4: Project grouping from disk structure
- S5: Real-time updates via chokidar file watchers (no hook module, single path)

### Viewer (V1-V5) -- Unchanged

- V1: Viewer panel shell (conditional, ~350px)
- V2: File browser (list-dir, navigate)
- V3: Markdown rendering (react-markdown + DOMPurify)
- V4: Code syntax highlighting (highlight.js)
- V5: Image preview (canvas:// protocol)

### Integration (I1-I3) -- I1 Expanded

- I1: Session-viewer wiring (now includes file activity extraction from events.jsonl -- the `recentFiles` field in SessionState)
- I2: Terminal persistence across session switches (visibility:hidden)
- I3: Design token alignment with canvas.html component library

## Data Flow

1. **Startup:** Main process scans `~/.amplifier/projects/`, populates canvas.db, pushes `state:sessions-changed` to renderer.
2. **Session creation:** User starts session in Canvas. Main spawns PTY, watches for new session directory. Before/after directory listing associates session to PTY.
3. **Live updates:** Chokidar watches events.jsonl files. New bytes are tail-read, parsed for status and file activity. Main pushes `state:sessions-changed` and `session:files-changed` to renderer.
4. **Terminal I/O:** Renderer sends `terminal:input` and `terminal:resize` to main. Main sends `terminal:data` back.
5. **File viewing:** Renderer invokes `files:list-dir` and `files:read-text` via IPC handle/invoke. Main reads from project working directory, returns results.
6. **External sessions:** Sparse chokidar watchers detect new session directories under `~/.amplifier/projects/`. Same tail-read mechanism as Canvas-started sessions.

## Error Handling

- **canvas.db corruption:** Delete and re-derive from disk scan (~5 seconds). Database is a cache, not source of truth.
- **PTY crash:** `terminal:exit` event propagates to renderer. Session status updates to failed. User can restart.
- **events.jsonl parse failure:** Skip malformed lines, continue from next valid line. Log warning.
- **File watcher disconnection:** Chokidar reconnects automatically. Stale status clears on next successful read.
- **Missing project directory:** Session marked as failed. Project entry preserved in canvas.db for history.

## Testing Strategy

**Pre-commit gate:** `npm run build && npx playwright test` -- must pass before every commit.

**Test structure:**

| Layer | Tests | What they verify |
|-------|-------|-----------------|
| Terminal (T1-T5) | PTY round-trip assertions | Send command via IPC, verify output arrives in xterm.js. Keyboard sequences (Ctrl+C, arrows, tab) produce correct escape codes. |
| Sidebar (S1-S5) | Accessibility tree snapshots | Session list renders correct items. Status dots update when fixture events.jsonl files change. Project grouping matches directory structure. |
| Viewer (V1-V5) | Content rendering assertions | Markdown renders correctly. Code gets syntax highlighting. Images load via canvas:// protocol. File browser navigates directories. |
| Integration (I1-I3) | Cross-panel assertions | Selecting a session in sidebar updates viewer with that session's file activity. Terminal persists across session switches. |

**Test fixtures:** `e2e/fixtures/` with fake `~/.amplifier` directory and fake project working directories. Tests use `AMPLIFIER_HOME` and `CANVAS_WORKDIR` env overrides to isolate from real data.

**Terminal caveat:** xterm.js renders to an HTML canvas element, which is opaque to the accessibility tree. Terminal tests use PTY round-trip (functional) rather than DOM inspection (structural).

**Milestone visual validation:** After each layer completes (1A, 1B, 1C), Playwright screenshots compared against canvas.html component library using nano-banana. This catches visual drift but isn't part of the pre-commit gate -- checkpoint review only.

## Phase 1 Scope Summary

17 features across 4 layers. Net change from original: hook receiver removed (18 → 17), S5 simplified to file-watching-only, I1 expanded to include file activity extraction.

## Phase 2 Deferred

Explicitly deferred from Phase 1 to Phase 2:

- **Hook module (canvas-relay):** Real-time event streaming from Amplifier to Canvas via HTTP hook.
- **HTTP receiver in main process:** Endpoint to receive hook payloads.
- **Dual event ingestion:** Simultaneous hook + file watcher paths with byte-offset deduplication.
- **Session summary derivation:** Parsing events.jsonl for human-readable session summaries. This is an AI problem, not an engineering one.

## Open Questions

None. All sections validated.
