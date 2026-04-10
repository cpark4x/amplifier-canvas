# Workspace Model & Returning User Experience Design

## Goal

Replace Canvas's auto-discovery model (scan all Amplifier projects, dump into sidebar) with an opt-in workspace model where only user-curated projects appear. Canvas should look exactly like it looked when the user last closed it — session continuity is the core principle.

## Background

Canvas currently scans `~/.amplifier/projects/` at startup, upserts every discovered project into the database, and watches all of them. This creates several problems:

- **Slow startup** — scanning scales linearly with the number of projects on disk.
- **Noisy sidebar** — every Amplifier project appears whether the user cares about it or not.
- **No memory** — Canvas doesn't remember what the user was working on. Every launch is a fresh start.

Users need a workspace that reflects *their* intent, not a dump of everything on disk. And returning users — the majority use case — need Canvas to restore exactly where they left off.

## Design Principles

1. **Session continuity** — Canvas looks exactly like when you left. Same projects, same expanded state, same selected session.
2. **Explicit opt-in** — Only projects the user has added appear in the sidebar. No auto-discovery at startup.
3. **User controls the workspace** — Users can remove projects and clear sessions from view.
4. **Hide, not delete** — Canvas manages visibility only. It never deletes Amplifier data on disk. "Remove" means "hide from Canvas," not "delete from filesystem."
5. **Canvas observes, doesn't own** — Canvas is a window into Amplifier sessions, not the host. Sessions keep running when Canvas is closed. Canvas reads local files — it never needs internet.
6. **Canvas is the control surface** — Users start and resume sessions from within Canvas. They don't run `amplifier run` themselves.

## Approach

**Lazy Discovery + Workspace State Persistence.**

No scanning at startup. Canvas only loads projects the user has explicitly registered. Discovery of available Amplifier projects happens on-demand when the user opens the "Existing" tab in the Add Project modal. Workspace state (selected project, expanded projects, selected session) is persisted and restored on launch.

## Architecture

### Database Schema Changes

The current DB has two tables (`projects` and `sessions`) populated by auto-scanning. This shifts to a user-curated model.

**`projects` table — add one column:**

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `registered` | `BOOLEAN` | `0` | `1` = user explicitly added this project to Canvas. Only registered projects appear in the sidebar. Setting back to `0` removes the project from the workspace without deleting it. |

**`sessions` table — add one column:**

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `hidden` | `BOOLEAN` | `0` | `1` = user cleared this session from view. |

**New `workspace_state` table:**

```sql
CREATE TABLE workspace_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

Simple key-value store for:

| Key | Value | Purpose |
|-----|-------|---------|
| `selectedProjectSlug` | `string` | Which project is highlighted in the sidebar |
| `expandedProjectSlugs` | `JSON array` | Which projects have their session lists expanded |
| `selectedSessionId` | `string` | Which session is active in the viewer panel |
| `sidebarCollapsed` | `boolean` | Whether the sidebar is collapsed or expanded |

Enough to restore exactly where you left off.

**What goes away:** The scanner no longer auto-upserts into `projects` on startup. The `projects` table becomes a curated registry, not a scan cache.

**Design note:** No `position` or `sort_order` columns. Sidebar order is alphabetical. If drag-to-reorder is needed later, that's an additive column change, not a schema redesign.

### Startup Flow — Returning User

**Current startup:** scan `~/.amplifier/projects/`, upsert everything, watch everything, push to renderer.

**New startup:**

0. **Detect first-time vs returning user** — `SELECT COUNT(*) FROM projects WHERE registered = 1`. If zero, show the welcome screen (Act 1, Scene 1). If non-zero, proceed to load workspace.
1. **Read workspace state** from `workspace_state` table — get `selectedProjectSlug`, `expandedProjectSlugs`, `selectedSessionId`, `sidebarCollapsed`.
2. **Load only registered projects** — `SELECT * FROM projects WHERE registered = 1`.
3. **Load non-hidden sessions for those projects** — `SELECT * FROM sessions WHERE projectSlug IN (...) AND hidden = 0`.
4. **Start watchers only for registered projects** — no watcher on unregistered project directories.
5. **Push to renderer** — sessions arrive with the workspace state, so the sidebar renders exactly as it was: same project expanded, same session selected.
6. **No scanning at all** — `~/.amplifier/projects/` is not touched until the user opens the "Existing" tab.

First-time users (zero registered projects) see the welcome screen (Act 1, Scene 1 — already built). Returning users skip it entirely — they go straight to their workspace.

The scanner function still exists but its role changes: it's no longer called at startup. It's called on-demand when the user opens the "Existing" tab in the add-project modal.

### The "Add Project" Modal

Two-tab layout.

**"New" tab (active by default when opening the modal):**

- Single text input: "Project name"
- Helper text: "Creates a new Amplifier project"
- Button: "Create Project"
- On create: registers the project in DB with `registered = 1`, creates the directory in `~/.amplifier/projects/<slug>/`, adds it to the sidebar, selects it, and opens a new session with the terminal active.

**"Existing" tab:**

- Search bar at the top: "Search projects..."
- Below: a list of discovered Amplifier projects (scanned on-demand from `~/.amplifier/projects/`), filtered to exclude projects where `registered = 1`
- Each row: project name + path in muted text
- Click a row to select it, then "Add to Canvas" button
- On add: sets `registered = 1` on the project, loads its non-hidden sessions from disk, starts a watcher, adds it to the sidebar expanded, and selects the project. The user can then start a new session or click an existing session from the list. No additional prompt or dialog is needed — the session list in the sidebar IS the interface for choosing.

The scan only happens when you open the "Existing" tab. It's a one-time directory read, not a background process. Fast even with hundreds of projects because it's just listing directories — no parsing of `events.jsonl`.

No general folder picker. Canvas is purpose-built for Amplifier sessions. A random folder without Amplifier data would just be an empty project. The "New" tab handles creating new projects; the "Existing" tab handles adding discovered Amplifier projects.

**Mockups:** See `docs/mockups/add-project-option-A.png` (chosen two-tab layout). Alternatives explored: `docs/mockups/add-project-option-B.png` (two-card choice), `docs/mockups/add-project-option-C.png` (unified search-first), `docs/mockups/add-existing-project-picker.png` (original picker exploration).

### Workspace State & Session Continuity

When Canvas is used, the following state persists in the `workspace_state` table:

- `selectedProjectSlug` — which project is highlighted in the sidebar
- `expandedProjectSlugs` — which projects have their session lists expanded (JSON array)
- `selectedSessionId` — which session is active in the viewer panel
- `sidebarCollapsed` — whether the sidebar is collapsed or expanded

On next launch, Canvas reads these values and restores the sidebar exactly. If the previously selected session still exists and isn't hidden, the viewer opens to it. If it's been hidden or removed, Canvas falls back to showing the project with no session selected.

If `selectedProjectSlug` refers to a project that is no longer registered, Canvas falls back to the first registered project alphabetically. If no registered projects exist, Canvas shows the welcome screen.

**State is written on every user interaction that changes it — not on close.** This means if Canvas crashes or is force-quit, the state is still current.

### Project & Session Management Actions

**Project actions** (right-click context menu on a project in the sidebar):

- **Remove from Canvas** — sets `registered = 0` on the project. It disappears from the sidebar. Stops watcher. Sessions on disk are untouched. Can be re-added later via the "Existing" tab (it reappears in the discovery list).

**Session actions** (right-click context menu on a session):

- **Remove from view** — sets `hidden = 1` on the session. Disappears from the session list. Data on disk untouched.
- **Stop** — only visible on running sessions. Sends SIGTERM to the Amplifier CLI process, allowing graceful cleanup. Session status changes to `stopped` (a new terminal status distinct from `done` and `failed`). The sidebar shows a neutral indicator for stopped sessions rather than green (done) or red (failed).
- **Resume** — already built in the sidebar. Reconnects to a running or paused session.

When a project is removed (`registered = 0`), its watcher is also stopped. When a project is re-added (`registered = 1`), Canvas reloads its sessions from disk (minus any previously hidden ones) and restarts the watcher.

### Process Lifecycle

**When does a session stop running?**

A session ends when the Amplifier CLI process completes (recipe finishes, user exits, task done), the user explicitly stops it from Canvas, or an error terminates it. Canvas knows via `session:end` event in `events.jsonl`.

**What happens when Canvas is closed?**

Running sessions keep going in the background. Amplifier CLI processes are independent of Canvas. When Canvas reopens, sessions that were running may now be finished — Canvas reads the updated `events.jsonl` and shows the final state. Or they might still be running — the watcher picks up where it left off.

When the user closes Canvas while sessions are running, show a brief non-blocking notification: "N sessions are still running. They'll continue in the background." Not a confirmation dialog — just an informational toast.

**What happens when the laptop loses internet?**

Canvas itself is fully local — no internet needed to view projects, browse sessions, or read analysis. Amplifier sessions that depend on LLM API calls will fail on the next API call. Canvas just reflects whatever state the session ends up in.

## Data Flow

```
Startup:
  workspace_state table → read state
  projects table (registered=1) → load projects
  sessions table (hidden=0) → load sessions
  → start watchers for registered projects only
  → push to renderer with saved state
  → sidebar renders exactly as last seen

Add Existing Project:
  User opens "Existing" tab
  → on-demand scan of ~/.amplifier/projects/
  → filter out projects where registered=1
  → user selects project
  → set registered=1 in DB
  → load sessions, start watcher
  → project appears in sidebar

Remove Project:
  User right-clicks → "Remove from Canvas"
  → set registered=0 in DB
  → stop watcher
  → project disappears from sidebar
  → data on disk untouched
  → project reappears in "Existing" tab discovery list

Session Lifecycle:
  Canvas (or user) starts session → Amplifier CLI process runs independently
  → Canvas watches events.jsonl for state changes
  → Canvas closed? Sessions keep running.
  → Canvas reopens? Reads final state from events.jsonl.
```

## Storyboard — Act 1, Scene 2: Returning to Canvas

*Chris opens Canvas on Thursday morning. He last used it Tuesday evening, working on amplifier-canvas.*

Canvas opens instantly. The sidebar shows exactly what he left — amplifier-canvas is expanded, the last session he was working on is selected, the viewer panel shows its analysis. Two other projects (team-pulse, budget-tracker) are collapsed in the sidebar below.

He notices the session he left running Tuesday has a green dot now — it finished overnight. He clicks it, sees the analysis summary, and moves on.

He clicks "+" to start a new session on amplifier-canvas. Canvas launches Amplifier, a new session appears in the sidebar with an amber "running" dot, and the terminal is active. He's coding within 3 seconds of clicking "+".

Later, he decides he's done with budget-tracker for now. Right-click, "Remove from Canvas." It disappears. His workspace is cleaner. If he needs it again, "+" → "Existing" tab → search → add.

**Key UX principles this scene establishes:**

- Zero-load time for returning users — no scanning, no discovery, just render from DB
- Sessions that ran in the background show their final state naturally
- Starting work is one click from the sidebar
- Removing projects is non-destructive and reversible

## Testing Strategy

| Area | What to verify |
|------|----------------|
| **DB migration** | New columns exist, defaults are correct, `registered` flag on projects and `hidden` flag on sessions work as expected |
| **Startup** | Canvas only loads registered projects. First-time detection works (zero registered → welcome screen). No scanning occurs. |
| **Add Project modal** | "New" tab creates + registers. "Existing" tab discovers and registers. Search filtering works. |
| **Workspace state** | State persists on interaction. Restored correctly on launch. Handles missing/stale references gracefully. |
| **Management actions** | Remove project sets `registered=0`. Remove session from view hides it. Stop session sends SIGTERM and sets `stopped` status. Removed projects reappear in discovery list. |
| **Watchers** | Only registered projects are watched. Removing a project stops its watcher. |

## Open Questions

None — all design decisions have been resolved through the brainstorm conversation.
