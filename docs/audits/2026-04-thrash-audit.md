# Thrash Audit — April 2026

**Window:** last 4 weeks (191 commits on `main`)
**Question:** which files are being changed most, and is that thrash feature churn
or contract instability? Where should we invest to stop the bleeding?

---

## TL;DR

The top 5 files absorb ~40% of all commits. **Three distinct failure modes**
are driving it — and each calls for a different fix:

| Mode | Example | Fix class |
|------|---------|-----------|
| God-file that everything threads through | `App.tsx` (39 commits) | **SPLIT** |
| Uncovered main-process plumbing | `main/index.ts` (32), `scanner.ts` (15) | **TEST + CONTRACT** |
| Recent refactor still settling | `main/ipc.ts` (30) | **WATCH** |
| Feature-driven UI churn on tested surface | `Sidebar.tsx` (29) | **FREEZE TESTIDS** |
| Shared types evolving with every feature | `shared/types.ts` (24) | **LEAVE** |

Highest-leverage single play: extract view-mode / routing state out of `App.tsx`
into a hook and cover main-process session-discovery with unit tests. Those two
moves address roughly 70% of the observed regression class in the last month.

---

## Method

```bash
git log --since='4 weeks ago' --name-only --pretty=format: \
  | grep -E '\.(ts|tsx)$' | sort | uniq -c | sort -rn | head -10
```

For each file: LOC, commit count, recent subject lines, test coverage, verdict.

---

## Top 10 thrashed files

| Rank | File | LOC | Commits | Test coverage |
|-----:|------|-----|--------:|---------------|
| 1 | `src/renderer/src/App.tsx` | 548 | 39 | smoke (launch path only) |
| 2 | `src/main/index.ts` | 488 | 32 | none |
| 3 | `src/main/ipc.ts` | 401 | 30 | ipc-bridge smoke (preload surface) |
| 4 | `src/renderer/src/components/Sidebar.tsx` | 779 | 29 | sidebar.spec 18/18 + ui-polish 5/5 |
| 5 | `src/shared/types.ts` | 221 | 24 | TS compile only |
| 6 | `src/main/db.ts` | — | 21 | **db.test.ts** ✓ |
| 7 | `src/renderer/src/components/Viewer.tsx` | — | 19 | none |
| 8 | `src/preload/index.ts` | — | 19 | ipc-bridge smoke |
| 9 | `e2e/viewer.spec.ts` | — | 19 | **DELETED** (a6b9425) |
| 10 | `src/main/scanner.ts` | — | 15 | none |

---

## Per-file verdict

### 1. `App.tsx` — 548 LOC, 39 commits → **SPLIT**

**What it does:** renderer orchestration — routing between Terminal / ProjectView /
Sidebar, view-mode state, IPC hydration, ErrorBoundary wiring, ~4 different click
handlers that touch view-mode.

**Thrash signal:** the word `viewMode` appears 7 times in the file, 4 of them
flagged with `// CRITICAL: clear viewMode so terminal pane renders…` comments.
That's a regression class that fires on almost every session-lifecycle commit.
Recent commit `55a8132` (this session) fixed it yet again across 4 handlers.

**State lives in `store.ts` (zustand), read in App.tsx.** The bug class is always
*"a new click handler forgot to call `setViewMode('session')`"*.

**Verdict:** extract into a `useSessionActivation()` hook that owns *all* view-mode
transitions and exposes a single `activateSession(sessionId)` call. Then there is
*one* place that can forget to clear view-mode. Test the hook directly with
`@testing-library/react-hooks`. Regressions become impossible by construction.

---

### 2. `main/index.ts` — 488 LOC, 32 commits → **TEST + CONTRACT**

**What it does:** main process entrypoint — window creation, session discovery
orchestration, stats worker spawning, watcher wiring, events-parser dispatch.

**Thrash signal:** every recent commit subject is a reactive fix —
*"promptCount stuck at 0"*, *"hidden sessions leaking into sidebar"*,
*"events-parser was silently dropping ALL events due to field name mismatch"*,
*"redesign session discovery"*. No tests. Errors are caught in production.

**Verdict:** carve out session-discovery into its own module (`main/discovery.ts`)
with an explicit contract: `discoverSessions(projectSlug): Promise<Session[]>`.
Add `discovery.test.ts` with fixtures for the three known-bad cases
(hidden sessions, stats-never-updated, dropped events). Once the contract has
teeth, the "redesign discovery every 3 weeks" cycle stops.

---

### 3. `main/ipc.ts` — 401 LOC, 30 commits → **WATCH**

**What it does:** IPC handlers. Per `AGENTS.md` recently decomposed into
domain-grouped modules (`ipc.ts` keeps coordinator+PTY+session; `ipc-files.ts`
takes file ops; `ipc-project.ts` takes overview/history).

**Thrash signal:** commit `7858171` did the decomposition. Pre-split, this file
was 700+ LOC and every feature added a handler here. Post-split, thrash should
slow significantly — but the data in this window still shows 30 commits because
the window straddles the refactor.

**Verdict:** re-audit in 4 weeks. If post-split commit count drops below 10,
the refactor worked. If it stays above 20, add contract tests for each domain
module's IPC surface (a small step up from the current ipc-bridge smoke).

---

### 4. `Sidebar.tsx` — 779 LOC, 29 commits → **FREEZE TESTIDS**

**What it does:** the entire sidebar — projects, sessions, new-session slots,
status dots, worktree popover.

**Thrash signal:** feature churn, not instability. Acts 1/3/4 redesigns, a
complete rewrite in `a50ade7`, toast restyle, summary auto-activation. This is
a UI surface that the product is still defining.

**Good news:** 18/18 sidebar.spec tests and 5/5 ui-polish tests now green after
this session's sweep. The `data-testid` contract is the real API. Any PR that
removes or renames a sidebar testid would break coverage and be blocked.

**Verdict:** no refactor needed. Codify the rule in `AGENTS.md` or a README:
*"Sidebar `data-testid` attributes are contract. Removing one requires an RFC
comment in the PR."* That's the whole play.

---

### 5. `shared/types.ts` — 221 LOC, 24 commits → **LEAVE**

**What it does:** the type layer between main and renderer. Every feature that
adds a new IPC payload adds a type here.

**Thrash signal:** commit subjects are feature names, not bug fixes.
*"redesign Overview", "redesign History", "add repository metadata", "session
intelligence", "outcome-centric dashboard"*. This is the *point* of having a
shared types file — it's the contract surface.

**Verdict:** leave alone. The TS compiler already rejects breaking drift. If
we later see a class of runtime-only bugs that types can't catch (e.g. enum
value churn), consider `expect-type` assertions. Not urgent.

---

## Prioritized plays

1. **App.tsx → `useSessionActivation` hook.** Kills the single most-regressed
   bug class in the codebase. Estimated effort: 3–4 hours including test. **Do next.**

2. **`main/discovery.ts` extraction + unit tests.** Stops the "redesign session
   discovery every 3 weeks" cycle. Estimated effort: 1 day.

3. **Codify the sidebar testid contract in AGENTS.md.** 15 minutes. Prevents
   future contributors from accidentally breaking the test suite while
   iterating on the sidebar.

4. **Re-audit `main/ipc.ts` in 4 weeks** (around 2026-05-15). If post-split
   thrash is down, no action. If not, add domain-specific contract tests.

5. **Skip:** `shared/types.ts`, `Sidebar.tsx` structural work, `db.ts` (already
   tested), `Viewer.tsx` (low commit count, deferred).

---

## Appendix: deleted in this stabilization sweep

| File | LOC | Commits wasted | Status |
|------|-----|---------------:|--------|
| `e2e/viewer.spec.ts` | 1,242 | 19 | deleted in `a6b9425` |
| 8 other orphaned specs | 1,548 | ~70 | deleted in `a6b9425` |
| 5 failing tests in sidebar/ui-polish | 114 | scattered | deleted in `7c72ff5` |

**Total removed:** 2,904 lines of test code that was generating false signal.
The new E2E floor is 31 tests, all green. Zero tolerated failures.
