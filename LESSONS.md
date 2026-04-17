# LESSONS — Canvas

Patterns learned the hard way. Every entry backed by git evidence. Read at session start.
Add entries when a mistake repeats. No bandaid fixes without a lesson filed.

---

## The Pattern (what we are breaking)

In 10 days (2026-04-07 → 2026-04-17) this repo produced 185 commits.

- `fix:` was 37/185 ≈ **20%** of commits. Healthy is 10–15%. Evidence of rework, not delivery.
- Peak day: **47 commits on 2026-04-08**. That is not velocity — that is thrash.
- Top-thrashed file: `src/renderer/src/App.tsx` — **39 touches in 200 commits** (every 5 commits).
- Same UI tabs redesigned **4 times in 14 days** (see L2 evidence).
- First time an E2E smoke test ran (2026-04-17) it caught a live regression on `main` that any user would hit.

Translation: shipping broke things, fixes broke things, nobody noticed until the owner tried to use the app.

This file exists so the next session does not repeat it.

---

## L1. No broken commits. Gate is non-optional.

**Rule:** every commit passes `npm run precommit` (build + smoke). Husky enforces. Bypass
(`git commit --no-verify`) requires justification in the body.

**Evidence:** pre-commit gate installed in `f06a7df`. First run caught a regression (`55a8132`)
that had been on `main` since the Overview redesign (`11292d7`, 2026-04-14): clicking a
project put the app in `viewMode='project'`, and no session handler cleared that viewMode,
so the terminal was hidden forever behind ProjectView. Users could not start a new session
from a project. Nobody noticed for days because no test covered the click-path.

**What to do:** never bypass the gate. If smoke fails, fix smoke first. If the fix is
structural, update the spec before coding.

---

## L2. Do not redesign. Iterate on contracts.

**Rule:** no "complete rewrite" or "redesign to 9/10 quality" commits. A redesign without
measurement is churn. Before touching a component, write down (a) what it does today,
(b) what's wrong, (c) the minimal change that fixes it.

**Evidence:** in 14 days the same Project tabs were redesigned four times:
- `8ba074d` — redesign Project Overview, History, Stats tabs to 9/10 quality
- `11292d7` — redesign overview tab as project-level dashboard
- `b93aa00` — redesign History tab — human sessions primary, agent usage card
- `86f367c` — redesign session discovery
- `a50ade7` — complete Sidebar rewrite to match Act 1 canvas.html spec
- `e90c7d0` — Complete rewrite of the watcher to fix two critical bugs
- `af351b2` — REVERT terminal output scanner

Each one shipped new bugs the next one had to fix.

**What to do:** treat the current implementation as the contract. Change behavior, not shape,
unless the contract itself is the bug (in which case write the new contract FIRST as a spec).

---

## L3. One concern per commit. Never mix four fixes in one diff.

**Rule:** a commit does one thing. If the commit message needs "and" or a comma-list of
components, it's too big. Split it.

**Evidence:**
- `bfd082d` — "fix: terminal scanner, watcher slug capture, PTY ownership tracking,
  and workDir resolution" — **34 files, 889 insertions, 245 deletions**, four distinct
  concerns in one diff. When one of those fixes regressed, the bisect surface was the
  whole commit.
- `a74ca1c` — "feat: outcome-centric dashboard — replace tool metrics with user outcomes"
  — **12 files, 1557 insertions, 527 deletions**. Cross-cutting rewrite of metrics,
  dashboard, scanner, types. Mixed-concern.

**What to do:** before committing, run `git diff --stat`. If it touches more than ~5 files
or crosses module boundaries, split. Conventional commits enforce this implicitly —
`fix(watcher): ...` and `fix(scanner): ...` should be different commits.

---

## L4. Observation before fixes. No flailing.

**Rule:** when a test fails, run the full suite FIRST to collect all failures. Do not fix
the first one you see. Categorize. Then fix in batches.

**Evidence:** the pre-existing E2E suite runs for 120s and tolerates "known failing" tests.
This is the exact anti-pattern: failures are normalized, signal is lost, the next regression
hides in the noise. Smoke caught a regression in 6s that had been hiding for days.

**What to do:** obey `integration-testing-discipline` — observe first, fix in batches, no
fixes during observation. A failed test is information. Data-gather before reacting.

---

## L5. "Pre-existing failure" is banned vocabulary.

**Rule:** a test that fails on main is either a real bug (fix it) or not a real contract
(delete it). There is no third option. "Known broken, we'll get to it" is how the 20%
fix rate happened.

**Evidence:** `e2e/viewer.spec.ts` is 1,242 lines with chronic flakes. Nobody owns the
contract; everyone steps around it. Meanwhile App.tsx gets thrashed 39 times.

**What to do:** first PR on any session that touches a file with tolerated failures must
either fix the failures or remove them. No session ends with `--skip`, `.skip()`, `.only()`,
or comments saying "flaky — investigating".

---

## L6. Contracts before bandaids.

**Rule:** the top-5 thrashed files need written contracts. A session starting work on
`App.tsx`, `ipc.ts`, `Sidebar.tsx`, `types.ts`, or `db.ts` reads the contract first
and updates it if the change alters the shape.

**Evidence (touches per file, last 200 commits):**

| File                                      | Touches | Evidence of shape drift |
|-------------------------------------------|---------|--------------------------|
| `src/renderer/src/App.tsx`                |   39    | 4 handlers missed viewMode fix |
| `src/main/index.ts`                       |   32    | IPC registration scattered |
| `src/main/ipc.ts`                         |   30    | mixed with files, project ops |
| `src/renderer/src/components/Sidebar.tsx` |   29    | rewritten fully (`a50ade7`) |
| `src/shared/types.ts`                     |   24    | churn on shared type surface |

Each session re-derives the shape from reading code. No canonical view means contradictions
go unnoticed (e.g. onSessionSelect vs onNewSession vs onResumeSession diverged).

**What to do:** when a file hits this list, the next touch must add a header comment
documenting (a) inputs, (b) outputs, (c) invariants. Subsequent edits must update it or
delete it. Shape-drift commits that leave the header stale are rejected.

---

## L7. Revert is cheap. Work-in-progress is stashable.

**Rule:** when a session is in a broken state, `git stash push -m "<context>"` before
exploring. Stashes are recoverable. Un-stashed broken working trees are lost when the
next session clones fresh.

**Evidence:** on 2026-04-17 the session opened with `SessionAnalysis.tsx` rewritten but
broken, plus 7 untracked mockups. Revert via stash preserved the work (`git stash list`
shows `stash@{0}`) while restoring a clean tree to test the actual `main`.

**What to do:** never overwrite or discard a working state. Stash with a descriptive
message. Document recovery path in the follow-up commit body.

---

## L8. The owner must be able to use the app. That's the usability bar.

**Rule:** a session does not end until the owner can launch the app, create/resume a
session, type a command, and see output. Smoke enforces this programmatically. A session
that leaves smoke red has failed, regardless of features shipped.

**Evidence:** on 2026-04-17 the owner reported "I cannot even use it myself. It's
completely broken." Commits 55a8132 + f06a7df fixed the viewMode regression and installed
the gate in the same session. Without smoke, it would have shipped again.

**What to do:** treat smoke as the definition of "done". Feature work is gated by smoke.
No merges, no pushes, no releases with red smoke.

---

## L9. Say what you did, not what you are about to do.

**Rule:** do not pre-announce work. Do the work, then report what changed, what was
verified, and what you decided. This matters because (a) it reduces meta-chat and
(b) forces the work to exist before the narration.

**Evidence:** multiple sessions in the log have long pre-planning narration followed by
partial execution. User (non-technical) has no way to verify claims until artifacts exist.

**What to do:** execute, then report with artifacts (commit SHAs, test output, file paths).
Ask only for product-level decisions, not tactical ones.

---

## L10. Stop conditions are hard limits.

**Rule:** stop when you hit any of these. Do not work around them.

- **Blocker** — can't proceed without owner decision. Mark, ask once, stop.
- **Ambiguity** — two equally valid paths. Surface, do not guess.
- **3x failure on same approach** — it's architectural. Step back, rethink.
- **Coherence loss** — you've changed direction 3+ times. Exit cleanly, update this file.

**Evidence:** the redesign churn in L2 is what "not stopping" looks like. Each redesign
followed a fix that was a bandaid on a prior redesign.

**What to do:** when stop conditions fire, stop. File a lesson here. Next session picks
it up with the right framing.

---

## L11. Native-module ABI trap: `npm test` destroys Electron's better-sqlite3 binding.

**Rule:** running `npm test` (vitest) rebuilds better-sqlite3 for Node ABI, which leaves
Electron unable to load it. Until `electron-rebuild -w better-sqlite3` runs, the app
launches but every DB query fails. Smoke shows this as S1 pass / S2-S4 fail.

**Evidence:** hit it this session after observing E2E failures (commit a6b9425 prep).
Smoke ran in 5.7s earlier, then 44s + 3 fails after an intervening `npm test`. One
`npx electron-rebuild` → back to 5.7s green.

**Structural fix (shipped):**
- `posttest` script: restores Electron ABI after vitest.
- `precommit` prepends `electron-rebuild -w better-sqlite3` as a safety net.
  Idempotent when ABI is already correct, so normal commits stay fast.

**What to do:** if smoke ever fails with S1 green / S2+ failing, first move is
`npx electron-rebuild` — not code inspection.

---

## Additions

When a new pattern emerges, add an L-numbered entry with: **Rule**, **Evidence** (SHAs
+ numbers), **What to do**. Keep entries terse. Delete entries when the pattern has
been structurally eliminated (document in the commit body).
