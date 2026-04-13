# Live Data Layer Design

## Goal

Complete the analysis view's third layer. When a session created a PR, Canvas shows the current state of that PR — open/merged/closed, CI check status (passing/failing/pending), merge conflicts — directly in the analysis view. The user gets the full session story without leaving Canvas or going to GitHub.

## Background

The Phase 2 analysis view ([2026-04-09 design](./2026-04-09-phase-2-analysis-view-design.md)) established a three-layer architecture:

1. **Mechanical layer** (instant) — stats, prompt history, test results, file list
2. **AI layer** (async, ~2-3s) — summary, key moments, next steps, curated sections
3. **Live data layer** (auto-fetch, never cached) — PR status, CI checks

Layers 1 and 2 are shipped. The live data layer was specified in the Phase 2 design but not yet built. This document details its implementation.

> **Terminology note:** The original Phase 2 design labeled this layer "on demand." That referred to "not cached" — every view open triggers a fresh fetch. It did *not* mean "user-initiated." The layer auto-fetches on every view open. The refresh button provides manual re-fetch. There is no polling.

The Storyboard (Scene 3.4) describes the canonical experience: "PR #47 opened · no conflicts," CI status (green dot, 14/14 checks), and a "View PR #47 →" link in amber. This feature delivers exactly that — the receipt for your work, always fresh, without context-switching to GitHub.

## User Experience

### What Appears

When a session created a PR, the Changes section in the analysis view shows:

- **PR badge** — "PR #47 · Open" (or Merged, Closed, Draft) with state-colored indicator
- **CI status** — Green dot with "14/14 checks passing" (or red dot "2/14 failing", or yellow "pending")
- **Merge status** — "No conflicts" or "Has conflicts"
- **"View PR →" link** — One click to GitHub, amber colored per the app design system. Uses `window.open(url)` which Electron's `setWindowOpenHandler` intercepts and routes through `shell.openExternal()` (this pattern already exists in `src/main/index.ts` lines 33-48 and 80-83 — no new IPC channel needed)
- **File list** — Same as today: files with created/modified/deleted badges (A/M/D indicators)
- **Refresh icon** — Small, rendered by `SessionAnalysis.tsx` in the section header area (not by `ChangesSection.tsx`), specifically for `type === 'changes'` sections. Re-fetches live data on click.

### Progressive Reveal Timing

When you open a session's analysis view:

1. **Instant** — Mechanical stats (duration, prompts, tool calls, test results) and prompt history render immediately
2. **~2-3 seconds** — AI analysis fills in (summary, key moments, next steps) — same as today
3. **~1 second later** — If there's a PR, a small loading indicator appears in the Changes section, then the PR badge, CI status, and merge status pop in

If there's no PR, step 3 never happens. The view looks exactly as it does today.

### Graceful Degradation

Three scenarios where this feature steps aside:

| Scenario | Fetch Result | Behavior |
|---|---|---|
| **No PR was created** | `null` (never attempted) | Changes section shows file list only, exactly as today. No empty badges, no placeholders. |
| **`gh` CLI not installed** | `{ error: 'not-found' }` | Same static view. Feature is invisible. No error, no "install gh" nag. |
| **`gh` CLI fails** (network, auth, permissions) | `{ error: 'fetch-failed' }` | Static view with a subtle "Live status unavailable" note (`data-testid="live-data-unavailable"`). Not an error — a quiet aside. |

**Principle:** This feature only adds information. It never takes anything away or creates noise.

## Architecture

### Layer Position

The live data layer sits alongside the existing mechanical and AI layers, but with a key difference: it is renderer-initiated and auto-fetched on every view open. A 30-second in-memory cache (keyed by prUrl) prevents rapid view-switching from spawning excessive `gh` processes. The refresh button bypasses this cache.

```
┌─────────────────────────────────────────────────────────┐
│                 ANALYSIS VIEW                        │
├─────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────┐  │
│  │  MECHANICAL LAYER (instant)                   │  │
│  │  Stats · Prompt History · Test Status         │  │
│  │  Parsed from events.jsonl on completion       │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │  AI LAYER (async, on first view)              │  │
│  │  Summary · Key Moments · Next Steps · ...     │  │
│  │  Generated via Amplifier subprocess           │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │  LIVE DATA LAYER (auto-fetch, never cached)← NEW │  │
│  │  PR status · CI checks · Merge state          │  │
│  │  Fetched via `gh` CLI on every view open      │  │
│  │  30s in-memory cache prevents rapid re-fetch  │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Request Flow

Renderer-initiated, main-executed:

```
┌──────────────────┐     IPC invoke      ┌──────────────────┐     subprocess     ┌────────┐
│  SessionAnalysis │  ───────────────────►   │  liveDataService │  ──────────────────►  │  gh    │
│  .tsx            │                      │  .ts (main)      │                   │  CLI   │
│  (renderer)      │  ◄───────────────   │                  │  ◄──────────────  │        │
│                  │  LivePrFetchResult   │  parse + map     │     JSON stdout   │        │
└──────────────────┘                     └──────────────────┘                   └────────┘
        │
        ▼
┌──────────────────┐
│  ChangesSection  │
│  .tsx            │
│  (renders live   │
│   data inline)   │
└──────────────────┘
```

1. Renderer (`SessionAnalysis.tsx`) detects a `prUrl` using the waterfall logic (see PR URL Provenance below)
2. Checks the 30-second in-memory cache — if a recent result exists for this `prUrl`, uses it without IPC
3. Fires an IPC call to main process: `window.electronAPI.fetchLivePrData(prUrl)`
4. Main process (`liveDataService.ts`) resolves the `gh` binary, parses the URL, shells out to `gh pr view`
5. Returns a discriminated `LivePrFetchResult` to renderer
6. `SessionAnalysis.tsx` passes the result through `renderSection()` to `ChangesSection.tsx`, which renders live data alongside the existing static file list

### PR URL Provenance

The live data fetch uses a **waterfall** to locate the PR URL:

1. **Check `mechanical.gitOperations`** for any `pr-create` entry with a `prUrl` — this is ground truth, mechanically extracted from terminal output by `events-parser.ts`. When multiple `pr-create` entries exist, use the **last one** (highest index) — this matches the common pattern where a failed PR creation is retried.
2. **If not found, check the AI `changes` section** for a `prUrl` field — the LLM may echo it from the digest.
3. **If neither exists**, no live data fetch is triggered.

This ensures the feature works even when AI analysis fails, and prefers the provably-correct mechanical source over the LLM-populated field which could theoretically hallucinate a URL.

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
| `isDraft` | `prState` | If `true` and state is `OPEN`, override to `'draft'`. For MERGED or CLOSED PRs, `isDraft` is ignored. |
| `mergeable` | `mergeable` | `MERGEABLE` → `'mergeable'`, `CONFLICTING` → `'conflicting'`, `UNKNOWN` → `'unknown'` |
| `statusCheckRollup` | `ciChecks` | Array of `{ name, status, conclusion }` — compute totals |
| `number` | `prNumber` | Integer |
| `title` | `prTitle` | String |

### CI Check Computation

From the `statusCheckRollup` array:
- **passing**: `conclusion === 'SUCCESS'` or `conclusion === 'SKIPPED'` or `conclusion === 'NEUTRAL'`
- **failing**: `conclusion === 'FAILURE'` or `conclusion === 'CANCELLED'` or `conclusion === 'TIMED_OUT'` or `conclusion === 'STALE'`
- **pending**: `status === 'IN_PROGRESS'` or `status === 'QUEUED'` or `status === 'PENDING'` or `conclusion === 'ACTION_REQUIRED'`
- **total**: length of the array
- **Invariant**: `passing + failing + pending === total`
- **overall status**: `'failure'` if any failing, `'pending'` if any pending and none failing, `'success'` otherwise
- If `statusCheckRollup` is empty or null, `ciChecks` is `null` (no checks configured)

### stdout Parsing

Apply the same defensive JSON extraction pattern as `llm.ts`: split stdout on newlines, find the first line that starts with `{`, parse from there. This guards against `gh` printing preamble text (login prompts, update notices) before the JSON payload.

### Rate Limiting

A simple in-memory cache with a **30-second TTL** keyed by `prUrl` prevents rapid view-switching from spawning excessive `gh` processes:

- If the same `prUrl` was fetched within 30 seconds, return the cached `LivePrFetchResult` immediately
- The **refresh button bypasses the cache** — always spawns a fresh `gh` call and updates the cache entry
- Cache is a plain `Map<string, { result: LivePrFetchResult, timestamp: number }>` in `SessionAnalysis.tsx` (module-level, survives re-renders)
- On cache hit, no IPC call is made

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

### New: `LivePrFetchResult` (in `src/shared/analysisTypes.ts`)

A discriminated union that distinguishes "never attempted," "gh not found," "gh failed," and "success":

```typescript
export type LivePrFetchResult =
  | { data: LivePrData }
  | { error: 'not-found' }   // gh binary not found → feature invisible
  | { error: 'fetch-failed' } // gh found but failed (network, auth, parse) → "Live status unavailable"
```

The IPC channel returns `LivePrFetchResult | null`. The renderer uses `null` to mean "no prUrl — never attempted."

This resolves the ambiguity between "gh not installed" and "gh failed" — the renderer can distinguish all four states:

| Renderer state | Meaning | UI behavior |
|---|---|---|
| `null` | No `prUrl` found, fetch never attempted | Static file list, no live data UI at all |
| `{ error: 'not-found' }` | `gh` binary not on system | Feature invisible — same as `null` |
| `{ error: 'fetch-failed' }` | `gh` found but call failed | Show subtle "Live status unavailable" note |
| `{ data: LivePrData }` | Success | Render PR badge, CI status, merge status |

This is a separate type — not mixed into the LLM-populated `ChangesContent`. The renderer holds it in component state and passes it to `ChangesSection` as an optional prop.

### New IPC Channel (in `src/shared/types.ts`)

```typescript
// Add to IPC_CHANNELS:
LIVE_DATA_FETCH: 'live-data:fetch',  // payload: { prUrl: string } → LivePrFetchResult | null
```

### Existing Types — No Changes

`ChangesContent`, `GitOperation`, `AnalysisResult`, and `SessionAnalysisData` remain unchanged. The live data travels as a separate prop through the renderer, never stored in the DB or mixed into the analysis result.

## New Modules

### `src/main/liveDataService.ts`

Single-purpose module following the pattern of `src/main/settings.ts` — one export, clear contract.

**Exports:**
```typescript
export function resolveGhBinary(): string | null
export async function fetchLivePrData(prUrl: string): Promise<LivePrFetchResult | null>
```

#### `resolveGhBinary()`

Resolves the `gh` CLI path using explicit PATH fallback resolution, following the same pattern as `llm.ts`'s `resolveAmplifierBinary()`. This is necessary because Electron apps launched from the macOS Dock inherit a minimal PATH (`/usr/bin:/bin:/usr/sbin:/sbin`) — `gh` installed via Homebrew at `/opt/homebrew/bin/gh` won't be found via PATH alone.

Resolution order:
1. `which gh` (checks current PATH)
2. `/opt/homebrew/bin/gh` (Homebrew on Apple Silicon)
3. `/usr/local/bin/gh` (Homebrew on Intel, or manual install)
4. `process.env.GH_PATH` if set (user override)

Returns the resolved path, or `null` if none found. Caches the resolved path in a module-level variable (same as `llm.ts`'s `cachedBinaryPath` pattern). When `null`, the caller returns `{ error: 'not-found' }` for graceful degradation — no error thrown.

#### `fetchLivePrData(prUrl)`

**Behavior:**
1. Resolve `gh` binary via `resolveGhBinary()` — if `null`, return `{ error: 'not-found' }`
2. Parse the PR URL to extract `owner`, `repo`, and `number` (regex against `github.com/:owner/:repo/pull/:number`)
3. If URL doesn't match, return `null`
4. Shell out to `gh pr view <number> --repo <owner/repo> --json state,isDraft,mergeable,statusCheckRollup,number,title` using the resolved binary path
5. Parse the JSON response (using defensive newline-split extraction — see stdout Parsing)
6. Map to `LivePrData` (apply `isDraft` override only when `state === 'OPEN'`, compute CI check totals)
7. Return `{ data: LivePrData }`

**Failure handling:**

| Failure | Node.js event | Return value |
|---|---|---|
| `gh` binary not found | `resolveGhBinary()` returns `null` | `{ error: 'not-found' }` |
| `gh` binary found but spawn fails | `proc.on('error')` | `{ error: 'not-found' }` |
| `gh` exits non-zero (auth, network, repo not found) | `proc.on('close', code !== 0)` | `{ error: 'fetch-failed' }` |
| JSON parse failure | catch in parse logic | `{ error: 'fetch-failed' }` |
| URL doesn't match GitHub pattern | regex test fails | `null` |
| Timeout after 10 seconds | `setTimeout` + `proc.kill()` | `{ error: 'fetch-failed' }` |

Note the distinction between `proc.on('error')` (spawn failed — binary not found or not executable) and `proc.on('close', code !== 0)` (binary ran but command failed). These are distinct Node.js events and must be handled separately.

**Subprocess pattern:** Follow the same `spawn` approach used in `src/main/llm.ts` — spawn the process, buffer stdout/stderr, handle timeout via `setTimeout` + `proc.kill()`, parse on close.

## Modified Modules

### `src/shared/types.ts`

Add one entry to `IPC_CHANNELS`:

```typescript
LIVE_DATA_FETCH: 'live-data:fetch',
```

### `src/shared/analysisTypes.ts`

Add the `LivePrData` interface and `LivePrFetchResult` type (see Type Definitions above). No changes to existing types.

### `src/main/ipc.ts`

**Import:** Add `import { fetchLivePrData } from './liveDataService'` at the top of `ipc.ts`.

**Handler:** Register one new IPC handler, following the pattern at lines 194-220 (analysis handlers):

```typescript
ipcMain.handle(
  IPC_CHANNELS.LIVE_DATA_FETCH,
  async (_event, { prUrl }: { prUrl: string }): Promise<LivePrFetchResult | null> => {
    try {
      return await fetchLivePrData(prUrl)
    } catch (err) {
      console.error('[ipc] LIVE_DATA_FETCH failed:', err)
      return { error: 'fetch-failed' }
    }
  },
)
```

**Cleanup:** Add `ipcMain.removeHandler(IPC_CHANNELS.LIVE_DATA_FETCH)` to the `mainWindow.on('closed')` cleanup list (at line ~402, after the existing `removeHandler` calls for `SETTINGS_SAVE`).

### `src/preload/index.ts`

Add one bridge method, following the pattern at lines 107-126 (analysis bridge methods):

```typescript
fetchLivePrData: (prUrl: string): Promise<LivePrFetchResult | null> => {
  return ipcRenderer.invoke(IPC_CHANNELS.LIVE_DATA_FETCH, { prUrl })
},
```

The `ElectronAPI` type is exported from this file and imported by `src/renderer/src/env.d.ts` — adding the method here automatically makes it available as `window.electronAPI.fetchLivePrData()` in the renderer with full type safety. No changes to `env.d.ts` needed.

### `src/renderer/src/components/SessionAnalysis.tsx`

The `renderSection` function is defined at **module scope** (line 42) — outside the component, with no access to component state. It must be refactored to accept additional arguments:

```typescript
function renderSection(
  section: AnalysisSection,
  liveData?: LivePrFetchResult | null,    // new — pass for 'changes' sections
  livePrLoading?: boolean,                 // new — pass for 'changes' sections
  onRefresh?: () => void,                  // new — pass for 'changes' sections
): React.ReactElement {
```

This is a minor refactor — the function just needs 3 more optional parameters. The call site (line 319) passes them only for `type === 'changes'` sections:

```typescript
{renderSection(
  section,
  section.type === 'changes' ? livePrFetchResult : undefined,
  section.type === 'changes' ? livePrLoading : undefined,
  section.type === 'changes' ? handleRefresh : undefined,
)}
```

**Component-level changes:**

1. Extract `prUrl` using the waterfall: (1) `mechanical.gitOperations` last `pr-create` entry with a `prUrl`, (2) AI `changes` section `prUrl`, (3) none
2. Check the 30-second in-memory cache (module-level `Map`) — if a recent result exists, use it
3. If no cache hit and a PR URL exists, set `livePrLoading` state and fire `window.electronAPI.fetchLivePrData(prUrl)`
4. The `useEffect` that initiates the live data fetch must use an **`isMounted` ref pattern**: set `isMounted.current = true` on mount, `false` on cleanup. Only call `setState` if `isMounted.current` is true when the IPC response returns. This prevents React state updates on unmounted components.
5. On response, store `LivePrFetchResult` in component state and update the cache
6. Pass the result through `renderSection()` to `ChangesSection`
7. The refresh icon is rendered by `SessionAnalysis.tsx` in the section header area (the parent already renders section titles). It is injected specifically for `type === 'changes'` sections. The refresh button is disabled while `livePrLoading` is true. The `onRefresh` callback is a no-op when loading is in progress. Refresh bypasses the 30-second cache.
8. When `onAnalysisReady` fires (analysis regenerated), clear `liveData` state and re-fetch if a `prUrl` exists

### `src/renderer/src/components/sections/ChangesSection.tsx`

Extend the component props:

```typescript
type ChangesSectionProps = {
  content: ChangesContent
  livePrResult?: LivePrFetchResult | null  // new — discriminated union
  livePrLoading?: boolean                   // new
  onRefresh?: () => void                    // new — wired to refresh icon
}
```

**State rendering logic:**

| `livePrResult` value | `livePrLoading` | Render |
|---|---|---|
| any | `true` | Small loading spinner in place of live data area, above the file list |
| `{ data: LivePrData }` | `false` | PR badge, CI status, merge status, "View PR →" link (see below) |
| `{ error: 'fetch-failed' }` | `false` | Subtle "Live status unavailable" text with `data-testid="live-data-unavailable"` |
| `{ error: 'not-found' }` | `false` | Nothing — feature invisible, same as `null` |
| `null` or `undefined` | `false` | Render exactly as today — static file list with the raw `prUrl` link if present |

**When `livePrResult` has data**, render above the file list:
- PR badge: state-colored indicator (green for merged, amber for open, red for closed, gray for draft) + "PR #47 · Open"
- CI status line: colored dot (green/red/yellow) + "14/14 checks passing" (or "2/14 failing", or "pending")
- Merge status: "No conflicts" or "Has conflicts"
- "View PR #47 →" as an amber link — uses `window.open(prUrl)` which Electron intercepts via `setWindowOpenHandler` and routes to `shell.openExternal()` (existing pattern, no new IPC needed)

### Test IDs

All live data UI elements include `data-testid` attributes for testing:

| Element | `data-testid` |
|---|---|
| PR state badge | `live-pr-badge` |
| CI status line | `live-ci-status` |
| Merge status line | `live-merge-status` |
| "View PR →" link | `live-pr-link` |
| Loading spinner | `live-data-loading` |
| Refresh button | `live-data-refresh` |
| "Live status unavailable" text | `live-data-unavailable` |

## Error Handling

| Failure Mode | Fetch Result | Behavior |
|---|---|---|
| `gh` CLI not installed | `{ error: 'not-found' }` | Feature invisible. No error, no "install gh" nag. |
| `gh` CLI auth expired | `{ error: 'fetch-failed' }` | Subtle "Live status unavailable" note. |
| Network down | `{ error: 'fetch-failed' }` (10s timeout) | Subtle "Live status unavailable" note. |
| PR URL doesn't match GitHub pattern | `null` | Static view only — fetch never attempted. |
| `gh` returns malformed JSON | `{ error: 'fetch-failed' }` | Subtle "Live status unavailable" note. |
| PR was deleted | `{ error: 'fetch-failed' }` (gh exits non-zero) | Subtle "Live status unavailable" note. |
| IPC call itself fails | `{ error: 'fetch-failed' }` (caught in ipc.ts handler) | Subtle "Live status unavailable" note. |
| Analysis has no `changes` section | `null` (never attempted) | Live data fetch is never triggered. No impact. |
| Analysis has `changes` but no `prUrl` | `null` (never attempted) | Live data fetch is never triggered. File list renders as today. |

**Design invariant:** The renderer can always distinguish four states from `LivePrFetchResult | null`:
1. `null` → no `prUrl`, never fetched → show static view
2. `{ error: 'not-found' }` → gh not on system → feature invisible (same as static view)
3. `{ error: 'fetch-failed' }` → gh found but failed → show subtle "Live status unavailable"
4. `{ data }` → success → render live data

No error dialogs, no toast notifications, no console errors visible to the user.

## Testing Strategy

### Unit Tests — `liveDataService.ts`

- Parse various GitHub PR URL formats (`github.com/owner/repo/pull/47`, with trailing slash, with fragment)
- Return `null` for non-GitHub URLs
- Return `null` for malformed URLs (no PR number, wrong path structure)
- `resolveGhBinary()` returns the first found path in resolution order
- `resolveGhBinary()` returns `null` when gh is not installed anywhere
- `fetchLivePrData` returns `{ error: 'not-found' }` when `resolveGhBinary()` returns `null`
- `fetchLivePrData` returns `{ error: 'not-found' }` when spawn fails (`proc.on('error')`)
- `fetchLivePrData` returns `{ error: 'fetch-failed' }` when gh exits non-zero (`proc.on('close', code !== 0)`)
- `fetchLivePrData` returns `{ error: 'fetch-failed' }` when gh returns non-JSON
- `fetchLivePrData` returns `{ error: 'fetch-failed' }` on timeout (mock timer)
- Map `gh` JSON output to `LivePrData` correctly (open, merged, closed, draft states)
- Compute CI check totals from `statusCheckRollup` arrays (all passing, some failing, all pending, mixed, empty)
- Map `SKIPPED` and `NEUTRAL` conclusions to passing
- Map `STALE` conclusion to failing
- Map `ACTION_REQUIRED` conclusion to pending
- Verify invariant: `passing + failing + pending === total`
- Handle `isDraft` override: `state=OPEN + isDraft=true` → `'draft'`
- Handle `isDraft` ignored: `state=MERGED + isDraft=true` → `'merged'` (not `'draft'`)
- Handle `null`/empty `statusCheckRollup` → `ciChecks: null`
- Defensive stdout parsing: JSON preceded by preamble text is still extracted correctly

### Unit Tests — `ChangesSection.tsx`

- Renders static file list when no `livePrResult` prop (existing behavior preserved)
- Renders loading spinner when `livePrLoading` is true
- Renders PR badge with correct state color for each state (open, draft, merged, closed)
- Renders CI status with correct counts and dot color
- Renders merge status text
- Renders "View PR →" as amber link with correct href
- Refresh icon calls `onRefresh` callback when clicked
- Still renders raw `prUrl` link when `livePrResult` is absent but `content.prUrl` exists (graceful degradation)
- When `livePrResult` is `{ error: 'fetch-failed' }`, renders "Live status unavailable" text with `data-testid="live-data-unavailable"`
- When `livePrResult` is `{ error: 'not-found' }`, renders no live data UI (feature invisible)
- All live data elements have correct `data-testid` attributes

### Integration Tests — `SessionAnalysis.tsx`

- When analysis has `changes` section with `prUrl`, fires `fetchLivePrData` IPC call
- When analysis has `changes` section without `prUrl`, does not fire IPC call
- When `fetchLivePrData` returns `{ data }`, passes it to `ChangesSection`
- When `fetchLivePrData` returns `{ error: 'fetch-failed' }`, `ChangesSection` renders "Live status unavailable"
- When `fetchLivePrData` returns `{ error: 'not-found' }`, `ChangesSection` renders static view
- Refresh button re-fires the IPC call and updates the view
- Refresh button is disabled while loading
- Cross-checks `prUrl` against `mechanical.gitOperations` and prefers mechanical source
- Uses last `pr-create` entry when multiple exist in `gitOperations`
- Waterfall: activates live data from `gitOperations` even when AI `changes` section has no `prUrl`
- `renderSection()` passes `liveData`, `livePrLoading`, `onRefresh` as extra args for changes sections
- Unmounted component does not trigger state update (isMounted ref pattern)
- Re-fetches live data when analysis is regenerated (`onAnalysisReady`)
- Cache hit within 30 seconds skips IPC call; refresh bypasses cache

### IPC Tests — `ipc.ts`

- `LIVE_DATA_FETCH` handler returns result from `fetchLivePrData`
- `LIVE_DATA_FETCH` handler returns `{ error: 'fetch-failed' }` on thrown error
- `LIVE_DATA_FETCH` handler is removed on window close

## Open Questions

- **Token count display:** Phase 1 stores `toolCallCount` but not token counts. The stats row in the analysis header wants to show tokens. Deferred — not part of this feature.

## Out of Scope

- **Persistent caching of live data** — always fresh, fetched on every view open (30-second in-memory cache only prevents redundant subprocess spawning during rapid view-switching)
- **Polling / auto-refresh** — manual refresh only via the refresh icon
- **Streaming CI check updates** — single point-in-time fetch
- **Webhook-based push updates** — no server component
- **Notifications when CI completes** — out of scope for this feature
- **Non-GitHub forges** (GitLab, Bitbucket) — `gh` CLI is GitHub-only; other forges deferred
- **GitHub Enterprise Server** (custom domain URLs) — the URL parser targets `github.com` only; enterprise support deferred
