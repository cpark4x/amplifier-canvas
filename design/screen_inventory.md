# Screen Inventory — Amplifier Canvas (22 Screens, 3 Acts)

> Source of truth: `canvas.html`. Last synced 2026-04-15 (post-critique fixes).

## Structure

| Act | Title | Screens | Theme |
|-----|-------|---------|-------|
| 1   | Getting Started | 7 (1.1 – 1.4) | First launch → project creation → returning user |
| 2   | Your First Session | 5 (2.1 – 2.5) | Blank terminal → file viewer → app preview |
| 3   | Canvas Knows What You've Built | 10 (3.1 – 3.8 + 3a/3b variants) | Parallel sessions, review, project intelligence |

---

## Act 1 — Getting Started

*Seven screens: first launch through returning user.*

| Screen | Title | Description | Layout | Key State |
|--------|-------|-------------|--------|-----------|
| 1.1 | Welcome | First-time empty state — centered logo, welcome headline, single CTA | Sidebar + welcome center | Sidebar empty ("No projects yet"), "Add project" pinned to bottom |
| 1.2a | New Project: Modal | "Add Project" modal with New/Existing tabs; New tab shows name, location, bundle fields | Modal overlay | New tab active; sidebar still empty behind overlay |
| 1.2b | Session Started | Project created, first Amplifier session launched with CLI banner | Two-pane (sidebar + terminal) | Sidebar: CANVAS-APP with amber "just started" session; terminal: Amplifier startup banner, cursor ready |
| 1.3a | Existing Project: Browse | "Add Project" modal, Existing tab — discovered projects sorted by last-active | Modal overlay | Existing tab active; scrollable project list (amplifier-canvas selected); sidebar still empty |
| 1.3b | Existing Project: Choose Action | Project selected, modal shows "Start new session" + resume options | Modal overlay | Modal title is project name; no tabs; resume list sorted most-recent first |
| 1.3c | Existing Project: Session Launched | Resumed session — prior conversation visible, then restore marker | Two-pane (sidebar + terminal) | Sidebar: AMPLIFIER-CANVAS with green "active" session; terminal: conversation history + "session restored" divider |
| 1.4 | Returning to Canvas | Multi-project sidebar, completed session visible in read-only terminal | Two-pane (sidebar + terminal) | 3 projects (1 expanded, 2 collapsed); completed session with ✓ and "done · 2h 14m"; no blinking cursor |

---

## Act 2 — Your First Session

*From blank terminal to running app. The viewer earns its place.*

| Screen | Title | Description | Layout | Key State |
|--------|-------|-------------|--------|-----------|
| 2.1 | Reading the Codebase | Amplifier reads files; viewer stays closed — nothing to show yet | Two-pane (sidebar + terminal) | "Explore codebase" session active (amber); terminal: tool calls, file read summary; no right panel |
| 2.2 | Reviewing the Vision | Amplifier opens VISION.md — the viewer appears for the first time | Three-pane (sidebar + terminal + viewer) | FILES tab active; VISION.md tab with "Opened by Amplifier" label; rendered markdown |
| 2.3 | Opening a File | Browse button toggled on; file tree replaces panel content | Three-pane (sidebar + terminal + file browser) | Browse button active; file tree visible (OUTCOMES.md highlighted/hover); VISION.md tab persists |
| 2.4 | Multiple Files Open | OUTCOMES.md opened alongside VISION.md — two tabs in the viewer | Three-pane (sidebar + terminal + viewer) | Two file tabs (OUTCOMES.md active, VISION.md inactive); "Opened by you" label; browse button inactive |
| 2.5 | App Preview | Dev server running; live app embedded in the panel | Three-pane (sidebar + terminal + app preview) | APP tab active (not FILES); localhost:3000 URL bar; embedded Canvas Dashboard app; npm run dev output in terminal |

---

## Act 3 — Canvas Knows What You've Built

*8 steps (+ 2 variants) · parallel sessions without conflicts · stay informed · project-level memory*

| Screen | Title | Description | Layout | Key State |
|--------|-------|-------------|--------|-----------|
| 3.1 | Start a second session | User clicks [+]; Canvas creates git worktree, starts parallel session | Two-pane (sidebar + terminal) | 2 sessions: Auth module (amber, 28m, main) + Dark mode (amber, just started, worktree/dark-mode active); worktree badge in pane title |
| 3.2 | Session completes | Auth module finishes while user works in Dark mode; toast notification | Three-pane + toast notification | Auth module: green ✓ "done · 1h 12m"; Dark mode: amber, 31m; thinking block with model/token stats; toast: "Auth module finished" with Review link; right panel: FILES tab with file browser |
| 3.3 | Review completed session | SUMMARY tab: TLDR, status hero block, stats, "where you left off" trail | Three-pane (sidebar + terminal + SUMMARY) | Auth module selected (green ✓); SUMMARY tab active; green "All tests passing" status; trail (T:31, T:28, T:22); tabs: FILES, APP, SUMMARY, CHANGES |
| 3.3a | Triage a failed session | Variant: SUMMARY with red failed status, error explanation in trail | Three-pane (sidebar + terminal + SUMMARY) | Stripe migration selected (red dot, "failed · 42m"); 3 sessions visible (done/failed/running); red "Build broken · 2 type errors"; TypeScript errors in terminal |
| 3.3b | Revisit a stale session | Variant: SUMMARY with amber paused status, absolute date, incomplete work | Three-pane (sidebar + terminal + SUMMARY) | Frontend components selected (amber, "paused · 34m"); stat shows "Mon, Mar 31" (absolute); trail: scaffolded but empty FilterSidebar |
| 3.4 | Commit the changes | CHANGES tab shows PR status, CI checks, file diff summary | Three-pane (sidebar + terminal + CHANGES) | Auth module selected; CHANGES tab active; PR #47 with CI passing (14/14); file diff (847 added, 23 removed); GitHub link |
| 3.5 | Exit Session | User types `exit`; shell prompt returns, session slot shows "main" | Two-pane (sidebar + terminal) | "New session" slot (muted, main); Dark mode still running (amber, 34m); shell prompt with amplifier hints; no right panel |
| 3.6 | Project overview | Project-level view with OVERVIEW tab — vision, outcomes, AI assessment | Project view (sidebar + project zone) | OVERVIEW tab active; AI assessment banner (✶ On track); outcomes from OUTCOMES.md with status badges; no terminal |
| 3.7 | Project stats | STATS tab with aggregate numbers and LLM-generated insights | Project view (sidebar + project zone) | STATS tab active; 2×2 grid (8 sessions, 12h 34m, 847k tokens, 156 files); LLM insights: Velocity, Alignment, Efficiency, Risk |
| 3.8 | Session history | HISTORY tab — complete session record with PR links and resume buttons | Project view (sidebar + project zone) | HISTORY tab active; Dark mode (currently open); Auth module (done, PR #47 linked); 5 historical sessions with Resume → buttons |

---

## Layout Types

| Layout | Description | Screens |
|--------|-------------|---------|
| Sidebar + welcome center | Empty sidebar, centered welcome content | 1.1 |
| Modal overlay | Dimmed background, centered modal dialog | 1.2a, 1.3a, 1.3b |
| Two-pane | Sidebar + full-width terminal | 1.2b, 1.3c, 1.4, 2.1, 3.1, 3.5 |
| Three-pane | Sidebar + terminal + right panel (viewer/summary/changes) | 2.2, 2.3, 2.4, 2.5, 3.2, 3.3, 3.3a, 3.3b, 3.4 |
| Project view | Sidebar + project zone (replaces terminal; OVERVIEW/STATS/HISTORY tabs) | 3.6, 3.7, 3.8 |

---

## Right Panel Tab Progression

The right panel tabs evolve through the story:

| Context | Tabs Available |
|---------|---------------|
| Act 2 (active session, files only) | FILES, APP |
| Act 3 (running session) | FILES, APP, ANALYSIS, CHANGES |
| Act 3 (completed/failed/paused session) | FILES, APP, SUMMARY, CHANGES |
| Act 3 (project view) | OVERVIEW, STATS, HISTORY *(replaces entire main area, not a right panel)* |

---

## Sidebar State Progression

| Screen | Projects | Sessions | Notable |
|--------|----------|----------|---------|
| 1.1 – 1.3b | 0 | 0 | "No projects yet" + "Add project" button |
| 1.2b | 1 (CANVAS-APP) | 1 (amber, just started) | First project appears |
| 1.3c | 1 (AMPLIFIER-CANVAS) | 1 (green, active) | Resumed session |
| 1.4 | 3 (1 expanded, 2 collapsed) | 2 (both done) | Multi-project, completed sessions |
| 2.1 – 2.5 | 1 (CANVAS-APP expanded) | 1 (amber, active) | Single session working |
| 3.1 | 1 | 2 (Auth module + Dark mode) | First parallel sessions, worktree badges |
| 3.2 – 3.4 | 1 | 2 (done + running) | Session status changes (green ✓ + amber) |
| 3.3a | 1 | 3 (done + failed + running) | Three session states visible |
| 3.3b | 1 | 3 (done + done + paused) | Paused variant |
| 3.5 | 1 | 2 ("New session" slot + running) | Post-exit clean state |
| 3.6 – 3.8 | 1 | 1 (Dark mode running) | Project view active |

---

## Session Status Indicators

| Status | Dot Color | Badge Text | Meaning |
|--------|-----------|------------|---------|
| Just started | Amber | "just started" | Session created, Amplifier loading |
| Active/Running | Amber | "active" / "28m · running" | Session open, awaiting or processing input |
| Done | Green ✓ | "done · 1h 12m" | Session completed successfully |
| Failed | Red | "failed · 42m" | Session ended with errors |
| Paused | Amber | "paused · 34m" | Session exited before completion |
| New session | Gray | *(none)* | Empty slot, ready for `amplifier run` |

---

## User Journey

### Primary path (new user)

```
1.1 Welcome
 └─→ 1.2a New Project: Modal
      └─→ 1.2b Session Started
           └─→ 2.1 Reading the Codebase
                └─→ 2.2 Reviewing the Vision (viewer opens)
                     └─→ 2.3 Opening a File (browse mode)
                          └─→ 2.4 Multiple Files Open
                               └─→ 2.5 App Preview (APP tab)
                                    └─→ 3.1 Start a second session
                                         └─→ 3.2 Session completes (notification)
                                              └─→ 3.3 Review completed session (SUMMARY)
                                                   └─→ 3.4 Commit the changes (CHANGES)
                                                        └─→ 3.5 Exit Session
                                                             └─→ 3.6 Project overview
                                                                  └─→ 3.7 Project stats
                                                                       └─→ 3.8 Session history
```

### Alternate path (existing user)

```
1.1 Welcome
 └─→ 1.3a Existing Project: Browse
      └─→ 1.3b Existing Project: Choose Action
           ├─→ 1.3c Session Launched (resume) ──→ 2.1 ...
           └─→ 1.2b Session Started (new) ──→ 2.1 ...
```

### Returning user

```
1.4 Returning to Canvas ──→ (click session) ──→ 2.1 ...
                          ──→ (click [+]) ──→ 3.1 ...
                          ──→ (click project name) ──→ 3.6 ...
```

### Review variants (branching from 3.3)

```
3.3  Review completed session (green / done)
3.3a Triage a failed session  (red / failed)
3.3b Revisit a stale session  (amber / paused)
```
