# Amplifier-Canvas Storyboard

> **Premise:** Amplifier is a powerful engine with no cockpit.
>
> **Emotional arc:** skepticism → utility → trust → ownership

This document is the canonical narrative for Amplifier-Canvas. The story comes first. [screens.html](screens.html) illustrates it. Every design decision, every screen, every pixel exists to serve a moment in this story.

---

## Act 1 — Getting Started

**Job to be done:** Get from zero to a running Amplifier session inside Canvas with the minimum possible friction.

**Setup.** You've heard about Canvas. Maybe you're skeptical — you already use Amplifier from the terminal and it works fine. You download it, open it. The window appears. It's warm, quiet, mostly empty. There's nothing to learn because there's almost nothing on screen. The only question is: do you create a project? The whole act takes under a minute. By the end, Amplifier is running and you haven't left Canvas.

### Scene 1.1 — Welcome

**The beat.** You open Canvas for the first time. The window is clean — a narrow sidebar on the left says "Projects" with a `+` button. Below it: "No projects yet." The main area is warm off-white with a centered message: *"Welcome to Canvas — Your workspace for Amplifier sessions, files, and previews."* One button: "Create your first project →".

**Why this moment matters.** The welcome screen establishes Canvas's personality before anything functional happens. It's warm, not cold. Inviting, not overwhelming. The sidebar is already visible but empty — foreshadowing the structure that will fill in. The single call-to-action means zero decision paralysis.

**Screen reference:** [design/screens/screen-1-welcome.png](design/screens/screen-1-welcome.png)

### Scene 1.2 — New Project

**The beat.** You click the button. A modal appears over a subtle overlay. "New Project" at the top. Two fields: project name and source (blank project or existing folder). The folder path is grayed out until you select "Existing folder." Footer: Cancel and "Create project →".

**Why this moment matters.** This is the only configuration moment in the entire onboarding. Two choices, both obvious. The "existing folder" option signals that Canvas respects your existing workflow — it doesn't force you to start from scratch. The modal is small, centered, and feels like a quick aside, not a commitment.

**Screen reference:** [design/screens/screen-2-new-project.png](design/screens/screen-2-new-project.png)

### Scene 1.3 — Session Started

**The beat.** You hit create. The sidebar immediately shows your project name as a label ("Canvas-App") with one session below it: "main" — amber dot, bold text, "just started" in amber. The main area is now a full-width terminal. The Amplifier CLI banner appears: session ID, version, bundle, provider. A blinking amber cursor waits for your first prompt.

**Why this moment matters.** Three things happen simultaneously: the project exists, a session is running, and the terminal is live. No intermediate screens, no "setting up your workspace" spinner. The session-first sidebar design is already visible — the project name is a label, not a destination. The session is the primary object. The pane title reads "main · Canvas-App" — session first, project second. You're inside Amplifier now. Canvas got out of the way.

---

## Act 2 — Your First Session

**Job to be done:** Discover that Canvas adds value *on top of* the CLI, without ever getting in the way. The viewer earns its place.

**Setup.** You're in the terminal. This feels familiar — it's just Amplifier. But you're inside Canvas, and over the next few minutes, the right panel is going to reveal itself. Not all at once. Not because you asked for it. Because the work creates artifacts worth seeing. The viewer doesn't exist until it has something to show. This is the core progressive disclosure principle: nothing opens unless it earns its place.

### Scene 2.1 — Reading the Codebase

**The beat.** You type: "help me understand this codebase." Amplifier reads VISION.md, OUTCOMES.md, src/App.tsx, package.json — four files, listed as tool calls in the terminal. A green checkmark: "✓ 4 files read." Amplifier responds with a summary. The terminal occupies the full width. There is no right panel. There's nothing to show yet.

**Why this moment matters.** This is the restraint that defines Canvas. A lesser product would open a file viewer the moment Amplifier reads a file. Canvas doesn't. The viewer has no content worth displaying — so it stays hidden. The terminal gets all the space. This earns trust: Canvas won't waste your screen real estate on empty panels.

### Scene 2.2 — Reviewing the Vision

**The beat.** You type: "let's review the vision together." Amplifier reads VISION.md again, but this time it opens it in the viewer. The right panel slides in for the first time. A subtle note: "Opened by Amplifier." The FILES tab is active. One file tab: VISION.md. The rendered markdown shows the vision statement, goal, and core principles. The terminal narrows to make room, but it's still comfortable.

**Why this moment matters.** This is the moment Canvas becomes more than a terminal wrapper. The right panel didn't exist 10 seconds ago. It appeared because Amplifier decided you needed to *see* this file, not just hear about it. The "Opened by Amplifier" label is key — it tells you *who* caused this and *why*. The viewer earned its place.

### Scene 2.3 — Opening a File

**The beat.** You click the browse button (a small grid icon in the file tab bar). It activates — turns amber. The panel content shifts to a file tree: src/, public/, OUTCOMES.md, VISION.md, package.json, tsconfig.json. You hover over OUTCOMES.md — it highlights. You're about to open it yourself, not through Amplifier.

**Why this moment matters.** Agency shifts from Amplifier to you. Scene 2.2 showed Amplifier opening a file. Scene 2.3 shows *you* opening one. Both paths into the viewer are now established: the AI opens files when context demands it, you open files when curiosity drives it. The file browser is minimal — no icons, no sizes, no dates. Just names and folders. The content is the hierarchy.

### Scene 2.4 — Multiple Files Open

**The beat.** OUTCOMES.md is now open alongside VISION.md. Two tabs in the file tab row. OUTCOMES.md is active, showing rendered markdown: success criteria, anti-goals. The note says "Opened by you." You can switch between tabs. The file browser has closed — it gets out of the way once you've made your selection.

**Why this moment matters.** The multi-file experience is established with zero explanation. Tabs work like tabs. The distinction between "Opened by Amplifier" and "Opened by you" creates a subtle but meaningful provenance signal — you always know why something is on your screen.

### Scene 2.5 — App Preview

**The beat.** You run `npm run dev` from the terminal. The dev server starts: "✓ Ready in 847ms." Canvas detects the localhost URL and automatically switches the right panel to the APP tab. An address bar appears at the top of the panel showing "localhost:3000". Below it: a live preview of your running application — a dashboard with session cards, recent changes, file diffs. No browser tab. No alt-tabbing.

**Why this moment matters.** This is the moment Canvas stops being "nice to have" and becomes essential. The app preview collapses an entire workflow (terminal → browser → resize windows → check output) into a single glance. You made changes in the terminal. You see them in the panel. The feedback loop is instant and contained. This is the scene that converts skeptics.

---

## Act 3 — Canvas Knows What You've Built

**Job to be done:** Work across parallel sessions without conflicts, stay informed without interruption, and accumulate project-level memory that persists across sessions.

**Setup.** You've been using Canvas for a while now. The terminal is comfortable. The viewer is useful. But you're starting to push harder — multiple sessions on the same project, long-running tasks in the background, context you need to remember across days. This is where Canvas transitions from utility to infrastructure. The conceptual shift: sessions stop being ephemeral terminal instances and become meaningful units of work with identity, history, and memory. The CLI shows you `session_a3f2b1c · 2 days ago`. That's not memory. That's an ID. Canvas turns IDs into stories.

This act has three sub-arcs:
- **Parallel work** — running multiple sessions without conflicts
- **Staying informed** — knowing what happened without hunting for it
- **Project memory** — accumulating understanding that persists

### Scene 3.1 — Start a Second Session

**The beat.** You have an "Auth module" session running on main (28m, amber dot). You click "+ New session." Canvas creates a new session in an isolated git worktree — the sidebar shows it: "New session" with a worktree badge reading "↟ worktree/dark-mode." The terminal switches to the new session. The Amplifier banner confirms: "Worktree: worktree/dark-mode | Isolated from main." A green message: "✓ Ready. Isolated from session 1 — no file conflicts."

**Why this moment matters.** This is the parallel work breakthrough. In the CLI world, running two Amplifier sessions on the same project means git conflicts, file collisions, manual coordination. Canvas handles it invisibly — worktrees provide true isolation. Each session gets its own branch, its own working directory. The worktree badge in the sidebar makes the isolation visible without requiring the user to understand git internals. Both sessions work the same files independently. No conflicts, no coordination needed.

### Scene 3.2 — Session Completes

**The beat.** An hour later. You're deep in the Dark mode session when a toast notification appears at the bottom of the screen — "Auth module just finished." In the sidebar, the Auth module's amber dot becomes a green checkmark badge. Its status reads "done · 1h 12m." You're not pulled away from your current work. The notification is informational, not interruptive.

**Why this moment matters.** This is "respect attention" made concrete. A background session completed. Canvas tells you — once, subtly — and then gets out of the way. The sidebar's state change is persistent (you can glance at it anytime) but the toast is transient (it doesn't demand action). This is the answer to "did something happen while I wasn't looking?" — the question that Outcome 2 says users should never need to ask.

### Scene 3.3 — Review Completed Session

**The beat.** You click "Auth module" in the sidebar. The terminal switches to that session's history. The right panel opens to the ANALYSIS tab — a structured summary of everything that happened. At the top: a one-sentence description ("Built the session panel sidebar with live status indicators, duration counters, and worktree badges"), test status (14/14 passing), and session stats (1h 12m, 8 prompts, 142k tokens). Below: collapsible sections for Prompt History (numbered list of every prompt you sent), Key Moments (timestamped milestones — "T:14 All tests passing for the first time"), and Possible Next Steps (AI-suggested follow-ups — "SessionStatus.tsx needs error state handling").

**Why this moment matters.** This is session recall — the ability to understand what a session did without scrolling through terminal history. The prompt history gives you the narrative arc. The key moments give you the turning points. The next steps give you continuity. A session is no longer something that happened and vanished. It's a chapter you can re-read.

### Scene 3.4 — Commit the Changes

**The beat.** You commit from the terminal: `git add -A && git commit`, `git push origin main`, `gh pr create`. Canvas doesn't interfere — this is your CLI workflow. But the right panel switches to the CHANGES tab and surfaces the result: "PR #47 opened · no conflicts," CI status (green dot, 14/14 checks), commit hash, file diff summary. A "View PR #47 →" link in amber goes to GitHub. Files changed are listed with line counts.

**Why this moment matters.** Canvas is additive, not replacement. You commit the way you've always committed. But Canvas *shows you* what you committed in a structured view — no need to open GitHub to check CI status, no need to remember which files changed. The CHANGES tab is the "receipt" for your work. The CLI does the action. Canvas shows the result.

### Scene 3.5 — Exit Session

**The beat.** You type `exit`. Amplifier exits. The shell prompt returns. The sidebar updates: the completed session is gone from the active list, replaced by a "New session" slot on main, ready for the next task. The Dark mode session is still running in its worktree. The terminal shows helpful hints: `amplifier` to start new, `amplifier session resume` to resume. The worktree is preserved — nothing was lost.

**Why this moment matters.** Exiting a session doesn't feel like closing something — it feels like completing something. The session's work persists in git, in the PR, in the session history. The "New session" slot signals readiness without pressure. You could start another session right now, or close Canvas entirely. The state is durable.

### Scene 3.6 — Project Overview

**The beat.** You click the project name ("Canvas-App") in the sidebar. The entire main area transforms into a project view. The default tab is OVERVIEW. At the top: an AI assessment banner — "✶ AI assessment: On track — 1 of 3 outcomes in progress · 3 sessions completed · last activity today." Below: the project heading ("Amplifier-Canvas"), its one-line vision, and a structured outcomes list showing each outcome from OUTCOMES.md with status badges (In progress / Not started / Too early) and AI-generated evidence for each. A status line at the bottom: "PR #47 open · 2 sessions running · last commit today."

**Why this moment matters.** This is project memory made visible. Canvas isn't just tracking sessions — it's tracking *the project*. The AI assessment synthesizes across all sessions to give you a status you'd otherwise need to build manually. The outcomes list connects daily work back to the goals that matter. The project view is where the flywheel becomes tangible: sessions feed the project's understanding, and the project's understanding feeds the next session.

### Scene 3.7 — Project Stats

**The beat.** You tap the STATS tab. A 2×2 grid shows aggregate numbers: 8 sessions, 12h 34m total time, 847k tokens, 156 files touched. Below: an LLM-generated insights section — four observations the AI extracted from session patterns. "Velocity: Sessions are getting shorter — avg 1h 45m early, now 28m. You're in a refinement phase." "Alignment: Outcome 2 (faster debugging) has never been addressed across 8 sessions. This may become a gap." "Efficiency: Token efficiency improving — 18k tokens per file change early, now 12k." "Risk: File viewer has been in progress for 3 sessions without completing." Below the insights: per-session breakdowns.

**Why this moment matters.** The stats tab turns invisible work into visible patterns. No developer tracks their token efficiency across sessions. No one notices that an outcome hasn't been touched in 8 sessions. Canvas sees what you can't, because it has the data and the model to interpret it. The LLM-generated insights are clearly labeled (✶ spark icon, "LLM-generated" badge, "Regenerate" action) — Canvas never pretends AI conclusions are facts.

### Scene 3.8 — Session History

**The beat.** You tap the HISTORY tab. At the top: the currently running session (Dark mode, amber dot, 34m, "View →"). Below a "History" label: every completed session — Auth module (today, 1h 12m, "Built session panel with live status indicators," PR #47 linked), then older sessions going back days. Each has a title auto-derived from its first prompt, a one-line summary, duration, and a "Resume →" action. At the bottom: "+ 3 more sessions."

**Why this moment matters.** This is the final scene because it delivers the thesis: *nothing is ever lost*. Every session you've run lives here with a meaningful name, a summary, and a way back in. "Auth module" isn't `session_a3f2b1c` — it's a piece of work you can describe, find, and resume. This is the project memory that the CLI never had. The story ends with accumulation — your project is richer for having used Canvas.

---

## Design Decisions

Key decisions made during the design process, recovered from exploration artifacts and iteration history.

### 1. Session-First Sidebar

**The decision:** The sidebar lists sessions as primary elements. The project name is a label above them, not a clickable destination that expands to reveal sessions.

**What was rejected:** Sidebar A (project-first) showed projects as expandable rows with sessions indented underneath. Sessions were second-class — small text, no active state treatment, no status indicators. The project row was the primary interactive element.

**Why session-first won:**
- The active session must be unambiguous at a glance. Sidebar B achieves this with a left amber border, bold text, and an amber dot — three simultaneous signals.
- The project name is context, not navigation. You're always *in* a project. What matters moment-to-moment is *which session*.
- The pane title follows the same hierarchy: "redesign · Canvas-App" — session first, project second.
- Session-first maps directly to what users actually switch between. You switch sessions many times per hour. You switch projects a few times per day.

**Source:** sidebar-concept.html (A/B comparison, deleted in cleanup commit acd682c)

### 2. Theme Evolution: 10 Candidates → Carbon & Amber → Warm Maru

**The decision:** The final visual language is a warm, near-monochromatic palette on paper-toned off-white, with amber as the sole accent and a dark terminal zone.

**The exploration:** Ten theme directions were generated and ranked on design quality, distinctiveness, and polish:

| Rank | Theme | Score | Character |
|------|-------|-------|-----------|
| 1 | Phosphor Terminal | 9.0 | CRT phosphor green, retro computing — most distinctive |
| 2 | Arctic Monochrome | 8.4 | Scandinavian minimalism, typography-only hierarchy |
| 3 | Carbon & Amber | 8.1 | Mature dark, Raycast energy, thermal amber — **most shippable** |
| 4 | Midnight Indigo | 8.25 | Linear/Vercel dark, premium precision — safe choice |
| 5 | Paper & Ink | 8.15 | Warm parchment editorial, boldest light mode |
| 6 | Obsidian Gold | 7.7 | Bloomberg Terminal elevated, gold = success |
| 7 | Midnight Forest | 7.7 | Fully monochromatic green world |
| 8 | Slate & Terracotta | 7.3 | Clean SaaS light, Stripe/Vercel energy |
| 9 | Tokyo Night | 6.4 | Navy-purple cyberpunk — needs work |
| 10 | Sage Studio | 6.4 | Japanese minimalism — broken render, worth redo |

**The pivot:** Carbon & Amber (rank 3) was selected as "most shippable" — but the v1 storyboard rendered from it was rejected as "too heavy, too much chrome, bad sidebar, bad colors, bad fonts." The aesthetic brief was rewritten (v2) anchoring on Maru Coffee: the amber accent survived, but the dark chrome was replaced with warm paper whites. The result preserves Carbon & Amber's thermal tension (amber against neutral) while achieving Maru's invisible-framework philosophy. The dark terminal zone is the only surviving dark surface.

**Source:** theme-explorer.html (10 ranked themes, deleted in cleanup commit acd682c), design/aesthetic-brief.md (v2 Maru-Anchored)

### 3. Five-State Session Indicators

**The decision:** Sessions in the collapsed sidebar have five distinct visual states, each with a unique color and behavioral treatment.

| State | Bar Color | Text Color | Background | Behavior |
|-------|-----------|------------|------------|----------|
| **Waiting on you** | Amber solid | Amber | Subtle amber tint | Demands attention — your input needed |
| **Failed** | Red solid | Red | Subtle red tint | Demands attention — something broke |
| **Running** | Amber pulsing | Muted amber | None | Informational — work in progress |
| **Done (unread)** | White solid | Muted | Subtle white tint | Informational — new results available |
| **Done (read)** | Transparent | Near-invisible | None | Fades away — no longer relevant |

**Design logic:** The states form an attention hierarchy. Waiting and Failed both demand action — they get color backgrounds and vivid text. Running is ambient — it gets a pulsing animation (breathing, not urgent). Done-unread is a gentle nudge — it has presence but no urgency. Done-read fades to near-transparency — it's been acknowledged and should stop competing for attention. The progression from vivid to invisible maps directly to Outcome 2 (Respect Attention).

**Source:** collapsed-view.html (5-state spec with colors and animations, deleted in cleanup commit acd682c)

### 4. Progressive Disclosure in Act 2

**The decision:** The right panel (viewer) does not exist at the start of a session. It appears only when content earns its place — either Amplifier opens a file (Scene 2.2) or the user browses to one (Scene 2.3).

**Why this matters:** Most IDEs and dev tools show all panels on launch, even when empty. This creates visual noise and implies the user should be doing something with each panel. Canvas starts with terminal-only. The viewer appears when there's something to view. The APP tab appears when there's a dev server running. The ANALYSIS tab appears when a session has enough data to analyze. Each panel addition is an earned moment, not a default.

**Implementation detail:** The full-width terminal in Scene 2.1 isn't a different layout — it's the same layout with the right panel at width 0. The transition to two-panel in Scene 2.2 is a width animation, not a layout swap.

### 5. CLI-First Commit Workflow

**The decision:** Canvas never provides UI for git operations. Commits, pushes, and PRs happen in the terminal. Canvas shows the *results* in the CHANGES panel.

**What was rejected:** Early iterations included a commit message input box and action buttons in the right panel. These were removed because they contradicted the "additive, not replacement" principle — Canvas should never compete with the terminal for operations that developers already have muscle memory for.

**The result:** Scene 3.4 shows the user running `git add`, `git commit`, `git push`, and `gh pr create` from the terminal, while the CHANGES panel surfaces the PR status, CI results, and file diff. The CLI does the action. Canvas shows the receipt.

**Source:** PR #1 body — "Restored Act 3 Step 4 right panel to show PR result view... Removed commit message box and action buttons that contradicted the CLI-first commit workflow"

### 6. Session Auto-Naming from First Prompt

**The decision:** Sessions are named from the user's first prompt, not from a manual naming dialog or an auto-incrementing ID.

**Why:** "Session 1" and "Session 2" are meaningless. `session_a3f2b1c` is meaningless. "Auth module," "Dark mode," "Explore codebase" — these are intentions. The first prompt captures what the user is trying to do, making it the natural session name. This turns the session list from a collection of IDs into a narrative of work.

**Source:** PR #1 — "Fixed session naming throughout all 3 acts: Act 1-2 uses 'Explore codebase' (auto-named from first prompt), Act 3 uses 'Auth module' (main) and 'Dark mode' (worktree)"

---

## Design Language

Summarized from the v2 Maru-Anchored aesthetic brief. The full brief lives at [design/aesthetic-brief.md](design/aesthetic-brief.md).

### Palette

| Role | Color | Rationale |
|------|-------|-----------|
| Primary surface | `#F9F9F7` warm paper white | The dominant background. Not pure white (too cold), not gray (too sterile). Warm, slightly creamy — like unbleached cotton paper. This is the single most important color decision. |
| Secondary surface | `#F2F0EB` warm stone | Sidebar, panel backgrounds, hover states. A subtle temperature shift from primary — the sidebar should feel like a slightly different paper, not a different room. |
| Primary text | `#2A2A2A` warm charcoal | Not pure black. Avoids harshness of `#000000` on the warm white background. |
| Secondary text | `#A8A098` warm gray | Timestamps, metadata, file sizes, secondary labels. Muted but warm, not cool blue-gray. |
| Content accent | `#8A5A35` warm umber | Extremely sparing — active section indicators, visited links. Never a background color. |
| Terminal | `#0F0E0C` deep carbon | The terminal zone is the only dark surface. Creates a clear boundary between "where you type" and "where you see." |
| Status: active/accent | `#F59E0B` amber | Session indicators, active states, the pulsing running dot. Thermal warmth against the neutral palette. |
| Status: success | `#3ECF8E` emerald | The ONE functional saturated color. Done states, test passing, CI green. |

**What's not in this palette:** violet, blue, red (except failure states), orange, cyan, gradients. The shell is monochromatic and warm.

### Typography

- **Family:** Clean geometric sans-serif (Inter, Helvetica Neue, Suisse). Precise, not friendly.
- **Case hierarchy:** UPPERCASE + wide letter-spacing (0.08–0.12em) for navigation, labels, section headers. Sentence case for body content. This creates hierarchy without size variation.
- **Weight character:** Regular (400) for most things. Medium (500) for interactive elements. Semibold (600) for primary headings only. Bold (700+) is almost never used. The hierarchy is quiet, not shouty.
- **Mono:** SFMono-Regular / Menlo / Consolas for terminal content, file paths, timestamps. 11–11.5px, generous line-height (1.65).

### Key Anti-Slop Rules

1. **NO DARK SIDEBAR.** The sidebar is warm stone, not charcoal. The v1 dark sidebar was rejected. The differentiation between sidebar and content is a subtle temperature shift, not a light/dark split.
2. **NO CARD BORDERS.** No container outlines, no section dividers. Space and alignment define structure. If grouping is needed, use a background tone shift — never a border.
3. **NO SHADOWS on content.** Flat. Shadows exist only on modals and floating overlays. Maximum two shadowed elements on any screen.
4. **NO SATURATED COLORS in chrome.** The only saturated colors are amber (active/accent) and emerald (success). Everything else: warm whites, warm grays, warm charcoal.
5. **NO BOLD FONT WEIGHTS for UI chrome.** Max 600. The hierarchy is uppercase + tracking, not size + boldness.

### Reference Anchors

- **Maru Coffee** — primary aesthetic reference. Proves a digital interface can feel warm, natural, and modern simultaneously by making the UI framework invisible.
- **Linear** — structural reference for information density. Canvas needs to show session lists, file trees, and status data at Linear's density within Maru's visual philosophy.
- **Raycast** — energy reference. The speed and snappiness that Canvas must match — every interaction feels instant.
- **Craft.do** — tonal confirmation. Warm, organic, document-focused.

---

## Screen Inventory

Approved PNGs in `design/screens/` mapped to narrative scenes where applicable.

| PNG | Best Scene Match | Notes |
|-----|-----------------|-------|
| screen-1-welcome.png | 1.1 Welcome | Direct match |
| screen-2-new-project.png | 1.2 New Project | Direct match |
| screen-6-master.png | 1.3 / general | Master layout reference |
| screen-8-source-view.png | 2.2–2.4 | Source/file viewing |
| screen-9-app-preview.png | 2.5 App Preview | Direct match |
| screen-10-session-stats.png | 3.3 / 3.7 | Session analysis / stats |
| screen-11-progress.png | 3.2–3.3 | Session progress |
| screen-12-dual-sessions.png | 3.1 Start second session | Parallel worktrees |
| screen-13-notification.png | 3.2 Session completes | Toast notification |
| screen-14-merge.png | 3.4 Commit the changes | PR result view |
| screen-15-new-project.png | 1.2 variant | Alternate new-project |
| screen-20-settings.png | — | Not yet in storyboard |

---

## Open Threads

The story currently ends at "Nothing is ever lost" — project memory, session history, accumulated understanding. Acts 1–3 cover: first launch → first session → multi-session mastery → project-level awareness. The emotional arc reaches *ownership*. Here's where it could go next.

### Where Does Act 4 Begin?

Act 3 ends with a single project, fully understood. The natural next boundary is: **what happens when you have five projects?** Act 4's job-to-be-done might be: *stay organized across your entire portfolio of work, not just one project.*

Possible Act 4 beats:
- **Multi-project home.** A view above the project level — all your projects, their statuses, which ones need attention. The sidebar already has a "Projects" section header with a `+` button — this foreshadows multiple projects but Acts 1–3 never show more than one.
- **Cross-project notifications.** A background session in Project B completes while you're working in Project A. The sidebar shows it. How does the notification hierarchy work across projects?
- **Project switching.** What does the transition feel like? Does the terminal change? Does the viewer reset? What state is preserved?

### Where Does Act 5 Begin?

Act 5 might cross the single-user boundary.

Possible beats:
- **Settings and customization.** screen-20-settings.png exists but has no scene. Theme preferences, keyboard shortcuts, terminal configuration, model selection.
- **Sharing a session.** You completed a session that produced great work. Can you share its analysis view with a teammate?
- **Onboarding someone else.** Your project has memory. A new team member starts a session. Does the project context help them ramp up faster?
- **Team awareness.** Multiple people using Amplifier on the same repo. Whose sessions are running? What's been done?

### Questions Future Acts Need to Answer

1. **What's the maximum session count before the sidebar needs a different design?** The current sidebar shows 2–3 sessions comfortably. What about 10? 20? The collapsed 5-state indicator spec from collapsed-view.html suggests an 80px collapsed mode was explored.
2. **How does archiving work at scale?** Scene 3.8 shows "3 more sessions" — but what about 100? Is there search? Filtering? Date grouping?
3. **Does Canvas have its own persistence, or is everything derived from git + Amplifier?** The project overview's AI assessment implies Canvas stores data beyond what git contains. Where does it live?
4. **What happens when a session fails?** The 5-state indicator has a "failed" state (red bar, red text), but no scene shows it. What does the recovery flow look like?
5. **When does the AI assessment go wrong?** The "On track" banner and LLM insights are useful when they're right. What happens when they're not? Is there a correction flow?

---

## Appendix: Commit Timeline

For context on how this design evolved:

| Hash | Description |
|------|-------------|
| `52af40d` | Initial commit |
| `ba43877` | Add VISION.md |
| `11c56c2` | Add VISION.md and OUTCOMES.md |
| `9e2a4e4` | Storyboard: session naming, worktree isolation, PR result view (PR #1) |
| `acd682c` | Major cleanup: reorganize design assets, remove expendable explorations |

The exploration artifacts (act3-screens.html, sidebar-concept.html, theme-explorer.html, collapsed-view.html) were created during the `9e2a4e4` era and removed in `acd682c`. Their design decisions survive in this document and in screens.html.