# Real LLM-Powered Session Analysis Design

## Goal

Replace the mock `generateMockAnalysis()` in `analysisService.ts` with a real LLM call that reads a structured `SessionDigest` and produces an `AnalysisResult` response, and add a minimal settings system so users can configure which model is used.

## Background

Session analysis currently uses `generateMockAnalysis()` — a hardcoded stub that returns fake analysis data. This was useful for building out the UI and data pipeline, but the analysis content has no relationship to what actually happened in the session. Users need real, meaningful summaries of their sessions to get value from the analysis feature.

The Amplifier CLI already provides LLM access via `amplifier run --mode single --output-format json`. The existing `SessionDigest` type already captures everything needed for analysis (prompts, errors, test results, git operations, file changes, duration, event counts). The UI already handles loading states, error states, and all 7 section renderers. The only missing piece is the actual LLM call.

## Approach

**Direct subprocess call to `amplifier run --mode single --output-format json`.**

This is the simplest path — uses the full Amplifier runtime (key management, model routing, provider support). The 3–5s cold-start is acceptable since the UI already has a loading state. No new dependencies needed.

**Alternatives considered and rejected:**

- **Direct HTTP to provider APIs** — Reimplements provider logic Canvas shouldn't own (key parsing, retry logic, model routing). Tight coupling to specific provider APIs.
- **Long-running sidecar process** — Dramatically more complex lifecycle management for what's essentially a "summarize this" call. YAGNI.

## Architecture

Three new pieces. Everything else stays the same.

```
┌─────────────────────────────────────────────────────────┐
│  Renderer                                               │
│                                                         │
│  SessionAnalysis component (unchanged)                  │
│  SettingsModal.tsx (NEW)                                │
│    └─ IPC: SETTINGS_GET / SETTINGS_SAVE                │
└────────────────────┬────────────────────────────────────┘
                     │ IPC
┌────────────────────▼────────────────────────────────────┐
│  Main Process                                           │
│                                                         │
│  analysisService.ts (modified — delete mock, wire LLM)  │
│    ├─ prompts/analysis.ts (NEW) — buildAnalysisPrompt() │
│    ├─ llm.ts (NEW) — invokeLLM()                       │
│    └─ settings.ts (NEW) — getSettings()                │
│                                                         │
│  llm.ts spawns:                                         │
│    amplifier run --mode single --output-format json     │
└─────────────────────────────────────────────────────────┘
```

**What stays the same:** The `SessionAnalysis` component, all 7 section renderers, `SessionAnalysisData` type, IPC channels (`GET_ANALYSIS`, `TRIGGER_ANALYSIS`, `ANALYSIS_READY`), the digest builder, the store — all untouched.

## Components

### LLM Subprocess Wrapper — `src/main/llm.ts`

Single module with one public function:

```typescript
invokeLLM(
  prompt: string,
  options?: { model?: string; provider?: string; timeoutMs?: number }
): Promise<string>
```

**Behavior:**

- Spawns `amplifier run --mode single --output-format json` as a child process via Node's `child_process.spawn`
- Writes the prompt to `proc.stdin`, then calls `proc.stdin.end()`
- Collects stdout chunks into a buffer
- If `options.model` is set, adds `--model <model>` flag
- If `options.provider` is set, adds `--provider <provider>` flag
- Strips non-JSON preamble lines from collected stdout (finds the first line starting with `{`)
- Parses JSON, returns the `response` field
- Default timeout: 60 seconds. Uses `setTimeout` + `proc.kill()` to enforce — throws on timeout
- On non-zero exit code or JSON parse failure, throws with a descriptive error

**Not in scope:** Streaming, retries, caching.

#### Binary Resolution

`llm.ts` must resolve the `amplifier` binary path before spawning:

1. Check `process.env.PATH` (works in dev / terminal-launched)
2. Check common install locations: `~/.local/bin/amplifier`, `/usr/local/bin/amplifier`, `/opt/homebrew/bin/amplifier`
3. If not found, throw a descriptive error: `"amplifier CLI not found. Install from..."`
4. Cache the resolved path for the session lifetime (don't re-resolve every call)

### LLM Prompt — `src/main/prompts/analysis.ts`

Prompt lives in a separate file — not inlined as a string in the service. Keeps the service logic clean and makes the prompt easy to iterate on.

**Exported function:**

```typescript
buildAnalysisPrompt(digest: SessionDigest): string
```

`buildAnalysisPrompt(digest)` returns a single string that concatenates the system instructions and the serialized digest with a clear separator (e.g., `---`). The Amplifier CLI receives this as a single user-turn input via stdin. There are no separate "system" and "user" messages — it's one prompt string.

**System instructions section:** Instructs the LLM to act as a session analyst. Specifies the exact JSON schema it must return (matching the `AnalysisResult` sections array). Includes a few-shot example of good output so the model understands the tone and structure expected for each section type. The few-shot examples must use the exact hyphenated `AnalysisSectionType` values: `summary`, `changes`, `key-moments`, `next-steps`, `decisions`, `action-items`, `open-questions`.

**Digest section:** The serialized `SessionDigest` — which already contains: first prompt, all prompts, errors, test results, git operations, file changes, duration, event counts, and tool call count.

**Output contract:** The LLM must return valid JSON matching the `AnalysisResult.sections` array. Each section has a `type` (one of: `summary`, `changes`, `key-moments`, `next-steps`, `decisions`, `action-items`, `open-questions`), `title`, and `content` (which varies per section type — text block, bullet list, numbered list, etc.). The system prompt includes the exact TypeScript interface so the model knows the shape.

#### Digest Size Limits

The prompt must stay under ~8K tokens to hit Haiku's sweet spot. Truncation happens in `buildAnalysisPrompt`, not in the digest builder:

| Digest field | Cap | Truncation behavior |
|---|---|---|
| `SessionDigest.prompts` | 20 entries | Truncate with a note: `"... and N more prompts"` |
| `SessionDigest.toolCalls` | — | Already just a count, not full calls — no issue |
| `SessionDigest.errors` | 10 entries | Truncate excess |
| `SessionDigest.fileChanges` | 50 entries | Truncate excess |
| `SessionDigest.gitOperations` | 20 entries | Truncate excess |

### Settings System — `src/main/settings.ts`

**Settings file:** `~/.amplifier-canvas/settings.json`

```json
{
  "analysisModel": "claude-haiku-4-5",
  "analysisProvider": null
}
```

- `analysisModel` — string, defaults to `"claude-haiku-4-5"`. Passed as `--model` to the CLI.
- `analysisProvider` — string or null, defaults to `null` (use Amplifier's default routing). If set, passed as `--provider`.

**Type:** `CanvasSettings` interface lives in `src/shared/types.ts` because both main process (`settings.ts`) and renderer (`SettingsModal.tsx`) need it:

```typescript
interface CanvasSettings {
  analysisModel: string
  analysisProvider: string | null
}
```

**Module functions:**

| Function | Description |
|---|---|
| `getSettings(): CanvasSettings` | Reads the file, returns defaults if missing or corrupt |
| `saveSettings(settings: CanvasSettings): Promise<{ success: boolean }>` | Async. Writes atomically. Creates `~/.amplifier-canvas/` on first write if it doesn't exist. Returns result to renderer via IPC. |
| `getDefaultSettings(): CanvasSettings` | Returns the hardcoded defaults |

**IPC channels (2 new):**

- `SETTINGS_GET` — renderer requests current settings
- `SETTINGS_SAVE` — renderer sends updated settings, main persists them. Handler returns `{ success: boolean }` to the renderer.

**Validation:** Settings values are not validated on save. An invalid model name will surface as an analysis error when `invokeLLM` fails — the user sees the error state with Regenerate. This is intentional: the set of valid model names changes frequently and differs per provider. Out-of-scope for this design.

### Settings UI — `src/renderer/src/components/SettingsModal.tsx`

Triggered by the existing top-right settings button. Minimal modal:

- Text input for "Analysis Model" (pre-filled with current value)
- Text input for "Analysis Provider" (pre-filled, placeholder "default")
- Save / Cancel buttons

No tabs, no categories. One modal, two fields, room to grow.

## Required Changes to Existing Files

These existing files need modifications to support the new settings IPC and shared types:

- **`src/shared/types.ts`**: Add `SETTINGS_GET: 'settings:get'` and `SETTINGS_SAVE: 'settings:save'` to `IPC_CHANNELS`. Add the `CanvasSettings` interface (see Settings section above).
- **`src/main/ipc.ts`**: Register `ipcMain.handle` for both new channels (`SETTINGS_GET`, `SETTINGS_SAVE`). Add cleanup in the `mainWindow.on('closed')` block to remove the handlers.
- **`src/preload/index.ts`**: Add `getSettings()` and `saveSettings(settings)` bridge methods via `contextBridge`.

## Data Flow

### Current flow (mock — being replaced)

```
triggerAnalysis(sessionId)
  → reads events
  → builds digest
  → generateMockAnalysis(digest)    ← DELETED
  → saves to DB
  → returns
```

### New flow (real LLM)

```
triggerAnalysis(sessionId)
  → reads events
  → builds digest
  → buildAnalysisPrompt(digest)     ← NEW: constructs prompt
  → getSettings()                   ← NEW: reads model/provider
  → invokeLLM(prompt, {model, provider})  ← NEW: subprocess call
  → parseAnalysisResponse(raw)      ← NEW: validates JSON
  → saves to DB
  → returns
```

### Key changes to `analysisService.ts`

- `generateMockAnalysis()` is **deleted entirely**
- `buildAnalysisPrompt(digest)` imported from `prompts/analysis.ts`
- New `parseAnalysisResponse(raw: string): AnalysisResult` validates and maps the LLM's JSON output. Note: `AnalysisResult` contains the `sections` array, which is what the LLM produces. `SessionAnalysisData` includes session metadata the LLM doesn't generate — the service adds that metadata after parsing.
- `getSettings()` called to read model/provider before the LLM call
- Everything else (DB writes, status updates, IPC push) stays as-is

## Parsing and Validation

`parseAnalysisResponse()` lives in `analysisService.ts`. Takes the raw string response from the LLM:

1. Extracts JSON from the response (strips markdown code fences if present)
2. Parses JSON
3. Validates it has a `sections` array
4. Validates each section has `type`, `title`, and `content`
5. Validates that section `type` values are valid `AnalysisSectionType` values (hyphenated names: `summary`, `changes`, `key-moments`, `next-steps`, `decisions`, `action-items`, `open-questions`)
6. If JSON is malformed or validation fails, throws with a descriptive error

## Error Handling

The existing `triggerAnalysis` has a try/catch that sets `analysis_status = 'failed'` on failure. The UI already renders an error state with a "Regenerate" button. All failure modes flow through the same path — no new error handling needed.

| Failure | Source | Handling |
|---|---|---|
| Subprocess crash | `llm.ts` throws | Caught by `triggerAnalysis` try/catch → `analysis_status = 'failed'` |
| Timeout (>60s) | `llm.ts` kills process, throws | Same path |
| Non-zero exit code | `llm.ts` throws | Same path |
| Malformed JSON from LLM | `parseAnalysisResponse` throws | Same path |
| Missing required sections | `parseAnalysisResponse` throws | Same path |
| Settings file corrupt | `getSettings()` returns defaults | Graceful — uses `claude-haiku-4-5` |

**Concurrency:** The existing `updateAnalysisStatus(sessionId, 'loading')` at the top of `triggerAnalysis` acts as a guard. The UI checks this status and disables the Regenerate button while loading. Multiple rapid clicks or auto-trigger races are handled by this existing mechanism — no additional deduplication needed.

## Testing Strategy

### Unit tests for `llm.ts`

Mock `child_process.spawn` to simulate the subprocess:

- Valid JSON response → returns response string
- Stdout with preamble lines before JSON → strips preamble, returns response
- Subprocess exits with non-zero code → throws descriptive error
- JSON parse failure (malformed output) → throws
- Timeout → mock `spawn`, simulate timeout via `setTimeout` callback, verify `proc.kill()` was called
- Model/provider options are passed as CLI flags correctly
- Binary not found → throws descriptive error with install instructions

### Unit tests for `prompts/analysis.ts`

- `buildAnalysisPrompt(digest)` returns a string containing the serialized digest
- Prompt includes the expected JSON schema instructions
- Prompt uses hyphenated section type names (`key-moments`, not `key_moments`)
- Large digests are truncated per the size limits (prompts capped at 20, errors at 10, etc.)

### Unit tests for `analysisService.ts` (updated)

Existing conditional section tests (e.g., "includes changes section when files modified") become tests for `parseAnalysisResponse` — they verify that a given LLM JSON fixture is correctly parsed into the expected `AnalysisResult`.

`triggerAnalysis` tests mock `invokeLLM` to return a fixture string, then verify the full flow:

- Prompt built → LLM called → response parsed → DB saved → status updated to `'ready'`
- LLM returns malformed JSON → `analysis_status` set to `'failed'`
- LLM throws (timeout/subprocess crash) → `analysis_status` set to `'failed'`

### Unit tests for `settings.ts`

- File missing → returns defaults
- File corrupt → returns defaults
- Valid file → returns parsed settings
- `saveSettings` creates directory if missing
- `saveSettings` writes valid JSON
- `saveSettings` returns `{ success: boolean }`

### E2E

Existing `analysis.spec.ts` tests continue to pass. Update mock/fixture strategy to simulate a real LLM response rather than hardcoded mock data.

## Open Questions

None — all design decisions were validated during brainstorming.
