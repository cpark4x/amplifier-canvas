# Live Data Layer Design

## Goal

Complete the analysis view's third layer. When a session created a PR, Canvas shows the current state of that PR — open/merged/closed, CI check status (passing/failing/pending), merge conflicts — directly in the analysis view. The user gets the full session story without leaving Canvas or going to GitHub.

## Background

The Phase 2 analysis view ([2026-04-09 design](./2026-04-09-phase-2-analysis-view-design.md)) established a three-layer architecture:

1. **Mechanical layer** (instant) — stats, prompt history, test results, file list
2. **AI layer** (async, ~2-3s) — summary, key moments, next steps, curated sections
3. **Live data layer** (on demand) — PR status, CI checks

Layers 1 and 2 are shipped. The live data layer was specified in the Phase 2 design but not yet built. This document details its implementation.

The Storyboard (Scene 3.4) describes the canonical experience: "PR #47 opened · no conflicts," CI status (green dot, 14/14 checks), and a "View PR #47 →" link in amber. This feature delivers exactly that — the receipt for your work, always fresh, without context-switching to GitHub.

## User Experience

### What Appears

When a session created a PR, the Changes section in the analysis view shows:

- **PR badge** — "PR #47 · Open" (or Merged, Closed, Draft) with state-colored indicator
- **CI status** — Green dot with "14/14 checks passing" (or red dot "2/14 failing", or yellow "pending")
- **Merge status** — "No conflicts" or "Has conflicts"
- **"View PR →" link** — One click to GitHub, amber colored per the app design system
- **File list** — Same as today: files with created/modified/deleted badges (A/M/D indicators)
- **Refresh icon** — Small, next to the Changes section header, re-fetches live data on demand

### Progressive Reveal Timing

When you open a session's analysis view:

1. **Instant** — Mechanical stats (duration, prompts, tool calls, test results) and prompt history render immediately
2. **~2-3 seconds** — AI analysis fills in (summary, key moments, next steps) — same as today
3. **~1 second later** — If there's a PR, a small loading indicator appears in the Changes section, then the PR badge, CI status, and merge status pop in

If there's no PR, step 3 never happens. The view looks exactly as it does today.

### Graceful Degradation

Three scenarios where this feature steps aside:

| Scenario | Behavior |
|---|---|
| **No PR was created** | Changes section shows file list only, exactly as today. No empty badges, no placeholders. |
| **`gh` CLI not installed** | Same static view. Feature is invisible. No error, no "install gh" nag. |
| **`gh` CLI fails** (network, auth, permissions) | Static view with a subtle "Live status unavailable" note. Not an error — a quiet aside. |

**Principle:** This feature only adds information. It never takes anything away or creates noise.

## Architecture

### Layer Position

The live data layer sits alongside the existing mechanical and AI layers, but with a key difference: it is renderer-initiated and never cached.

```
┌─────────────────────────────────────────────────────┐
│                 ANALYSIS VIEW                        │
├─────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────┐  │
│  │  MECHANICAL LAYER (instant)                   │  │
│  │  Stats · Prompt History · Test Status         │  │
│  │  Parsed from events.jsonl on completion       │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │  AI LAYER (async, on first view)              │  │
│  │  Summary · Key Moments · Next Steps · ...     │  │
│  │  Generated via Amplifier subprocess           │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │  LIVE DATA LAYER (on demand)          ← NEW  │  │
│  │  PR status · CI checks · Merge state          │  │
│  │  Fetched via `gh` CLI, never cached           │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Request Flow

Renderer-initiated, main-executed:

```
┌──────────────────┐     IPC invoke      ┌──────────────────┐     subprocess     ┌────────┐
│  SessionAnalysis │  ───────────────►   │  liveDataService │  ──────────────►  │  gh    │
│  .tsx            │                      │  .ts (main)      │                   │  CLI   │
│  (renderer)      │  ◄───────────────   │                  │  ◄──────────────  │        │
│                  │     LivePrData       │  parse + map     │     JSON stdout   │        │
└──────────────────┘     | null           └──────────────────┘                   └────────┘
        │
        ▼
┌──────────────────┐
│  ChangesSection  │
│  .tsx            │
│  (renders live   │
│   data inline)   │
└──────────────────┘
```

1. Renderer (`SessionAnalysis.tsx`) detects a `prUrl` in the loaded analysis result's `changes` section
2. Fires an IPC call to main process: `window.electronAPI.fetchLivePrData(prUrl)`
3. Main process (`liveDataService.ts`) parses the URL, shells out to `gh pr view`
4. Returns structured `LivePrData` to renderer (or `null` on any failure)
5. `ChangesSection.tsx` renders the live data alongside the existing static file list

### PR URL Provenance

The mechanically-extracted `gitOperations[].prUrl` (from `events-parser.ts` terminal output parsing) is the ground truth PR URL. The LLM also receives this in the digest and may echo it in the `changes` section's `prUrl` field.

The live data fetch prefers the mechanical source — it is provably correct, extracted from terminal output. The LLM-populated `prUrl` in `ChangesContent` could theoretically hallucinate a URL. When both sources are available, cross-check: use `gitOperations` as the authority.

## Data Flow

### Single `gh` Call

One `gh pr view` call covers all needed data:

```
gh pr view <number> --repo <owner/repo> --json state,isDraft,mergeable,statusCheckRollup,number,title
```

Fields returned:

| Field | Maps to | Values |
|---|---|---|
| `state` | `prState` | `OPEN` → `'open'`, `MERGED` → `'merged'`, `CLOSED` → `'closed'` |
| `isDraft` | `prState` | If `true` and state is `OPEN`, override to `'draft'` |
| `mergeable` | `mergeable` | `MERGEABLE` → `'mergeable'`, `CONFLICTING` → `'conflicting'`, `UNKNOWN` → `'unknown'` |
| `statusCheckRollup` | `ciChecks` | Array of `{ name, status, conclusion }` — compute totals |
| `number` | `prNumber` | Integer |
| `title` | `prTitle` | String |

### CI Check Computation

From the `statusCheckRollup` array:
- **passing**: `conclusion === 'SUCCESS'`
- **failing**: `conclusion === 'FAILURE'` or `conclusion === 'CANCELLED'` or `conclusion === 'TIMED_OUT'`
- **pending**: `status === 'IN_PROGRESS'` or `status === 'QUEUED'` or `status === 'PENDING'`
- **total**: length of the array
- **overall status**: `'failure'` if any failing, `'pending'` if any pending and none failing, `'success'` otherwise
- If `statusCheckRollup` is empty or null, `ciChecks` is `null` (no checks configured)

## Type Definitions

### New: `LivePrData` (in `src/shared/analysisTypes.ts`)

```typescript
export interface LivePrData {
  prNumber: number
  prTitle: string
  prState: 'open' | 'draft' | 'merged' | 'closed'
  mergeable: 'mergeable' | 'conflicting' | 'unknown'
  ciChecks: {
    total: number
    passing: number
    failing: number
    pending: number
    status: 'success' | 'failure' | 'pending'
  } | null
}
```

This is a separate type — not mixed into the LLM-populated `ChangesContent`. The renderer holds it in component state and passes it to `ChangesSection` as an optional prop.

### New IPC Channel (in `src/shared/types.ts`)

```typescript
// Add to IPC_CHANNELS:
LIVE_DATA_FETCH: 'live-data:fetch',  // payload: { prUrl: string } → LivePrData | null
```

### Existing Types — No Changes

`ChangesContent`, `GitOperation`, `AnalysisResult`, and `SessionAnalysisData` remain unchanged. The live data travels as a separate prop through the renderer, never stored in the DB or mixed into the analysis result.

## New Modules

### `src/main/liveDataService.ts`

Single-purpose module following the pattern of `src/main/settings.ts` — one export, clear contract.

**Export:**
```typescript
export async function fetchLivePrData(prUrl: string): Promise<LivePrData | null>
```

**Behavior:**
1. Parse the PR URL to extract `owner`, `repo`, and `number` (regex against `github.com/:owner/:repo/pull/:number`)
2. Shell out to `gh pr view <number> --repo <owner/repo> --json state,isDraft,mergeable,statusCheckRollup,number,title`
3. Parse the JSON response
4. Map to `LivePrData` (apply `isDraft` override, compute CI check totals)
5. Return the result

**Failure handling:**
- `gh` not found on PATH → return `null`
- `gh` exits non-zero (auth, network, repo not found) → return `null`
- JSON parse failure → return `null`
- URL doesn't match expected pattern → return `null`
- Timeout after 10 seconds → kill process, return `null`

Every failure path returns `null`. The renderer never sees an error — it just doesn't get live data.

**Subprocess pattern:** Follow the same `spawn` approach used in `src/main/llm.ts` — spawn the process, buffer stdout/stderr, handle timeout via `setTimeout` + `proc.kill()`, parse on close. The key difference: this module does not use `resolveAmplifierBinary()` — it calls `gh` directly, resolved via PATH only.

## Modified Modules

### `src/shared/types.ts`

Add one entry to `IPC_CHANNELS`:

```typescript
LIVE_DATA_FETCH: 'live-data:fetch',
```

### `src/shared/analysisTypes.ts`

Add the `LivePrData` interface (see Type Definitions above). No changes to existing types.

### `src/main/ipc.ts`

Register one new IPC handler, following the pattern at lines 194-220 (analysis handlers):

```typescript
ipcMain.handle(
  IPC_CHANNELS.LIVE_DATA_FETCH,
  async (_event, { prUrl }: { prUrl: string }): Promise<LivePrData | null> => {
    try {
      return await fetchLivePrData(prUrl)
    } catch (err) {
      console.error('[ipc] LIVE_DATA_FETCH failed:', err)
      return null
    }
  },
)
```

### `src/preload/index.ts`

Add one bridge method, following the pattern at lines 107-126 (analysis bridge methods):

```typescript
fetchLivePrData: (prUrl: string): Promise<LivePrData | null> => {
  return ipcRenderer.invoke(IPC_CHANNELS.LIVE_DATA_FETCH, { prUrl })
},
```

### `src/renderer/src/components/SessionAnalysis.tsx`

After the analysis result loads and sections are available:

1. Find the `changes` section and extract `prUrl` from its content
2. Cross-check against `mechanical.gitOperations` for a `pr-create` operation with a `prUrl` — prefer the mechanical source
3. If a PR URL exists, set a `livePrLoading` state and fire `window.electronAPI.fetchLivePrData(prUrl)`
4. On success, store `LivePrData` in component state
5. On failure (null return), clear loading state — static view renders as-is
6. Pass `liveData` and `livePrLoading` as props to the `ChangesSection` render call in `renderSection()`
7. Wire the refresh icon to re-fire the same IPC call

### `src/renderer/src/components/sections/ChangesSection.tsx`

Extend the component props:

```typescript
type ChangesSectionProps = {
  content: ChangesContent
  liveData?: LivePrData       // new
  livePrLoading?: boolean      // new
  onRefresh?: () => void       // new — wired to refresh icon
}
```

**When `livePrLoading` is true:** Show a small loading spinner in place of the live data area, above the file list.

**When `liveData` is present:** Render above the file list:
- PR badge: state-colored indicator (green for merged, amber for open, red for closed, gray for draft) + "PR #47 · Open"
- CI status line: colored dot (green/red/yellow) + "14/14 checks passing" (or "2/14 failing", or "pending")
- Merge status: "No conflicts" or "Has conflicts"
- "View PR #47 →" as an amber link (replaces the current raw `prUrl` link)
- Refresh icon (small, subtle) that calls `onRefresh`

**When `liveData` is absent and not loading:** Render exactly as today — static file list with the raw `prUrl` link if present. No change from current behavior.

## Error Handling

| Failure Mode | Behavior |
|---|---|
| `gh` CLI not installed | `fetchLivePrData` returns `null`. Changes section renders static file list. Feature is invisible. |
| `gh` CLI auth expired | `fetchLivePrData` returns `null`. Same static fallback. |
| Network down | `fetchLivePrData` returns `null` (10s timeout). Subtle "Live status unavailable" note. |
| PR URL doesn't match GitHub pattern | `fetchLivePrData` returns `null`. Static view only. |
| `gh` returns malformed JSON | `fetchLivePrData` returns `null`. Static view only. |
| PR was deleted | `gh` exits non-zero → `null`. Static view only. |
| IPC call itself fails | Caught in ipc.ts handler, returns `null`. Renderer handles gracefully. |
| Analysis has no `changes` section | Live data fetch is never triggered. No impact. |
| Analysis has `changes` but no `prUrl` | Live data fetch is never triggered. File list renders as today. |

**Design invariant:** Every failure path results in `null` reaching the renderer. The renderer treats `null` as "show the static view." No error dialogs, no toast notifications, no console errors visible to the user.

The only user-visible failure signal is a subtle "Live status unavailable" text that appears when a fetch was attempted (because a `prUrl` exists) but returned `null`. This distinguishes "no PR" (nothing shown) from "PR exists but we couldn't fetch status" (quiet note).

## Testing Strategy

### Unit Tests — `liveDataService.ts`

- Parse various GitHub PR URL formats (`github.com/owner/repo/pull/47`, with trailing slash, with fragment)
- Return `null` for non-GitHub URLs
- Return `null` for malformed URLs (no PR number, wrong path structure)
- Map `gh` JSON output to `LivePrData` correctly (open, merged, closed, draft states)
- Compute CI check totals from `statusCheckRollup` arrays (all passing, some failing, all pending, mixed, empty)
- Handle `isDraft` override (state=OPEN + isDraft=true → `'draft'`)
- Handle `null`/empty `statusCheckRollup` → `ciChecks: null`
- Return `null` when `gh` is not found (spawn error)
- Return `null` when `gh` exits non-zero
- Return `null` when `gh` returns non-JSON
- Return `null` on timeout (mock timer)

### Unit Tests — `ChangesSection.tsx`

- Renders static file list when no `liveData` prop (existing behavior preserved)
- Renders loading spinner when `livePrLoading` is true
- Renders PR badge with correct state color for each state (open, draft, merged, closed)
- Renders CI status with correct counts and dot color
- Renders merge status text
- Renders "View PR →" as amber link with correct href
- Refresh icon calls `onRefresh` callback when clicked
- Still renders raw `prUrl` link when `liveData` is absent but `content.prUrl` exists (graceful degradation)

### Integration Tests — `SessionAnalysis.tsx`

- When analysis has `changes` section with `prUrl`, fires `fetchLivePrData` IPC call
- When analysis has `changes` section without `prUrl`, does not fire IPC call
- When `fetchLivePrData` returns data, passes it to `ChangesSection`
- When `fetchLivePrData` returns `null`, `ChangesSection` renders static view
- Refresh button re-fires the IPC call and updates the view
- Cross-checks `prUrl` against `mechanical.gitOperations` and prefers mechanical source

### IPC Tests — `ipc.ts`

- `LIVE_DATA_FETCH` handler returns result from `fetchLivePrData`
- `LIVE_DATA_FETCH` handler returns `null` on thrown error

## Open Questions

- **Token count display:** Phase 1 stores `toolCallCount` but not token counts. The stats row in the analysis header wants to show tokens. Deferred — not part of this feature.

## Out of Scope

- **Caching live data** — always fresh, fetched on every view open
- **Polling / auto-refresh** — manual refresh only via the refresh icon
- **Streaming CI check updates** — single point-in-time fetch
- **Webhook-based push updates** — no server component
- **Notifications when CI completes** — out of scope for this feature
- **Non-GitHub forges** (GitLab, Bitbucket) — `gh` CLI is GitHub-only; other forges deferred