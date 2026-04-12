# Real LLM-Powered Session Analysis Design

## Goal

Replace the mock `generateMockAnalysis()` in `analysisService.ts` with a real LLM call that reads a structured `SessionDigest` and produces a `SessionAnalysisData` response, and add a minimal settings system so users can configure which model is used.

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

- Spawns `amplifier run --mode single --output-format json` as a child process via Node's `execFile`
- If `options.model` is set, adds `--model <model>` flag
- If `options.provider` is set, adds `--provider <provider>` flag
- Pipes the prompt to stdin, closes stdin
- Reads stdout, strips non-JSON preamble lines (finds the first line starting with `{`)
- Parses JSON, returns the `response` field
- Default timeout: 60 seconds. Kills the process and throws on timeout
- On non-zero exit code or JSON parse failure, throws with a descriptive error

**Not in scope:** Streaming, retries, caching.

### LLM Prompt — `src/main/prompts/analysis.ts`

Prompt lives in a separate file — not inlined as a string in the service. Keeps the service logic clean and makes the prompt easy to iterate on.

**System prompt:** Instructs the LLM to act as a session analyst. Specifies the exact JSON schema it must return (matching `SessionAnalysisData`). Includes a few-shot example of good output so the model understands the tone and structure expected for each section type (summary, key_moments, test_overview, changes, decisions, next_steps, action_items, open_questions).

**User prompt:** The serialized `SessionDigest` — which already contains: first prompt, all prompts, errors, test results, git operations, file changes, duration, event counts, and tool call count.

**Output contract:** The LLM must return valid JSON matching the `SessionAnalysisData.sections` array. Each section has a `type`, `title`, and `content` (which varies per section type — text block, bullet list, numbered list, etc.). The system prompt includes the exact TypeScript interface so the model knows the shape.

**Exported function:**

```typescript
buildAnalysisPrompt(digest: SessionDigest): string
```

Constructs the full prompt string combining system instructions with the serialized digest.

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

**Module functions:**

| Function | Description |
|---|---|
| `getSettings(): CanvasSettings` | Reads the file, returns defaults if missing or corrupt |
| `saveSettings(settings: CanvasSettings): void` | Writes atomically. Creates `~/.amplifier-canvas/` on first write if it doesn't exist |
| `getDefaultSettings(): CanvasSettings` | Returns the hardcoded defaults |

**IPC channels (2 new):**

- `SETTINGS_GET` — renderer requests current settings
- `SETTINGS_SAVE` — renderer sends updated settings, main persists them

### Settings UI — `src/renderer/src/components/SettingsModal.tsx`

Triggered by the existing top-right settings button. Minimal modal:

- Text input for "Analysis Model" (pre-filled with current value)
- Text input for "Analysis Provider" (pre-filled, placeholder "default")
- Save / Cancel buttons

No tabs, no categories. One modal, two fields, room to grow.

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
- New `parseAnalysisResponse(raw: string): SessionAnalysisData` validates and maps the LLM's JSON output to the existing type
- `getSettings()` called to read model/provider before the LLM call
- Everything else (DB writes, status updates, IPC push) stays as-is

## Parsing and Validation

`parseAnalysisResponse()` lives in `analysisService.ts`. Takes the raw string response from the LLM:

1. Extracts JSON from the response (strips markdown code fences if present)
2. Parses JSON
3. Validates it has a `sections` array
4. Validates each section has `type`, `title`, and `content`
5. If a section is missing from the expected set, uses a sensible default (e.g., "No test activity detected" for `test_overview` when there are no test results)
6. If JSON is malformed or validation fails, throws with a descriptive error

## Error Handling

The existing `triggerAnalysis` has a try/catch that sets `analysis_status = 'error'` on failure. The UI already renders an error state with a "Regenerate" button. All failure modes flow through the same path — no new error handling needed.

| Failure | Source | Handling |
|---|---|---|
| Subprocess crash | `llm.ts` throws | Caught by `triggerAnalysis` try/catch → `analysis_status = 'error'` |
| Timeout (>60s) | `llm.ts` kills process, throws | Same path |
| Non-zero exit code | `llm.ts` throws | Same path |
| Malformed JSON from LLM | `parseAnalysisResponse` throws | Same path |
| Missing required sections | `parseAnalysisResponse` throws | Same path |
| Settings file corrupt | `getSettings()` returns defaults | Graceful — uses `claude-haiku-4-5` |

## Testing Strategy

### Unit tests for `llm.ts`

Mock `child_process.execFile` to simulate the subprocess:

- Valid JSON response → returns response string
- Stdout with preamble lines before JSON → strips preamble, returns response
- Subprocess exits with non-zero code → throws descriptive error
- JSON parse failure (malformed output) → throws
- Timeout → kills process, throws
- Model/provider options are passed as CLI flags correctly

### Unit tests for `prompts/analysis.ts`

- `buildAnalysisPrompt(digest)` returns a string containing the serialized digest
- Prompt includes the expected JSON schema instructions

### Unit tests for `analysisService.ts` (updated)

Existing tests updated — mock `invokeLLM` instead of `generateMockAnalysis`:

- Valid LLM response → parsed correctly, saved to DB, returned
- LLM returns malformed JSON → `analysis_status` set to `'error'`
- LLM throws (timeout/subprocess crash) → `analysis_status` set to `'error'`

### Unit tests for `settings.ts`

- File missing → returns defaults
- File corrupt → returns defaults
- Valid file → returns parsed settings
- `saveSettings` creates directory if missing
- `saveSettings` writes valid JSON

### E2E

Existing `analysis.spec.ts` tests continue to pass. Update mock/fixture strategy to simulate a real LLM response rather than hardcoded mock data.

## Open Questions

None — all design decisions were validated during brainstorming.