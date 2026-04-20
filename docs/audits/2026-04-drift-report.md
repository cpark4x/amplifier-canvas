# Drift Report — canvas.html vs Shipped UI

**Date:** 2026-04-20
**Method:** Side-by-side inventory of canvas.html (design prototype, 22 scenes) and the shipped React app (20 components, ~8,300 LOC renderer).
**Purpose:** Identify what the design promises that reality doesn't deliver, what reality delivers that the design doesn't specify, and where they substantially match.

## Executive summary

| Metric | Count |
|--------|-------|
| Canvas.html scenes inventoried | 22 (3 acts) |
| Shipped UI surfaces inventoried | 11 buckets |
| **Full matches** (design = reality) | 6 |
| **Minor drift** (close but off) | 4 |
| **Major drift** (structurally different) | 5 |
| **Missing** (designed, not built) | 12 items |
| **Extras** (built, not designed) | 11 items |

**Headline:** Act 1 (onboarding) is in very good shape — design and code are ≥90% aligned. Act 2 (file viewer emergence) has moderate drift — the underlying primitives exist but the *narrative UX* around them (contextual labels, Canvas-inserted narration, tool-call collapsing) does not. Act 3 (intelligence) has major drift — shipped implementations differ structurally from the design for the SUMMARY tab, OVERVIEW tab, and STATS tab. **The CHANGES primary tab does not exist in shipped code at all.**

**The single biggest gap:** shipped ProjectView invented its own information architecture (Identity / At a Glance / Activity+Health / Needs Attention / Recent Work) instead of implementing the designed one (Vision / Outcomes / Status + ✨ AI assessment banner). Neither is wrong — but they are not the same product.

Note on Acts: **canvas.html has 3 Acts, not 4.** What the dev team called "Act 4 Project Intelligence" during development corresponds to canvas.html's Act 3 Steps 6–8. The design has always been 3-act. STATE.yaml's Act 4 framing (committed earlier today in Phase A) is a dev-team convention, not a design convention — worth reconciling in a later doc phase.

---

## Missing — designed but not built

Items present in canvas.html with no corresponding implementation in shipped code.

### Critical (affects core scenes)

**1. CHANGES primary tab (Act 3 Step 4, scene 3.4)**
The designed viewer has four primary tabs: FILES, APP, SUMMARY, **CHANGES**. Shipped viewer has three (FILES, APP, SUMMARY). CHANGES tab content — PR status, CI status, commit hash, branch arrow, added/removed counts, GitHub link, file list with +/- deltas — does not exist anywhere in the code.

**2. Status hero block in SUMMARY tab (Act 3 Steps 3, 3a, 3b)**
Designed SUMMARY tab opens with a hero block: TLDR paragraph, colored status line (`✓ All tests passing · build clean · PR #47 opened` green / `✗ Build broken · 2 type errors` red / `⏸ Session paused · last active 8 days ago` amber), stats row (duration, prompts, files, tokens, absolute date). Shipped SessionAnalysis has a mechanical header with `title`, `promptCount`, `toolCallCount`, and a small test-status fragment. No TLDR. No status hero. No stats row with files/tokens/date.

**3. "Where you left off" trail (Act 3 Steps 3, 3a, 3b)**
Designed SUMMARY tab shows a reverse-chronological trail — `T:31`, `T:28`, `T:22` — summarizing the last several turns so a returning user sees continuation, failure cause, or paused-state reason at a glance. No equivalent in shipped SessionAnalysis.

**4. Vision + Outcomes sections on OVERVIEW tab (Act 3 Step 6)**
Designed OVERVIEW has three content sections: Vision, Outcomes (three rows with status dots and "In progress"/"Not started"/"Too early" badges), Status. Shipped has six different cards: Since your last visit, Identity, At a Glance, Activity+Health, Needs Attention, Recent Work. No Vision section. No Outcomes section.

**5. "✨ AI assessment / On track" banner (Act 3 Step 6)**
Designed OVERVIEW opens with a sparkle-icon banner showing assessment verdict, supporting metrics, and a "Regenerate" button. No equivalent in shipped ProjectOverviewTab.

**6. LLM-generated Insights on STATS tab (Act 3 Step 7)**
Designed STATS has a "✨ LLM-generated Insights" section with four narrative paragraphs labeled Velocity / Alignment / Efficiency / Risk. Shipped STATS has quantitative cards (How you spent your time, What was shipped, Needs attention, Averages) with no LLM-narrated insight layer.

### Narrative UX (Canvas-inserted chrome around raw terminal)

**7. Tool-call collapsing in terminal (Act 2 Step 1)**
Designed terminal shows four `read_file` calls collapsed into `✓ 4 files read`. Shipped terminal is raw xterm output — whatever the Amplifier CLI emits is what the user sees. No rollup rendering.

**8. "Session restored" separator (Act 1 Step 3c, scene 1.4 Existing path)**
Designed resumed-session terminal shows prior conversation, then `—— session restored ——————————————`, then cursor. Shipped terminal shows raw PTY output — no synthesized separator line.

**9. Terminal auto-narration (Act 2 Steps 2, 5)**
Designed terminal emits Canvas-inserted messages like `Opening VISION.md in viewer →` and `Opening web preview in panel →`. Shipped terminal is PTY passthrough — no Canvas narration.

**10. Pane title done-state formatting (Act 1 Step 4, scene 1.2)**
Designed pane title for completed sessions: `✓ Improve error handling · amplifier-canvas done · 2h 14m · Tuesday 11:42 PM`. Shipped pane title: `{session.title} · {session.projectName}`. No checkmark prefix, no duration, no absolute-time suffix.

**11. "Opened by you" / "Opened by Amplifier" labels on file tabs (Act 2 Steps 2, 4)**
Designed viewer labels every opened file with its provenance — either "Opened by you" or "Opened by Amplifier" — above the rendered content. Shipped viewer uses colored dots on tab labels instead (read=green, write=amber, edit=blue) but no text provenance label.

**12. App preview auto-detection (Act 2 Step 5)**
Designed: Canvas detects dev server URLs in terminal output and auto-opens APP tab with embedded webview. Shipped: detection is wired in Terminal.tsx (lines 58–63) but main process does not emit dev server URLs. APP tab renders but never auto-populates.

---

## Major drift — built but structurally different

These are shipped, but the shipped version substantially disagrees with the design's structure or vocabulary.

**D1. SUMMARY tab information architecture**
- Designed sections: TLDR hero, Status, Stats row, Session details (collapsed), Where you left off, Prompts (collapsed), Key moments (collapsed), Next steps (collapsed).
- Shipped sections: mechanical header, Prompt History (collapsed), Summary, Changes, Key Moments, Next Steps, Decisions, Action Items, Open Questions.
- **Overlap:** Key moments, Next steps, Prompts.
- **Divergence:** Shipped has Decisions / Action Items / Open Questions (not in design). Designed has TLDR / Status / Stats row / Where-you-left-off / Session-details (not shipped).

**D2. OVERVIEW tab information architecture**
See Missing #4 — design and reality are essentially non-overlapping products. Both are reasonable; they are not the same thing.

**D3. STATS tab information architecture**
- Designed metrics: Sessions, Total time, Tokens, Files touched (2×2 grid) + LLM insights (Velocity/Alignment/Efficiency/Risk) + Per session list.
- Shipped metrics: Commits, Deep work sessions, Time invested, Needs attention (4-box row) + "How you spent your time" stacked bar (deep work/quick tasks/automated/failed) + "What was shipped" commit groups + "Needs attention" stalled sessions + "Averages" (prompts/tool calls/duration/delegation depth).
- **Overlap:** Time invested ≈ Total time.
- **Divergence:** Everything else.

**D4. HISTORY tab sections**
- Designed sections: "Currently open" block + History list with PR links.
- Shipped sections: "Waiting for you" pinned banner + Agent Usage card + search bar + "My Sessions / Automated" filter toggle + date-grouped timeline (Today/Yesterday/This Week/This Month/Older) + commit rows + automated-runs collapsible.
- Shipped is MORE feature-rich than design, but "Currently open" separation and per-row PR links are missing. The shipped Resume button exists but inline on each row rather than in a dedicated "Currently open" section.

**D5. Worktree popover behavior**
- Designed: user picks main vs create-worktree from popover; choice drives session creation with correct worktree.
- Shipped: WorktreePopover renders visually ✓. User can click choices. **But the choice is ignored** — `Sidebar.handlePopoverSelect` discards the worktree info and always calls `onNewSession` with no worktree context. Main process decides the worktree independently. The popover is cosmetic.

---

## Minor drift — close but off

**M1. Existing-projects discovery rows (Scene 1.3 Existing tab)**
Designed rows show: name, session count, last-active time, file path. Shipped rows show: name, file path. Missing session count and last-active metadata per row.

**M2. Toast completion copy (Act 3 Step 2)**
Designed: "Auth module completed". Shipped: "✓ {title} just finished". Tone and punctuation differ slightly; the Review action is present in both.

**M3. File browser — root label**
Designed: file tree shows project folders directly (`src/`, `public/`, then files). Shipped FileBrowser uses a breadcrumb with "root" as the top label; the tree view itself is flat per directory rather than an expandable tree. Close but not identical.

**M4. Session status labels**
Designed labels: "just started" (amber), "active" (green when ready for input), "running" (amber mid-turn), "done" (green check badge), "failed" (red), "paused" (amber). Shipped labels: "just started" ✓, "running" ✓, "done · {duration}" ✓, "failed" ✓, "stopped" — but no "active" distinct from "running", and no "paused" label. The "needs input" state exists in shipped code (amber) but is conceptually different from the designed "active" (ready for input, green).

---

## Extras — built but not in canvas.html

Worth keeping in view, especially as design source catches up to reality.

**E1. SettingsModal** — analysis model + provider configuration. Reasonable utility; no design counterpart.

**E2. Context menus** — right-click project → "Remove from Canvas"; right-click session → "Stop" + "Remove from view". No design counterpart.

**E3. Agent Usage card** (HISTORY tab) — "1,234 total delegations" with agent-name pill list.

**E4. Search box + My Sessions/Automated filter toggle** (HISTORY tab) — substantial feature; helps at scale.

**E5. Date-grouped timeline** (HISTORY tab) — Today/Yesterday/This Week/This Month/Older.

**E6. Automated-runs collapsible** (HISTORY tab) — hides noise from delegated agent runs.

**E7. ErrorBoundary wrapping** — Sidebar, ProjectView, Viewer each wrapped.

**E8. "Since your last visit" card** (OVERVIEW) — commits + stalled sessions since `lastVisitedAt`.

**E9. Health bar** (OVERVIEW) — 5px green/red segment bar, success rate percentage.

**E10. Trend badges** (OVERVIEW) — "Picking up" / "Steady" / "Slowing down" / "Dormant" / "Just started".

**E11. Lifecycle badges** (OVERVIEW) — "New project" / "Active" / "Mature" / "Dormant".

---

## Full matches — shipped = designed

**F1. Welcome screen (Scene 1.1)** — logo, "Welcome to Canvas", subtitle, "Create your first project →" CTA, empty sidebar with "No projects yet". Exact copy match.

**F2. New-project modal shell (Scene 1.3 New)** — modal overlay, title "Add Project", New/Existing tabs, Project Name + Location (derived, disabled) + Bundle (foundation selected, custom disabled), Cancel + "Create Project →". Exact copy match.

**F3. Choose-action modal (Scene 1.3 Choose action)** — project name as title, path as subtitle, "Start new session" primary row with "Fresh Amplifier session in this project" subtitle, "Or resume" section, up to 3 recent sessions listed, Cancel only in footer. Exact copy match.

**F4. Sidebar structure (Scene 1.2)** — project rows with expand chevron, uppercase names, `+` button on expanded row, indented session rows, "Add project" bottom pill, muted collapsed-project rows with last-activity time. Structure matches.

**F5. Three-pane layout (Act 2)** — Sidebar + center + right panel with viewer closes to 0 width. Sidebar collapsible via chevron. Matches.

**F6. Toast + session completion badge (Act 3 Step 2)** — green checkmark on done sessions, toast slide-in with Review action. Behavior matches.

---

## Triage recommendations

Ranked by leverage (impact ÷ effort):

**Tier 1 — high leverage, moderate effort**

1. **Build CHANGES tab (Missing #1).** Single most visible gap. Maps directly to user complaint #6 ("doesn't match canvas.html"). PR/CI/commit data already flows into the DB; the tab is a render surface. Estimate: 1–2 days.

2. **Rebuild SUMMARY hero block (Missing #2, Drift D1).** TLDR + status hero + stats row reframes the SUMMARY tab so it answers "what happened?" at a glance instead of "here are seven AI-generated sections". Use existing session-analysis fields. Estimate: 1 day.

3. **Add Vision + Outcomes sections to OVERVIEW (Missing #4, Drift D2).** Both exist elsewhere in repos (VISION.md, OUTCOMES.md). Read and render. Keeps shipped E8–E11 as supporting cards. Estimate: 1 day.

**Tier 2 — medium leverage, moderate effort**

4. **Honor worktree choice (Drift D5).** Popover exists, choice is thrown away. Wire handlePopoverSelect → onNewSession with worktree info. Estimate: half a day.

5. **Add terminal session-restored separator and auto-narration (Missing #8, #9).** Narrative UX that makes Canvas feel like a product, not a PTY shell. Estimate: half a day.

6. **Canvas pane title done-state formatting (Missing #10).** Small UI polish; high visibility. Estimate: 1–2 hours.

**Tier 3 — lower leverage or higher effort**

7. LLM insights on STATS (Missing #6, Drift D3). Needs an LLM-side prompt and some session-level aggregation — meaningful build, unclear ROI until #1 and #2 are done.
8. Tool-call collapsing in terminal (Missing #7). Requires parsing Amplifier's output format. Fragile without upstream cooperation.
9. "Opened by you / Amplifier" labels (Missing #11). Currently conveyed via colored dots; text labels are clearer but less compact. Low-stakes.

**Do not do yet**

- App preview auto-detection (Missing #12) — needs main-process dev-server URL emission, which is a separate engineering surface. Deferred per Scene 2.5 in STATE.yaml.

---

## Raw scene-by-scene diff

| Act | Scene | Canvas.html line | Status | Notes |
|-----|-------|------|--------|-------|
| 1 | 1.1 | 1487 | FULL MATCH | Welcome screen, exact copy |
| 1 | 1.3 New | 1563 | FULL MATCH | New project modal, exact |
| 1 | 1.4 | 1675 | MINOR DRIFT | First session starts; pane title lacks scene's checkmark/duration suffix |
| 1 | 1.3 Existing | 1767 | MINOR DRIFT (M1) | Discovery list missing session count + last-active per row |
| 1 | 1.3 Choose | 1913 | FULL MATCH | Choose-action modal, exact |
| 1 | 1.4 Existing path | 2036 | MISSING (#8) | No "—— session restored ——" separator |
| 1 | 1.2 | 2135 | MISSING (#10) | Returning user; pane title lacks done-state formatting |
| 2 | Step 1 | 2270 | MISSING (#7) | No tool-call collapse; raw PTY output |
| 2 | Step 2 | 2353 | MISSING (#9, #11) | Viewer opens ✓ but no "Opening X →" narration, no "Opened by Amplifier" label |
| 2 | Step 3 | 2467 | MINOR DRIFT (M3) | Browse button ✓; file tree is breadcrumb not expandable tree |
| 2 | Step 4 | 2573 | MISSING (#11) | Multi-file tabs ✓; no "Opened by you" provenance label |
| 2 | Step 5 | 2687 | MISSING (#12) | APP tab exists ✓; no auto-detection of dev server URLs |
| 3 | Step 1 | 2827 | MAJOR DRIFT (D5) | Worktree popover renders ✓; choice ignored |
| 3 | Step 2 | 2914 | MINOR DRIFT (M2) | Toast + completion badge work; copy slightly differs |
| 3 | Step 3 | 3025 | MAJOR DRIFT (D1) + MISSING (#2, #3) | SUMMARY tab lacks hero block, status, where-you-left-off |
| 3 | Step 3a | 3188 | MISSING (#2) | Failed-state status chrome not rendered |
| 3 | Step 3b | 3364 | MISSING (#2) | Paused-state status chrome not rendered |
| 3 | Step 4 | 3538 | MISSING (#1) | CHANGES tab does not exist |
| 3 | Step 5 | 3695 | MINOR DRIFT | "New session" slot ✓; terminal exit messaging is PTY-native |
| 3 | Step 6 | 3788 | MAJOR DRIFT (D2) + MISSING (#4, #5) | OVERVIEW has different IA; no Vision/Outcomes/AI-assessment |
| 3 | Step 7 | 3922 | MAJOR DRIFT (D3) + MISSING (#6) | STATS has different metrics; no LLM insights |
| 3 | Step 8 | 4051 | MAJOR DRIFT (D4) | HISTORY is feature-richer than design; missing "Currently open" separation + PR links |

---

## Conclusion

The product is not adrift. Act 1 is strong. Act 2's primitives are in place. Act 3 has shipped the hardest engineering (PTY management, real session tracking, DB pipeline, analysis service) but diverged on presentation — particularly the SUMMARY, OVERVIEW, STATS IAs and the absent CHANGES tab.

Three concentrated bets recover most of the drift: ship the CHANGES tab, rebuild the SUMMARY hero, add Vision/Outcomes to OVERVIEW. After that, the Act 3 rewards users were promised (legible, opinionated, narrative) land.
