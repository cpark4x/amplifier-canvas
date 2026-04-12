# Amplifier Canvas — Dev-Machine Product Requirements Document

## 1. Document Purpose

This is the Product Requirements Document (PRD) for Amplifier Canvas. It is designed to feed directly into your `/brainstorm` → `/admissions` → `/machine-design` → `/generate-machine` pipeline.

You are building Canvas from a clean slate. There is no existing codebase — you own the architecture, the component structure, and every implementation decision within the constraints specified here. Your job is to produce production-quality, usable code that a team of 7 developers will evaluate as their potential daily driver.

This document gives you everything you need:
- **What to build** — product vision, success criteria, feature roadmap
- **What to integrate with** — Amplifier's external contracts (session paths, event format, CLI interface)
- **What tools to use** — locked tech stack choices
- **What's yours to decide** — architecture, aesthetics, UX details not specified here
- **What the experience looks like** — `canvas.html` (included with this spec) defines the user workflow

Your pipeline handles architecture design, feature decomposition, and build infrastructure generation. This document gives you the inputs to pass your own admissions gates and begin building.

---

## 2. Product Vision

### What Is Canvas?

Amplifier Canvas is the workspace companion for Amplifier, a modular AI agent framework. Amplifier users currently work through CLI terminals — jumping between terminal windows, editors, and GitHub to manage sessions and see results. Canvas makes the invisible visible: a single workspace where you organize projects, manage sessions, browse files, and see what needs attention.

### Target Users

Amplifier users — developers who run AI agent sessions to build software. These are people who live in the terminal, manage multiple concurrent projects, and need to track what their AI agents are doing across those projects.

The initial validation cohort is 7 team members who use Amplifier daily via CLI. They are technical, opinionated, and will not switch tools out of politeness. Canvas earns their adoption or it doesn't.

### Success Criteria

Canvas succeeds when all four of these are true:

1. **Daily driver** — The validation cohort switches to Canvas as their primary Amplifier interface within 2 weeks, unprompted. Nobody asks them to switch; they choose to because it's better.
2. **Nothing missed** — Users never miss a completed session or forget a long-running task. If Amplifier finishes work at 3 AM, the user knows about it when they open Canvas at 9 AM.
3. **Organized at scale** — 5+ projects stay organized without workspace clutter. A user with 20 active projects can find what they need instantly.
4. **Never slower** — No operation is slower than the equivalent CLI command. If `amplifier session list` takes 200ms, Canvas must show sessions in ≤ 200ms.

### Core Principles

- **Additive, not replacement** — Canvas works alongside the terminal. It enhances the CLI experience; it does not try to replace it. The terminal remains the primary interaction surface for running sessions.
- **Project-centric** — Every project is a self-contained world. Sessions, files, history, and stats are organized by project. Cross-project views exist only when they serve the user (e.g., "what's running right now?").
- **Respect attention** — Surface what matters, never make users hunt. Completed sessions announce themselves. Failed sessions explain why. Stale sessions are visible but not noisy.
- **Fast and reliable** — If Canvas is slower than the CLI, it is a bug. Electron apps have a reputation for being sluggish. Canvas must defy that reputation.

---

## 3. Tech Stack Constraints

### Platform

Electron. Canvas is a native desktop application for macOS (primary), with Linux and Windows as future targets.

### Locked Choices (Must Use)

| Layer | Technology | Version | Why It's Locked |
|-------|-----------|---------|----------------|
| Runtime | Electron | 35+ | Desktop shell, PTY access, native APIs |
| UI Framework | React | 19+ | Component model, ecosystem |
| State Management | Zustand | 5+ | Lightweight, TypeScript-friendly |
| Language | TypeScript | 5.8+ | Type safety across main/preload/renderer |
| Build | electron-vite | 3+ | Electron-aware Vite build pipeline |
| Database | better-sqlite3 | 11+ | Local persistence, fast queries, no server |
| Terminal Emulation | xterm.js | 5+ | Terminal rendering in the browser |
| PTY | node-pty | 1+ | Shell process management from main process |
| File Watching | chokidar | 5+ | Watch events.jsonl and project files |
| E2E Testing | Playwright | 1.50+ | Electron E2E testing support |
| Unit Testing | Node.js built-in test runner + tsx | — | Fast, no framework overhead |

### Open Choices (You Decide)

- Component structure and file organization
- IPC contract design (channel names, message shapes, request/response patterns)
- State shape and store patterns (single store vs multiple, slice design)
- Markdown rendering approach (remark, markdown-it, or other)
- Code syntax highlighting approach (shiki, Prism, highlight.js, or other)
- How to wire the build pipeline (scripts, Makefile, package.json scripts)
- How to structure the Electron main/preload/renderer split
- Packaging approach (electron-builder, electron-forge, or other)
- Aesthetic direction — colors, fonts, spacing, styling are entirely yours
- CSS approach (CSS modules, Tailwind, styled-components, vanilla CSS, etc.)

### Hard Security Constraints

These are non-negotiable. Electron's security model must be respected:

- `contextIsolation: true` — renderer runs in an isolated context
- `nodeIntegration: false` — no direct Node.js access from renderer
- All renderer ↔ main communication goes through a **typed preload bridge** — the preload script exposes a typed API via `contextBridge.exposeInMainWorld()`
- No `remote` module usage
- No `eval()` or dynamic code execution in renderer

---

## 4. Amplifier External Contracts

Canvas integrates with Amplifier by reading its data files and launching its CLI. These contracts are stable and must be implemented exactly as specified.

### Contract 1 — Session Discovery Path

Amplifier stores all session data on the local filesystem.

- **Root directory:** `~/.amplifier/` (overridable via `AMPLIFIER_HOME` environment variable)
- **Projects directory:** `~/.amplifier/projects/{project-slug}/sessions/{session-id}/`
- **Project slug derivation:** The absolute working directory path with `/` replaced by `-`
  - Example: `/Users/chris/Projects/foo` → `-Users-chris-Projects-foo`
- **Session directory contents:**
  - `events.jsonl` — primary data source (all session events)
  - `metadata.json` — session metadata (ID, model, timestamps, working directory)
  - `transcript.jsonl` — not needed by Canvas

**Session ID formats:**
- Interactive sessions: UUID v4 (e.g., `91408e9a-b6a8-48c4-bb81-5c20b4ae19a0`)
- Agent sub-sessions: hex-underscore format (e.g., `0000000000000000-ae31ab2626e94b97_foundation-explorer`)

### Contract 2 — events.jsonl Format

This is the critical data contract. `events.jsonl` is a newline-delimited JSON file — one JSON object per line, appended as the session progresses.

**Top-level fields on every event line:**

| Field | Type | Description |
|-------|------|-------------|
| `event` | string | The event type |
| `ts` | string | ISO 8601 timestamp |
| `data` | object | Event-specific payload |
| `session_id` | string | Session identifier |
| `schema` | object | `{"name": "amplifier.log", "ver": "1.0.0"}` |
| `lvl` | string | Log level (e.g., `"INFO"`) |

> **CRITICAL — Field Name Accuracy:**
> - The event type field is `event`, **NOT** `type`
> - The timestamp field is `ts`, **NOT** `timestamp`
> - Tool events are `tool:pre` / `tool:post`, **NOT** `tool_call`
> - User input events are `prompt:submit`, **NOT** `user_message`
>
> These exact field names must be used. Mismatched field names will silently produce empty results.

**Key event types and their `data` fields:**

| Event Type | Key `data` Fields | What It Means |
|-----------|-------------------|---------------|
| `session:start` | `parent_id`, `timestamp`, `working_dir`, `project_dir`, agents config | Session began |
| `session:end` | `parent_id`, `timestamp` | Session ended |
| `prompt:submit` | `prompt` (user's input text), `parent_id`, `timestamp` | User sent a message |
| `prompt:complete` | `prompt`, `response` (assistant text), `parent_id`, `timestamp` | Assistant responded |
| `tool:pre` | `tool_name`, `tool_input` (args object), `tool_call_id`, `parent_id`, `timestamp` | Tool call started |
| `tool:post` | All `tool:pre` fields + `result` | Tool call completed |
| `llm:request` | `model`, `provider`, `parent_id`, `timestamp` | LLM API call started |
| `llm:response` | `model`, `provider`, `usage` (see below), `duration_ms`, `status` | LLM API call completed |
| `content_block:start` | `block_type` (`thinking`/`text`), `block_index`, `total_blocks` | Streaming block began |
| `content_block:end` | `block` (content object), `block_index`, `usage` | Streaming block ended |
| `orchestrator:complete` | `orchestrator`, `turn_count`, `status` | Orchestrator turn finished |

**Token usage structure** (in `llm:response` → `data.usage`):

```json
{
  "input": 1234,
  "output": 567,
  "cache_read": 890,
  "cache_write": 123
}
```

### Contract 3 — Session Lifecycle States

Sessions progress through states derivable from events in `events.jsonl`:

| State | How to Derive | Visual Treatment |
|-------|---------------|-----------------|
| `running` | Recent tool/LLM activity (last event within ~30s) | Active indicator |
| `needs_input` | Assistant produced a response, waiting for user input | Waiting indicator |
| `done` | `session:end` event present, clean exit | Success indicator |
| `failed` | `session:end` event with error, or session died unexpectedly | Error indicator |
| `active` | Default/ambiguous — has events but state is unclear | Neutral indicator |

State is derived by reading the last events in `events.jsonl`. There is no separate state file — the event stream is the source of truth.

### Contract 4 — CLI Interface

Canvas launches and manages Amplifier sessions by executing CLI commands via PTY. These are the commands Canvas needs:

**Session management:**
- `amplifier run [PROMPT]` — Start a new session
  - Flags: `-B bundle`, `-p provider`, `-m model`, `--mode chat|single`
- `amplifier resume [SESSION_ID]` — Resume a specific session (partial ID match supported)
- `amplifier continue [PROMPT]` — Resume the most recent session in the current directory

**Session queries:**
- `amplifier session list` — List sessions
  - Flags: `--all-projects`, `--project PATH`, `-n limit`
- `amplifier session show SESSION_ID` — Show session detail
- `amplifier session fork SESSION_ID` — Fork from a session checkpoint
- `amplifier session delete SESSION_ID` — Delete a session

Canvas should launch these commands in a PTY so the terminal emulator can display real output including colors, progress indicators, and interactive prompts.

### Contract 5 — metadata.json Format

Located at `{session-dir}/metadata.json`. A JSON file with session-level metadata:

```json
{
  "session_id": "91408e9a-b6a8-48c4-bb81-5c20b4ae19a0",
  "created": "2026-04-12T08:30:00Z",
  "bundle": "@superpowers",
  "model": "anthropic/claude-sonnet-4-20250514",
  "turn_count": 5,
  "working_dir": "/Users/chris/Projects/foo"
}
```

Key uses:
- `working_dir` — reliable source for associating sessions with project directories
- `created` — session creation timestamp
- `model` — which model was used
- `turn_count` — how many turns the session lasted

---

## 5. Feature Roadmap (Acts & Scenes)

### UX Reference

`canvas.html` (included with this spec) is the UX reference. It defines the complete user workflow — screens, information hierarchy, user flows, session states, and progressive disclosure. **Match the workflow and requirements. Aesthetic choices (colors, fonts, spacing, styling) are yours to make.**

Extract from `canvas.html`:
- Screen inventory and information hierarchy (what appears where)
- User flows (welcome → new project → first session → viewer → session completion → resume)
- Session state model (waiting, failed, running, done-unread, done-read)
- Progressive disclosure (when panels appear and disappear)
- Sidebar session-first hierarchy

Do not extract from `canvas.html`:
- Specific colors, fonts, or CSS values
- Aesthetic decisions (you make your own)
- Animation details, border-radius values, shadows

---

### Act 1: Getting Started

**Job to be done:** "The app launches and I have a working terminal."

This act establishes the workspace model, project registration, and terminal integration. It is the foundation everything else builds on.

#### Scene 1.1 — Welcome

**What the user sees:** Clean window. Sidebar says "Projects" with a `+` button. Main area has one clear call-to-action: "Create your first project." No clutter, no pre-loaded data.

**Acceptance criteria:**
- App launches in < 2 seconds
- **NO automatic project discovery** — the workspace starts empty
- Only user-registered projects appear in the sidebar
- The app looks exactly like it looked when the user last closed it (state persistence)
- First-time experience: clean empty state with a single call-to-action

**Why this matters:** The original prototype scanned all of `~/.amplifier/projects/` on startup. A user with 74 sessions across dozens of projects opened the app and was overwhelmed by a wall of random sessions from every project they'd ever touched. The fix: users curate their workspace. Canvas starts empty. You add projects. You see only what you chose to see.

#### Scene 1.2 — New Project

**What the user sees:** A modal with project name and source — either create a blank project OR pick an existing folder. The existing folder option signals Canvas respects your existing workflow.

**Acceptance criteria:**
- User can point at any directory on their filesystem
- No scanning of `~/.amplifier/projects/` — only explicitly added projects appear
- A user with 100s of Amplifier projects sees only the ones they chose to add
- Adding an existing folder immediately discovers its Amplifier sessions (via the session discovery path contract)
- Adding a folder that has no Amplifier sessions yet works fine — it just shows zero sessions

#### Scene 1.3 — First Session

**What the user sees:** After creating/adding a project, the sidebar immediately shows the project name as a label with one session underneath. The main area is a full-width terminal, immediately interactive.

**Acceptance criteria:**
- No intermediate screens, no spinners between project creation and usable terminal
- Session-first sidebar: session name is primary, project name is a context label above it
- Session title auto-derived from the first prompt (not a UUID)
- Terminal is immediately usable — shell inherits user's environment (`$PATH`, aliases, shell config)
- Ctrl+C, Ctrl+D, arrow keys, tab completion all work
- Terminal resizes when window resizes

#### Scene 1.4 — Session Lifecycle

**What the user sees:** Closing the app doesn't kill running sessions. Reopening shows sessions exactly as they were — no surprise discoveries, no missing sessions.

**Acceptance criteria:**
- Sessions survive app close, laptop sleep, connectivity loss
- State persists in the local database
- Reopening Canvas shows the same projects and sessions the user left
- Running sessions continue in the background and their status updates when Canvas reopens
- Window size and position restore on relaunch

#### Act 1 Edge Cases

| Edge Case | Expected Behavior |
|-----------|-------------------|
| First-time user, no projects | Clean empty state with single call-to-action |
| User adds folder that isn't an Amplifier project yet | Works fine — shows zero sessions, ready for first `amplifier run` |
| Hundreds of registered projects | Sidebar scales without degradation (virtualized list if needed) |
| PTY process crashes | Terminal shows error message, session marked failed, no app freeze |
| No `events.jsonl` for brand new session | Show "starting..." status until first event appears |
| Window very narrow | Sidebar collapses gracefully |
| User's `$PATH` doesn't include `amplifier` binary | Clear error messaging explaining what's wrong |
| Graceful quit (Cmd+Q) | App closes, running sessions continue, state saved |

---

### Act 2: Your First Session — Viewer Wiring

**Job to be done:** "Amplifier opens a file, Canvas shows it."

This act introduces the viewer panel — the visual layer that makes Amplifier's file operations visible. The key principle is **progressive disclosure**: the viewer panel does not exist at launch. It appears only when content earns its place.

#### Scene 2.1 — Viewer Panel

**What the user sees:** When Amplifier opens or creates a file during a session, a right panel slides open showing the file. The panel didn't exist before — it appears because there's now something to show.

**Acceptance criteria:**
- Panel appears on the first file event (detected from `tool:post` events for file-related tools)
- User can close the panel to return to full-width terminal
- Panel does not appear at launch — no empty chrome
- Panel remembers its open/closed state per session

#### Scene 2.2 — File Browser

**What the user sees:** A directory tree for browsing project files from the viewer panel.

**Acceptance criteria:**
- Browse any directory in the project
- Click a file to preview it in the viewer
- Directory tree shows the project's working directory as root

#### Scene 2.3 — File Preview

**What the user sees:** Rendered preview for common file types.

**Acceptance criteria:**
- Markdown: renders GFM with tables, code blocks, links, headings
- Code files: syntax highlighting for common languages
- Images: display inline (PNG, JPG, GIF, SVG)
- Unknown types: show raw text
- Binary files: show "cannot preview" message

#### Scene 2.4 — Provenance

**What the user sees:** Each file in the viewer shows whether it was "Opened by Amplifier" or "Opened by you."

**Acceptance criteria:**
- Badge or label per tab indicating who opened it
- Amplifier-opened files detected from `tool:post` events containing file operation tool names
- User-opened files are those clicked manually in the file browser

#### Scene 2.5 — Recent Files

**What the user sees:** A "Recent" section showing files Amplifier touched during the active session, with operation badges.

**Acceptance criteria:**
- Files appear in real-time as `tool:pre` / `tool:post` events fire
- Badges indicate operation type: created, edited, read
- Clicking a recent file opens it in the viewer
- List is chronological, most recent first

#### Scene 2.6 — Tab System

**What the user sees:** Multiple files open simultaneously in tabs.

**Acceptance criteria:**
- Open multiple files, switch between tabs, close tabs
- Active tab visually distinct
- Tab shows filename (and parent directory if names collide)

#### Act 2 Edge Cases

| Edge Case | Expected Behavior |
|-----------|-------------------|
| Binary files (PDFs, compiled artifacts) | "Cannot preview" message |
| Very large files (> 1MB) | Truncate or paginate with "load more" option |
| File deleted while tab is open | Handle gracefully — show "file deleted" state |
| Session has no file activity | Viewer stays hidden — no empty panel chrome |
| Symlinks | Follow and display target content |
| Permission errors | Handle without crashing — show error in viewer |

---

### Act 3: Session Lifecycle

**Job to be done:** "I see what happened, what changed, and I can pick up where I left off."

This act completes the session management experience — parallel sessions, completion workflows, review, and history.

#### Scene 3.1 — Parallel Sessions

**What the user sees:** User starts a second session in the same project. Both appear in the sidebar with their own status indicators.

**Acceptance criteria:**
- Multiple sessions run concurrently, each with its own terminal instance
- Sidebar shows all active sessions for the project
- Switching between sessions switches the terminal view
- Each session has independent viewer panel state

#### Scene 3.2 — Session Completes

**What the user sees:** When a session finishes, a toast notification appears. The sidebar updates: the session moves to a HISTORY section with a status indicator.

**Acceptance criteria:**
- Toast appears even if user is viewing a different session — auto-dismiss after 5 seconds
- Status indicator updates immediately (green for success, red for failure)
- Session title auto-derived from the first prompt (e.g., "Auth module refactor" not `session_a3f2b1c`)
- Stats visible in sidebar: duration, prompt count, files changed

#### Scene 3.3 — Review Completed Session

**What the user sees:** Clicking a completed session opens a right panel with a SUMMARY tab: status, one-line TLDR, "where you left off" trail, key stats.

**Acceptance criteria:**
- SUMMARY tab is the default view for completed sessions
- Three variants based on session outcome:
  - **Done** — success indicator, summary of what was accomplished
  - **Failed** — error indicator with error context (what went wrong)
  - **Stale/Paused** — paused indicator with absolute date (when it stopped)
- Collapsible sections for: prompts exchanged, key moments, suggested next steps
- Stats: duration, prompt count, token usage, files changed

#### Scene 3.4 — Commit the Changes

**What the user sees:** A CHANGES tab showing git status for the session — files modified, diffs, PR link if created, CI status.

**Acceptance criteria:**
- File list with add/modify/delete indicators
- Click a file to see its diff
- If a PR was created: show PR number, title, CI check status
- If no PR: show uncommitted changes summary

#### Scene 3.5 — Exit Session

**What the user sees:** Session ends, shell prompt returns. Sidebar shows a "+ New session" option.

**Acceptance criteria:**
- User can start a new session or resume a completed one
- Clean terminal state after session exit
- No stale terminal state or zombie processes

#### Scene 3.6 — Project Overview

**What the user sees:** A project-level view with an AI assessment banner and outcomes tracking.

**Acceptance criteria:**
- Project description auto-inferred from project contents and editable by the user
- Description pre-loaded into every new session (so the AI has context)
- Outcomes tracking tied to `OUTCOMES.md` if it exists in the project root
- Outcome states: in progress, not started, too early to tell

#### Scene 3.7 — Project Stats

**What the user sees:** A stats grid showing total sessions, total time, total tokens, total files changed. LLM-generated insights on velocity, alignment, efficiency, and risk.

**Acceptance criteria:**
- Stats computed from aggregated session data (all `events.jsonl` files for the project)
- Insights regenerated periodically or on demand
- If LLM insight generation fails, fall back to mechanical data (prompt count, files, duration)

#### Scene 3.8 — Session History

**What the user sees:** Full list of all sessions for the project. Each entry: title, summary, duration, "Resume →" action.

**Acceptance criteria:**
- Chronological order, newest first
- Resume launches `amplifier resume <sessionId>` in a new terminal instance
- Every session is findable and resumable — nothing is ever lost
- Search or filter by title/date for projects with many sessions

#### Act 3 Edge Cases

| Edge Case | Expected Behavior |
|-----------|-------------------|
| Session produces no file changes | CHANGES tab empty with appropriate message |
| Session fails immediately (< 1 prompt) | Still in history with minimal info available |
| 50+ sessions in one project | History scrolls/paginates without degradation |
| Git repo has uncommitted changes from outside Canvas | CHANGES tab reflects reality (actual git state) |
| Two sessions modify the same file | Canvas shows state honestly — does not manage conflicts |
| Session summary LLM call fails | Fall back to mechanical data: prompt count, files touched, duration |
| Resuming a very old session | Works — `amplifier resume` handles staleness |

---

## 6. Scope Boundaries

### Product Boundary

Canvas is the visual layer for Amplifier. Amplifier is the engine — Canvas makes it visible, navigable, and manageable.

### Hard Constraints (What Canvas Must Never Do)

- **Never modify or replace Amplifier core** — Canvas reads Amplifier's data and launches its CLI. It does not patch, wrap, or extend the Amplifier runtime.
- **Never build its own LLM integration, agent loop, or prompt engine** — Amplifier owns the AI. Canvas owns the visibility.
- **Never be slower than the CLI** — For any operation the CLI already handles, Canvas must match or beat its speed.

### Not in Scope for This Build (Future Revisions)

- Multi-user collaboration
- Mobile or web deployment

### Open for You to Decide

- How much UI to provide beyond the terminal (file management, git operations, etc.)
- How to surface session data and project status
- Where the line is between "Canvas shows information" vs "Canvas takes action"
- Aesthetic direction — all visual choices are yours
- `canvas.html` defines the workflow and information architecture to match, not the styling

---

## 7. Build Constraints

### What's Locked

- **Tech stack** as specified in Section 3 — Electron, React, TypeScript, Zustand, Playwright, and all locked dependencies
- **Electron security model** — `contextIsolation: true`, `nodeIntegration: false`, typed preload bridge
- **Amplifier external contracts** as specified in Section 4 — session discovery paths, `events.jsonl` format and field names, CLI interface, `metadata.json`
- **Workflow and information architecture** as defined in `canvas.html` and the Acts/Scenes in Section 5
- **Acceptance criteria** per Act/Scene as specified in this document

### What's Open

- **Architecture** — component structure, file organization, IPC contract design, state shape, module boundaries
- **Aesthetic direction** — colors, fonts, spacing, styling, visual personality
- **UX details** not specified in `canvas.html` — micro-interactions, transitions, loading states, empty states, error presentations
- **Build pipeline** — scripts, packaging approach, dev workflow, CI configuration
- **Feature decomposition** — how to break Acts/Scenes into implementable units (your pipeline handles this)

### Quality Bar

This build is competing, not prototyping. The quality bar is production-grade:

- **TDD** — Every feature has tests written before implementation. Tests define the contract; implementation fulfills it.
- **Pre-commit gate** — Full test suite must pass before every commit. No broken commits in the history.
- **Antagonistic review** — A fresh zero-context agent reviews each feature against its spec. If the reviewer can't verify the feature works from the spec alone, the feature isn't done.
- **Production-quality code** — Clean abstractions, proper error handling, no TODO-driven development. Every file should read like it belongs in a shipped product.
