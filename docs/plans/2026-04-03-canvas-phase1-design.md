# Amplifier Canvas Phase 1 Build Plan

## Goal

Ship a desktop app that makes running Amplifier CLI sessions feel identical to native Terminal, while adding a sidebar for session visibility and a viewer for file inspection.

## Background

Amplifier Canvas is a visibility layer over the Amplifier CLI. Canvas reads; Amplifier writes. If Canvas crashes, nothing is lost. The CLI is the engine; Canvas is the cockpit.

The product already has a complete design foundation:
- **VISION.md** — product vision, principles, and boundaries
- **ARCHITECTURE.md** — Electron + React + TypeScript, two-process model, Zustand, IPC contracts
- **STORYBOARD.md** — 22 screens across 4 acts with JTBD per scene
- **components.html** — component library rated 9.0 quality with full design tokens
- **canvas.html** — interactive prototype of all 22 screens

Phase 1 delivers the full app shell (terminal + sidebar + viewer), covering Acts 1-4 of the storyboard though not necessarily every scene. This is the foundation everything else builds on.

## Approach

### The Adoption Funnel

The product must be adopted in this order. Each layer only matters if the previous one works:

1. **No regression from Terminal** — running `amplifier run` through Canvas must feel identical to running it directly
2. **Launch is trivial** — `amplifier canvas` from existing terminal, Canvas opens alongside
3. **Session/project visibility** — see all sessions and projects in one place (the reason to stay)
4. **File viewer** — see what sessions produced without manual inspection (what makes it better)
5. **Better outcomes** — the wow moment (future phases, not Phase 1)

### Why One Phase, Not Four

Terminal, sidebar, and viewer ship together. A terminal in an Electron window without sidebar or viewer is a tech demo, not a product. The sidebar and viewer are what make it Canvas. We build in layers within the phase (terminal first, then sidebar, then viewer, then integration), but we ship once — when all three work.

### Two-Track Build Structure

**Track A — dev-machine (overnight, autonomous):** Uses the dev-machine bundle to build from specs inside Docker. Gets all context (VISION, ARCHITECTURE, STORYBOARD, component library, regression requirements). Produces a working skeleton we learn from. Runs while we sleep.

**Track B — manual sessions (daytime, interactive):** Bounded sessions with full design context. Handles design-sensitive work, visual polish, UX decisions needing human judgment. Reviews Track A output each morning, cherry-picks good ideas.

Tracks have separate STATE.yaml files. Same feature list. Both build independently. Compare at checkpoints, pick best pieces. Track A is a scout — it runs ahead and makes mistakes we learn from. Track B produces the final product.

Setup sequence:
1. Scaffold the Electron project (so dev-machine Gate 4 passes)
2. Set up dev-machine (brainstorm, admissions, machine-design, generate)
3. Track A runs overnight
4. Morning: review Track A output, continue Track B with learnings

## Architecture

### Two-Process Electron Model

**Main process (Node.js):** Owns all I/O — PTY spawning via node-pty, file watching via chokidar, git polling. Contains the State Aggregator that combines all data sources into a unified session model.

**Renderer process (Chromium):** Owns all UI — React components, Zustand store, xterm.js terminal rendering, Shiki syntax highlighting. Receives state from main process via IPC.

**IPC bridge:** The boundary between the two processes. 10 messages defined in ARCHITECTURE.md. This IS the app's API.

### Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Desktop vs. web | Desktop (Electron) | Embedding a real terminal requires OS access. One app to install, no server to start. |
| Reverse channel | Design for it, don't build it | File watching on events.jsonl is sufficient for sidebar latency. Reverse channel needed later for AI-to-UI actions. |
| Session lifecycle | User manages | Canvas doesn't auto-close, auto-archive, or auto-clean sessions. User exits or deletes. |
| Database | None for Phase 1 | All state derived from Amplifier's files on disk. config.json stores only what Canvas owns (project list, preferences). Design so a database can be added later. |
| Build tooling | Vite + electron-builder | Fast dev server, fast builds, standard packaging for Mac. No monorepo needed. |
| File viewer | Essential, ships with Phase 1 | The viewer is what makes Canvas better than Terminal, not just equivalent. |
| Terminal post-session | Nothing happens | Terminal is a persistent shell. Session ends, shell stays. Canvas doesn't decide what happens next. |

### Data Sources (all read-only)

- **Session files** — `~/.amplifier/sessions/*/events.jsonl` for session state, status, and history
- **Git state** — branch, status, diff stats via git CLI polling
- **File system** — project files for the viewer, watched via chokidar

## Components

### Feature Decomposition (18 features, 4 layers)

#### Terminal Layer (T1-T5)

| ID | Feature | Description |
|----|---------|-------------|
| T1 | Electron shell | Window opens, quits cleanly, has a title bar |
| T2 | xterm.js terminal | Renders in the window, spawns user's `$SHELL` |
| T3 | PTY pipe | Keystrokes go to shell, output renders in terminal, zero filtering |
| T4 | `amplifier canvas` CLI command | Launches the Electron app from Terminal |
| T5 | Keyboard fidelity | Ctrl+C, Ctrl+D, Ctrl+Z, arrow keys all pass through correctly |

#### Sidebar Layer (S1-S5)

| ID | Feature | Description |
|----|---------|-------------|
| S1 | Sidebar shell | 200px left panel, collapsible, matches component library design tokens |
| S2 | Session list | Reads `~/.amplifier/sessions/` to discover sessions |
| S3 | Session status | Parses events.jsonl to determine running/done/waiting/stuck |
| S4 | Project grouping | Groups sessions by working directory (project) |
| S5 | Real-time updates | Watches events.jsonl via chokidar, sidebar updates live |

#### Viewer Layer (V1-V5)

| ID | Feature | Description |
|----|---------|-------------|
| V1 | Right panel shell | Appears when a session is selected, matches component library |
| V2 | File browser | Lists files in the session's working directory |
| V3 | Markdown rendering | Renders .md files with styled output |
| V4 | Code syntax highlighting | Renders code files with line numbers via Shiki |
| V5 | Image preview | Renders .png, .jpg, .svg inline |

#### Integration (I1-I3)

| ID | Feature | Description |
|----|---------|-------------|
| I1 | Session-viewer wiring | Selecting a session in sidebar shows its files in viewer |
| I2 | Terminal persistence | Terminal stays active regardless of sidebar/viewer selection |
| I3 | Design token alignment | Layout matches canvas.html prototype — warm palette, typography, spacing from component library |

### Sidebar Status System

The sidebar is the command center. Its label system was designed through extensive iteration:

| State | Dot | Label | Example |
|-------|-----|-------|---------|
| Running | Amber (pulsing) | Elapsed time | `48m` |
| Needs you | Blue (pulsing) | What it needs | `needs input` |
| Done (deliverable) | Green (static) | What it produced | `✓ PR #48` |
| Done (no action) | Green (static) | Disposition | `✓ committed`, `✓ merged` |
| Failed | Red (static) | What broke | `test failed` |

Design rationale: The dot carries the health (3 colors). The label carries the only thing the dot can't — what happened. Time only appears on running sessions (answers "should I worry?"). Everything else shows outcomes, not durations.

## Data Flow

```
Amplifier CLI writes:
  ~/.amplifier/sessions/*/events.jsonl

Main Process reads (chokidar file watcher):
  Tail-read events.jsonl (track byte offset, parse only new bytes)
  → State Aggregator combines session data
  → IPC push to Renderer

Renderer receives (Zustand store):
  → SessionStore updates
  → React components re-render (sidebar, viewer)

Terminal (separate channel):
  Main Process: node-pty spawns $SHELL
  Renderer: xterm.js renders PTY output
  Keystrokes: xterm.js → IPC → node-pty → PTY process
  Output: PTY process → node-pty → IPC → xterm.js
```

## Error Handling

- **events.jsonl missing or malformed:** Session shows "unknown" status in sidebar. No crash.
- **PTY process dies:** Terminal shows exit message. Shell can be restarted. Sidebar status updates to reflect the session ended.
- **File watcher fails:** Sidebar stops updating but doesn't crash. Manual refresh fallback.
- **Session directory inaccessible:** Session excluded from sidebar with no error shown to user.
- **Viewer can't render a file type:** Show raw text as fallback.

Canvas is a visibility layer. Errors degrade the view, they never corrupt Amplifier's data. The principle: show less rather than show wrong.

## Build Practices

Seven mechanisms adapted from the dev-machine bundle for interactive development:

### 1. STATE.yaml (light version)

Machine-readable coordination file. Every session reads it first.

```yaml
features:
  T1:
    name: Electron shell
    status: ready        # ready | in-progress | done | blocked
    depends_on: []
    blockers: []
  T2:
    name: xterm.js terminal
    status: ready
    depends_on: [T1]
    blockers: []
next_action: "Scaffold Electron project and implement T1"
```

No epoch counters, proposed_features, or session metadata. Just features, statuses, dependencies, and blockers.

### 2. LESSONS.md

Recurring patterns and gotchas across sessions. Only patterns seen 2+ times qualify.

```markdown
## Pattern: [name]
- **Seen:** [count]
- **Symptom:** [what goes wrong]
- **Prevention:** [what to do instead]
```

Read at every session start. Updated after antagonistic reviews.

### 3. Feature Specs (scaled to size)

- **S features** (1 file, under 50 LOC): one-paragraph spec with acceptance criteria
- **M features** (2-3 files, under 150 LOC): Sections 1-5 — overview, requirements, acceptance criteria, edge cases, files touched
- **L/XL features**: Full spec including Section 8 (Implementation Map — map every requirement to an actual type/function in the codebase) once the codebase exists

### 4. Antagonistic Review (per component layer)

Three review gates in Phase 1:
1. After terminal layer (T1-T5) is complete
2. After sidebar layer (S1-S5) is complete
3. After viewer layer (V1-V5) is complete

Each review: fresh sub-agent with zero implementation context. Sees only the spec, the diff, and test results. Patterns discovered go into LESSONS.md.

### 5. Pre-Commit Gate

Build + full test suite before every commit. Non-negotiable.

No hard 3-attempt revert rule — use judgment. But the discipline of "I cannot commit with a failing test" stays hard. If the same thing breaks 3 times, it's architectural, not implementational.

### 6. AGENTS.md (project-specific)

A "how we work on Canvas" one-pager covering:
- Read STATE.yaml at session start
- Read LESSONS.md at session start
- Build + full test before every commit
- Antagonistic review after each component layer
- Write to LESSONS.md when a pattern is discovered
- Feature specs required before implementation
- Stop conditions (see below)

### 7. Stop Conditions

- **Stop on blocker** — don't work around it, mark it blocked in STATE.yaml
- **Stop on ambiguity** — don't guess, surface the question
- **Stop on repeated failure (3x)** — it's architectural, not implementational
- **Stop on coherence loss** — exit cleanly, update STATE.yaml and LESSONS.md

## Testing Strategy

**E2E tests only for Phase 1.** Playwright + Electron.

Rationale: Canvas's risk is at the integration level — xterm.js + Electron + PTY + React all working together. The codebase is too small (~18 features) for unit or component tests to earn their keep. A broken test at the E2E level tells us the product doesn't work; a passing test tells us it does. That's the only signal that matters right now.

### E2E Test Coverage (10-15 tests)

Mapped to the 9 terminal regression requirements:

| Requirement | Test |
|-------------|------|
| Input latency | Keystroke reaches PTY within 16ms |
| Shell fidelity | User's $SHELL loads with .zshrc, aliases, custom prompt |
| Launch speed | Electron window ready in under 2s |
| Complete output | ANSI color sequences render correctly in xterm.js |
| Keyboard fidelity | Ctrl+C sends SIGINT, Ctrl+D exits shell, arrow keys work |
| Escape hatch | No Canvas-specific state created; closing Canvas leaves Terminal functional |
| Visual noise | Terminal-first layout, no unexpected chrome |
| Persistent shell | Shell survives after `amplifier run` exits |
| Sidebar updates | events.jsonl change reflected in sidebar within 2s |

### When to add more test layers

- **Unit tests:** When data logic exceeds ~2000 LOC or modules become worth testing in isolation
- **Component tests:** When React component count exceeds ~15 and components have complex stateful behavior

## Definition of Done

Phase 1 ships when all of the following pass:

### Terminal
- [ ] App launches in <2s from `amplifier canvas`
- [ ] Input latency indistinguishable from native Terminal
- [ ] `amplifier run` starts a session with correct ANSI output rendering
- [ ] Ctrl+C kills the running process
- [ ] Ctrl+D exits the shell
- [ ] Arrow keys, tab completion, command history all work
- [ ] Shell persists after session exits
- [ ] Window resize reflows terminal content

### Sidebar
- [ ] Shows sessions grouped by project
- [ ] Status is correct: running / done / waiting for input / failed
- [ ] Updates within 2 seconds of session state change
- [ ] Clicking a session doesn't disrupt the terminal
- [ ] Collapsible

### Viewer
- [ ] Shows files from the selected session's working directory
- [ ] Renders markdown with basic styling
- [ ] Renders code with syntax highlighting
- [ ] Shows images inline
- [ ] Appears/disappears without disrupting terminal

### Visual
- [ ] Matches component library design tokens (warm palette, typography, spacing)
- [ ] No visual jank on any interaction
- [ ] Looks intentional, not default Electron gray

## Open Questions

1. **Terminal focus management** — When the user clicks the sidebar or viewer, does the terminal lose keyboard focus? How do they get it back? Click-to-focus? A keyboard shortcut?
2. **xterm.js latency** — Will xterm.js in Electron meet the 16ms bar out of the box, or will we need performance tuning (e.g., GPU-accelerated rendering, reduced React re-renders)?
3. **events.jsonl parsing at scale** — How large do these files get for long sessions? If they grow to 10MB+, the tail-read approach needs a streaming parser with byte-offset tracking.
