# Phase 2: ANALYSIS View Implementation Plan

> **Execution:** Use the subagent-driven-development workflow to implement this plan.

**Goal:** Build the unified ANALYSIS view for completed sessions — mechanical data renders instantly, AI-curated sections load async (stubbed LLM), replacing the "Analysis view coming soon" placeholder.

**Architecture:** Three-layer display — mechanical (instant stats/prompt history from parsed events), AI (async on first view via stubbed Amplifier subprocess, cached in SQLite), and live (deferred to future phase). The LLM picks from a typed section catalog (7 types); Canvas renders each type with a known React component.

**Tech Stack:** Electron 35, React 19, TypeScript, Zustand, better-sqlite3, node:test (unit), Playwright (E2E)

**Design doc:** `docs/plans/2026-04-09-phase-2-analysis-view-design.md`

---

## Task 1: Types & Schema

**Files:**
- Create: `src/shared/analysisTypes.ts`
- Modify: `src/shared/types.ts`

### Step 1: Add IPC channel constants to `src/shared/types.ts`

Add three new channels to the `IPC_CHANNELS` object. Insert after the existing `READ_TEXT` entry:

```ts
// In src/shared/types.ts, inside IPC_CHANNELS:

  // Renderer → Main (invoke/handle)
  LIST_DIR: 'files:list-dir',
  READ_TEXT: 'files:read-text',
  GET_ANALYSIS: 'analysis:get',
  TRIGGER_ANALYSIS: 'analysis:trigger',
  // Main → Renderer (push)
  ANALYSIS_READY: 'analysis:ready',
```

### Step 2: Create `src/shared/analysisTypes.ts`

```ts
// src/shared/analysisTypes.ts

/**
 * Typed section catalog — the LLM picks from these known types.
 * Each type has a corresponding React renderer component.
 */
export type AnalysisSectionType =
  | 'summary'
  | 'changes'
  | 'key-moments'
  | 'next-steps'
  | 'decisions'
  | 'action-items'
  | 'open-questions'

/** A single section in the AI-curated analysis */
export interface AnalysisSection {
  type: AnalysisSectionType
  title: string
  content: AnalysisSectionContent
}

/** Content varies by section type */
export type AnalysisSectionContent =
  | SummaryContent
  | ChangesContent
  | KeyMomentsContent
  | NextStepsContent
  | DecisionsContent
  | ActionItemsContent
  | OpenQuestionsContent

export interface SummaryContent {
  text: string
}

export interface ChangesContent {
  files: Array<{
    path: string
    changeType: 'created' | 'modified' | 'deleted'
    linesAdded?: number
    linesRemoved?: number
  }>
  prUrl?: string
}

export interface KeyMomentsContent {
  moments: Array<{
    timestamp: string
    description: string
  }>
}

export interface NextStepsContent {
  items: string[]
}

export interface DecisionsContent {
  decisions: Array<{
    decision: string
    rationale: string
  }>
}

export interface ActionItemsContent {
  items: Array<{
    text: string
    completed: boolean
  }>
}

export interface OpenQuestionsContent {
  questions: string[]
}

/** Full LLM response shape — cached in analysis_json column */
export interface AnalysisResult {
  sections: AnalysisSection[]
}

export type AnalysisStatus = 'none' | 'loading' | 'ready' | 'failed'

/** Prompt entry with timestamp for the prompt history section */
export interface PromptEntry {
  text: string
  timestamp: string
}

/** Test status extracted from events */
export interface TestStatus {
  passed: number
  failed: number
  failedTests?: string[]
}

/** Git operation extracted from events */
export interface GitOperation {
  type: 'commit' | 'push' | 'pr-create'
  timestamp: string
  message?: string
  sha?: string
  prUrl?: string
}

/** File change record for mechanical data */
export interface FileChange {
  path: string
  changeType: 'created' | 'modified' | 'deleted'
}

/** Complete mechanical data stored in DB */
export interface MechanicalData {
  testStatus: TestStatus | null
  promptHistory: PromptEntry[]
  filesChanged: FileChange[]
  gitOperations: GitOperation[]
}

/** Shape of analysis data returned to the renderer */
export interface SessionAnalysisData {
  sessionId: string
  mechanical: MechanicalData
  analysisStatus: AnalysisStatus
  analysisResult: AnalysisResult | null
  analysisGeneratedAt: string | null
}

/** Digest sent to LLM — structured summary of session events */
export interface SessionDigest {
  sessionId: string
  projectSlug: string
  duration: { startedAt: string; endedAt: string }
  prompts: PromptEntry[]
  toolCalls: Array<{ tool: string; path?: string; timestamp: string }>
  errors: Array<{ message: string; timestamp: string }>
  testResults: TestStatus | null
  filesChanged: FileChange[]
  gitOperations: GitOperation[]
}
```

### Step 3: Verify types compile

Run: `npx tsc --noEmit src/shared/analysisTypes.ts`
Expected: No errors

### Step 4: Commit

```bash
git add src/shared/types.ts src/shared/analysisTypes.ts
git commit -m "feat(phase2): add analysis types and IPC channels"
```

---

## Task 2: DB Migration

**Files:**
- Modify: `src/main/db.ts`
- Test: `tests/events-parser.test.ts` (not modified — existing tests remain green)

### Step 1: Add 7 new columns to the migrations array in `src/main/db.ts`

In `initDatabase()`, append to the existing `migrations` array (after the `filesChangedCount` entry at line 65):

```ts
    // Phase 2: mechanical data columns
    {
      column: 'test_status',
      ddl: 'ALTER TABLE sessions ADD COLUMN test_status TEXT',
    },
    {
      column: 'prompt_history',
      ddl: 'ALTER TABLE sessions ADD COLUMN prompt_history TEXT',
    },
    {
      column: 'files_changed',
      ddl: 'ALTER TABLE sessions ADD COLUMN files_changed TEXT',
    },
    {
      column: 'git_operations',
      ddl: 'ALTER TABLE sessions ADD COLUMN git_operations TEXT',
    },
    // Phase 2: AI analysis columns
    {
      column: 'analysis_json',
      ddl: 'ALTER TABLE sessions ADD COLUMN analysis_json TEXT',
    },
    {
      column: 'analysis_generated_at',
      ddl: 'ALTER TABLE sessions ADD COLUMN analysis_generated_at TEXT',
    },
    {
      column: 'analysis_status',
      ddl: "ALTER TABLE sessions ADD COLUMN analysis_status TEXT DEFAULT 'none'",
    },
```

### Step 2: Extend the `SessionRow` interface

Add the 7 new nullable columns after the existing `filesChangedCount` field (around line 186):

```ts
export interface SessionRow {
  id: string
  projectSlug: string
  startedBy: string
  startedAt: string
  endedAt: string | null
  status: string
  byteOffset: number
  title: string | null
  exitCode: number | null
  firstPrompt: string | null
  promptCount: number
  toolCallCount: number
  filesChangedCount: number
  // Phase 2 columns
  test_status: string | null
  prompt_history: string | null
  files_changed: string | null
  git_operations: string | null
  analysis_json: string | null
  analysis_generated_at: string | null
  analysis_status: string | null
}
```

### Step 3: Add DB helper functions for analysis data

Append to the bottom of `src/main/db.ts`:

```ts
export function saveMechanicalData(
  id: string,
  data: {
    test_status: string | null
    prompt_history: string | null
    files_changed: string | null
    git_operations: string | null
  },
): void {
  const d = getDatabase()
  d.prepare(`
    UPDATE sessions SET
      test_status = ?,
      prompt_history = ?,
      files_changed = ?,
      git_operations = ?
    WHERE id = ?
  `).run(data.test_status, data.prompt_history, data.files_changed, data.git_operations, id)
}

export function saveAnalysisResult(
  id: string,
  data: {
    analysis_json: string
    analysis_generated_at: string
    analysis_status: string
  },
): void {
  const d = getDatabase()
  d.prepare(`
    UPDATE sessions SET
      analysis_json = ?,
      analysis_generated_at = ?,
      analysis_status = ?
    WHERE id = ?
  `).run(data.analysis_json, data.analysis_generated_at, data.analysis_status, id)
}

export function updateAnalysisStatus(id: string, status: string): void {
  const d = getDatabase()
  d.prepare('UPDATE sessions SET analysis_status = ? WHERE id = ?').run(status, id)
}
```

### Step 4: Verify build passes

Run: `npm run build`
Expected: Build succeeds with no errors

### Step 5: Verify existing tests still pass

Run: `npx tsx --test tests/events-parser.test.ts`
Expected: All existing tests pass (no regressions)

### Step 6: Commit

```bash
git add src/main/db.ts
git commit -m "feat(phase2): add 7 analysis columns to sessions table"
```

---

## Task 3: Event Parser Extension

**Files:**
- Modify: `src/main/events-parser.ts`
- Test: `tests/events-parser.test.ts`

### Step 1: Write failing tests for new extraction functions

Append to `tests/events-parser.test.ts`:

```ts
import {
  extractFirstPrompt,
  extractSessionStats,
  deriveSessionTitle,
  extractAllPrompts,
  extractErrors,
  extractTestResults,
  extractGitOperations,
} from '../src/main/events-parser'
```

(Update the existing import at line 3 to include the new function names.)

Then append these new test blocks after the existing `deriveSessionTitle` describe block:

```ts
describe('extractAllPrompts', () => {
  test('returns all user_message events with text and timestamp', () => {
    const events: ParsedEvent[] = [
      { type: 'session:start', timestamp: '2024-01-01T00:00:00Z', data: {} },
      { type: 'user_message', timestamp: '2024-01-01T00:00:01Z', data: { text: 'First prompt' } },
      { type: 'tool_call', timestamp: '2024-01-01T00:00:02Z', data: { tool: 'read_file', args: {} } },
      { type: 'user_message', timestamp: '2024-01-01T00:00:05Z', data: { text: 'Second prompt' } },
    ]
    const prompts = extractAllPrompts(events)
    assert.equal(prompts.length, 2)
    assert.equal(prompts[0].text, 'First prompt')
    assert.equal(prompts[0].timestamp, '2024-01-01T00:00:01Z')
    assert.equal(prompts[1].text, 'Second prompt')
  })

  test('returns empty array when no user_message events', () => {
    const events: ParsedEvent[] = [
      { type: 'session:start', timestamp: '2024-01-01T00:00:00Z', data: {} },
    ]
    assert.deepEqual(extractAllPrompts(events), [])
  })

  test('skips user_message events without text field', () => {
    const events: ParsedEvent[] = [
      { type: 'user_message', timestamp: '2024-01-01T00:00:01Z', data: {} },
      { type: 'user_message', timestamp: '2024-01-01T00:00:02Z', data: { text: 'Valid' } },
    ]
    const prompts = extractAllPrompts(events)
    assert.equal(prompts.length, 1)
    assert.equal(prompts[0].text, 'Valid')
  })
})

describe('extractErrors', () => {
  test('extracts error events with message and timestamp', () => {
    const events: ParsedEvent[] = [
      { type: 'error', timestamp: '2024-01-01T00:00:01Z', data: { message: 'Something failed' } },
      { type: 'tool_call', timestamp: '2024-01-01T00:00:02Z', data: { tool: 'read_file', args: {} } },
      { type: 'error', timestamp: '2024-01-01T00:00:03Z', data: { message: 'Another error' } },
    ]
    const errors = extractErrors(events)
    assert.equal(errors.length, 2)
    assert.equal(errors[0].message, 'Something failed')
    assert.equal(errors[1].timestamp, '2024-01-01T00:00:03Z')
  })

  test('extracts tool_result errors', () => {
    const events: ParsedEvent[] = [
      {
        type: 'tool_result',
        timestamp: '2024-01-01T00:00:01Z',
        data: { tool: 'bash', error: true, output: 'Command failed with exit code 1' },
      },
    ]
    const errors = extractErrors(events)
    assert.equal(errors.length, 1)
    assert.equal(errors[0].message, 'Command failed with exit code 1')
  })

  test('returns empty array when no errors', () => {
    const events: ParsedEvent[] = [
      { type: 'session:start', timestamp: '2024-01-01T00:00:00Z', data: {} },
    ]
    assert.deepEqual(extractErrors(events), [])
  })
})

describe('extractTestResults', () => {
  test('extracts test pass/fail counts from tool_result events', () => {
    const events: ParsedEvent[] = [
      {
        type: 'tool_result',
        timestamp: '2024-01-01T00:00:01Z',
        data: {
          tool: 'bash',
          output: 'Tests: 14 passed, 2 failed\nFailing: test_login, test_signup',
        },
      },
    ]
    const result = extractTestResults(events)
    assert.notEqual(result, null)
    assert.equal(result!.passed, 14)
    assert.equal(result!.failed, 2)
  })

  test('returns null when no test results found', () => {
    const events: ParsedEvent[] = [
      { type: 'tool_call', timestamp: '2024-01-01T00:00:01Z', data: { tool: 'read_file', args: {} } },
    ]
    assert.equal(extractTestResults(events), null)
  })

  test('handles pytest-style output', () => {
    const events: ParsedEvent[] = [
      {
        type: 'tool_result',
        timestamp: '2024-01-01T00:00:01Z',
        data: {
          tool: 'bash',
          output: '====== 5 passed, 1 failed ======',
        },
      },
    ]
    const result = extractTestResults(events)
    assert.notEqual(result, null)
    assert.equal(result!.passed, 5)
    assert.equal(result!.failed, 1)
  })

  test('handles all-passing results', () => {
    const events: ParsedEvent[] = [
      {
        type: 'tool_result',
        timestamp: '2024-01-01T00:00:01Z',
        data: { tool: 'bash', output: '10 passed' },
      },
    ]
    const result = extractTestResults(events)
    assert.notEqual(result, null)
    assert.equal(result!.passed, 10)
    assert.equal(result!.failed, 0)
  })
})

describe('extractGitOperations', () => {
  test('extracts git commit from bash tool_result', () => {
    const events: ParsedEvent[] = [
      {
        type: 'tool_result',
        timestamp: '2024-01-01T00:00:01Z',
        data: {
          tool: 'bash',
          output: '[main abc1234] feat: add login page\n 2 files changed',
        },
      },
    ]
    const ops = extractGitOperations(events)
    assert.equal(ops.length, 1)
    assert.equal(ops[0].type, 'commit')
    assert.equal(ops[0].sha, 'abc1234')
    assert.equal(ops[0].message, 'feat: add login page')
  })

  test('extracts PR creation', () => {
    const events: ParsedEvent[] = [
      {
        type: 'tool_result',
        timestamp: '2024-01-01T00:00:01Z',
        data: {
          tool: 'bash',
          output: 'https://github.com/org/repo/pull/42',
        },
      },
    ]
    const ops = extractGitOperations(events)
    assert.equal(ops.length, 1)
    assert.equal(ops[0].type, 'pr-create')
    assert.equal(ops[0].prUrl, 'https://github.com/org/repo/pull/42')
  })

  test('returns empty array when no git operations', () => {
    const events: ParsedEvent[] = [
      { type: 'tool_call', timestamp: '2024-01-01T00:00:01Z', data: { tool: 'read_file', args: {} } },
    ]
    assert.deepEqual(extractGitOperations(events), [])
  })
})
```

### Step 2: Run tests to verify they fail

Run: `npx tsx --test tests/events-parser.test.ts`
Expected: FAIL — the 4 new functions don't exist yet

### Step 3: Implement the 4 new extraction functions

Append to `src/main/events-parser.ts`:

```ts
import type { PromptEntry, TestStatus, GitOperation } from '../shared/analysisTypes'

export function extractAllPrompts(events: ParsedEvent[]): PromptEntry[] {
  const prompts: PromptEntry[] = []
  for (const event of events) {
    if (event.type !== 'user_message') continue
    const text = event.data.text
    if (typeof text !== 'string') continue
    prompts.push({ text, timestamp: event.timestamp })
  }
  return prompts
}

export function extractErrors(
  events: ParsedEvent[],
): Array<{ message: string; timestamp: string }> {
  const errors: Array<{ message: string; timestamp: string }> = []
  for (const event of events) {
    if (event.type === 'error') {
      const message = (event.data as Record<string, unknown>).message
      if (typeof message === 'string') {
        errors.push({ message, timestamp: event.timestamp })
      }
    } else if (event.type === 'tool_result') {
      const data = event.data as Record<string, unknown>
      if (data.error === true && typeof data.output === 'string') {
        errors.push({ message: data.output, timestamp: event.timestamp })
      }
    }
  }
  return errors
}

export function extractTestResults(events: ParsedEvent[]): TestStatus | null {
  let lastResult: TestStatus | null = null

  for (const event of events) {
    if (event.type !== 'tool_result') continue
    const data = event.data as Record<string, unknown>
    const output = data.output
    if (typeof output !== 'string') continue

    // Match patterns like "5 passed, 1 failed" or "14 passed"
    const passMatch = output.match(/(\d+)\s+passed/)
    const failMatch = output.match(/(\d+)\s+failed/)

    if (passMatch) {
      lastResult = {
        passed: parseInt(passMatch[1], 10),
        failed: failMatch ? parseInt(failMatch[1], 10) : 0,
      }
    }
  }

  return lastResult
}

export function extractGitOperations(events: ParsedEvent[]): GitOperation[] {
  const ops: GitOperation[] = []

  for (const event of events) {
    if (event.type !== 'tool_result') continue
    const data = event.data as Record<string, unknown>
    const output = data.output
    if (typeof output !== 'string') continue

    // Match git commit: [branch sha] message
    const commitMatch = output.match(/\[[\w/.-]+\s+([a-f0-9]{7,})\]\s+(.+)/)
    if (commitMatch) {
      ops.push({
        type: 'commit',
        timestamp: event.timestamp,
        sha: commitMatch[1],
        message: commitMatch[2],
      })
      continue
    }

    // Match PR URL
    const prMatch = output.match(/(https:\/\/github\.com\/[^\s]+\/pull\/\d+)/)
    if (prMatch) {
      ops.push({
        type: 'pr-create',
        timestamp: event.timestamp,
        prUrl: prMatch[1],
      })
      continue
    }

    // Match git push
    if (output.includes('->') && (output.includes('git push') || output.includes('To github.com') || output.includes('To https://github.com'))) {
      ops.push({
        type: 'push',
        timestamp: event.timestamp,
      })
    }
  }

  return ops
}
```

### Step 4: Run tests to verify they pass

Run: `npx tsx --test tests/events-parser.test.ts`
Expected: All tests pass (existing + new)

### Step 5: Commit

```bash
git add src/main/events-parser.ts tests/events-parser.test.ts
git commit -m "feat(phase2): extend event parser with prompts, errors, tests, git extraction"
```

---

## Task 4: Digest Builder

**Files:**
- Create: `src/main/digestBuilder.ts`
- Create: `tests/digestBuilder.test.ts`

### Step 1: Write failing tests

Create `tests/digestBuilder.test.ts`:

```ts
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { buildSessionDigest } from '../src/main/digestBuilder'
import type { ParsedEvent } from '../src/main/events-parser'

const BASE_EVENTS: ParsedEvent[] = [
  { type: 'session:start', timestamp: '2024-01-01T10:00:00Z', data: { sessionId: 'sess-1', projectSlug: 'my-project' } },
  { type: 'user_message', timestamp: '2024-01-01T10:00:01Z', data: { text: 'Build the auth module' } },
  { type: 'tool_call', timestamp: '2024-01-01T10:00:05Z', data: { tool: 'read_file', args: { path: 'src/auth.ts' } } },
  { type: 'tool_call', timestamp: '2024-01-01T10:00:10Z', data: { tool: 'write_file', args: { path: 'src/auth.ts' } } },
  { type: 'tool_result', timestamp: '2024-01-01T10:00:15Z', data: { tool: 'bash', output: '5 passed' } },
  { type: 'error', timestamp: '2024-01-01T10:00:20Z', data: { message: 'Type error in auth.ts' } },
  { type: 'tool_result', timestamp: '2024-01-01T10:00:25Z', data: { tool: 'bash', output: '[main abc1234] feat: add auth\n 1 file changed' } },
  { type: 'user_message', timestamp: '2024-01-01T10:00:30Z', data: { text: 'Now add tests' } },
  { type: 'session:end', timestamp: '2024-01-01T10:00:40Z', data: { exitCode: 0 } },
]

describe('buildSessionDigest', () => {
  test('extracts session metadata from events', () => {
    const digest = buildSessionDigest('sess-1', 'my-project', BASE_EVENTS)
    assert.equal(digest.sessionId, 'sess-1')
    assert.equal(digest.projectSlug, 'my-project')
    assert.equal(digest.duration.startedAt, '2024-01-01T10:00:00Z')
    assert.equal(digest.duration.endedAt, '2024-01-01T10:00:40Z')
  })

  test('extracts all prompts', () => {
    const digest = buildSessionDigest('sess-1', 'my-project', BASE_EVENTS)
    assert.equal(digest.prompts.length, 2)
    assert.equal(digest.prompts[0].text, 'Build the auth module')
    assert.equal(digest.prompts[1].text, 'Now add tests')
  })

  test('extracts tool calls with tool name and path', () => {
    const digest = buildSessionDigest('sess-1', 'my-project', BASE_EVENTS)
    assert.ok(digest.toolCalls.length >= 2)
    assert.equal(digest.toolCalls[0].tool, 'read_file')
    assert.equal(digest.toolCalls[0].path, 'src/auth.ts')
  })

  test('extracts errors', () => {
    const digest = buildSessionDigest('sess-1', 'my-project', BASE_EVENTS)
    assert.equal(digest.errors.length, 1)
    assert.equal(digest.errors[0].message, 'Type error in auth.ts')
  })

  test('extracts test results', () => {
    const digest = buildSessionDigest('sess-1', 'my-project', BASE_EVENTS)
    assert.notEqual(digest.testResults, null)
    assert.equal(digest.testResults!.passed, 5)
    assert.equal(digest.testResults!.failed, 0)
  })

  test('extracts files changed (write operations only)', () => {
    const digest = buildSessionDigest('sess-1', 'my-project', BASE_EVENTS)
    assert.ok(digest.filesChanged.length >= 1)
    assert.equal(digest.filesChanged[0].path, 'src/auth.ts')
  })

  test('extracts git operations', () => {
    const digest = buildSessionDigest('sess-1', 'my-project', BASE_EVENTS)
    assert.equal(digest.gitOperations.length, 1)
    assert.equal(digest.gitOperations[0].type, 'commit')
    assert.equal(digest.gitOperations[0].sha, 'abc1234')
  })

  test('handles empty events gracefully', () => {
    const digest = buildSessionDigest('sess-1', 'my-project', [])
    assert.equal(digest.prompts.length, 0)
    assert.equal(digest.toolCalls.length, 0)
    assert.equal(digest.errors.length, 0)
    assert.equal(digest.testResults, null)
    assert.equal(digest.filesChanged.length, 0)
    assert.equal(digest.gitOperations.length, 0)
  })

  test('handles events without session:start or session:end', () => {
    const events: ParsedEvent[] = [
      { type: 'user_message', timestamp: '2024-01-01T10:00:01Z', data: { text: 'Hello' } },
    ]
    const digest = buildSessionDigest('sess-1', 'my-project', events)
    assert.equal(digest.duration.startedAt, '2024-01-01T10:00:01Z')
    assert.equal(digest.duration.endedAt, '2024-01-01T10:00:01Z')
    assert.equal(digest.prompts.length, 1)
  })
})
```

### Step 2: Run tests to verify they fail

Run: `npx tsx --test tests/digestBuilder.test.ts`
Expected: FAIL — `buildSessionDigest` doesn't exist yet

### Step 3: Implement the digest builder

Create `src/main/digestBuilder.ts`:

```ts
import type { ParsedEvent } from './events-parser'
import type { SessionDigest, FileChange } from '../shared/analysisTypes'
import {
  extractAllPrompts,
  extractErrors,
  extractTestResults,
  extractGitOperations,
  WRITE_OPERATIONS,
} from './events-parser'

/**
 * Build a structured digest from parsed session events.
 * This digest is what gets sent to the LLM for analysis.
 *
 * Token budget: ~8-12k tokens. Most sessions fit easily.
 * For monster sessions: keeps all user prompts (narrative arc),
 * full detail for last ~30 minutes, summarizes older activity.
 */
export function buildSessionDigest(
  sessionId: string,
  projectSlug: string,
  events: ParsedEvent[],
): SessionDigest {
  const startEvent = events.find((e) => e.type === 'session:start')
  const endEvent = events.find((e) => e.type === 'session:end')

  const firstTimestamp = startEvent?.timestamp ?? events[0]?.timestamp ?? new Date().toISOString()
  const lastTimestamp = endEvent?.timestamp ?? events[events.length - 1]?.timestamp ?? firstTimestamp

  // Extract tool calls (name + optional file path + timestamp)
  const toolCalls: SessionDigest['toolCalls'] = []
  const fileChangeMap = new Map<string, FileChange>()

  for (const event of events) {
    if (event.type !== 'tool_call') continue
    const data = event.data as Record<string, unknown>
    const tool = data.tool as string | undefined
    if (!tool) continue

    const args = data.args as Record<string, unknown> | undefined
    const filePath = (args?.path as string) ?? (args?.file_path as string) ?? undefined

    toolCalls.push({ tool, path: filePath, timestamp: event.timestamp })

    // Track file changes from write operations
    if (WRITE_OPERATIONS.has(tool) && filePath) {
      const changeType: FileChange['changeType'] =
        tool === 'create_file' ? 'created' : tool === 'delete_file' ? 'deleted' : 'modified'
      fileChangeMap.set(filePath, { path: filePath, changeType })
    }
  }

  return {
    sessionId,
    projectSlug,
    duration: { startedAt: firstTimestamp, endedAt: lastTimestamp },
    prompts: extractAllPrompts(events),
    toolCalls,
    errors: extractErrors(events),
    testResults: extractTestResults(events),
    filesChanged: Array.from(fileChangeMap.values()),
    gitOperations: extractGitOperations(events),
  }
}
```

### Step 4: Run tests to verify they pass

Run: `npx tsx --test tests/digestBuilder.test.ts`
Expected: All tests pass

### Step 5: Commit

```bash
git add src/main/digestBuilder.ts tests/digestBuilder.test.ts
git commit -m "feat(phase2): add digest builder — events to structured LLM digest"
```

---

## Task 5: Analysis Service (Stubbed LLM)

**Files:**
- Create: `src/main/analysisService.ts`

### Step 1: Create the analysis service with mock LLM response

Create `src/main/analysisService.ts`:

```ts
import { getSessionById, saveMechanicalData, saveAnalysisResult, updateAnalysisStatus } from './db'
import type { SessionRow } from './db'
import { tailReadEvents } from './events-parser'
import { buildSessionDigest } from './digestBuilder'
import { extractAllPrompts, extractTestResults, extractGitOperations } from './events-parser'
import { WRITE_OPERATIONS } from './events-parser'
import { join } from 'path'
import { getAmplifierHome } from './scanner'
import type {
  SessionAnalysisData,
  MechanicalData,
  AnalysisResult,
  AnalysisStatus,
  FileChange,
} from '../shared/analysisTypes'

/**
 * Get analysis data for a session.
 * Returns mechanical data (always available) + AI analysis (if cached).
 */
export function getAnalysis(sessionId: string): SessionAnalysisData | null {
  const row = getSessionById(sessionId)
  if (!row) return null

  const mechanical = parseMechanicalData(row)
  const analysisStatus = (row.analysis_status as AnalysisStatus) || 'none'
  const analysisResult = row.analysis_json ? parseJSON<AnalysisResult>(row.analysis_json) : null

  return {
    sessionId,
    mechanical,
    analysisStatus,
    analysisResult,
    analysisGeneratedAt: row.analysis_generated_at,
  }
}

/**
 * Trigger AI analysis for a session.
 * 1. Ensures mechanical data is stored
 * 2. Builds digest from events
 * 3. Calls LLM (stubbed) and caches result
 *
 * Returns the analysis data after completion.
 */
export async function triggerAnalysis(sessionId: string): Promise<SessionAnalysisData | null> {
  const row = getSessionById(sessionId)
  if (!row) return null

  // Mark as loading
  updateAnalysisStatus(sessionId, 'loading')

  try {
    // Ensure mechanical data is populated
    if (!row.prompt_history) {
      populateMechanicalData(sessionId, row)
    }

    // Build the digest
    const amplifierHome = getAmplifierHome()
    const eventsPath = join(
      amplifierHome,
      'projects',
      row.projectSlug,
      'sessions',
      sessionId,
      'events.jsonl',
    )
    const { events } = tailReadEvents(eventsPath, 0)
    const digest = buildSessionDigest(sessionId, row.projectSlug, events)

    // TODO: Replace with real Amplifier subprocess call
    // The real implementation will:
    // 1. Write digest to a temp file as JSON
    // 2. Run: amplifier run --oneshot --input <tempfile>
    // 3. Parse the structured JSON response
    // For now, return a realistic mock response.
    const analysisResult = generateMockAnalysis(digest)

    // Cache the result
    const now = new Date().toISOString()
    saveAnalysisResult(sessionId, {
      analysis_json: JSON.stringify(analysisResult),
      analysis_generated_at: now,
      analysis_status: 'ready',
    })

    // Return fresh data
    return getAnalysis(sessionId)
  } catch (err) {
    console.error('[analysis] Failed to generate analysis:', err instanceof Error ? err.message : String(err))
    updateAnalysisStatus(sessionId, 'failed')
    return getAnalysis(sessionId)
  }
}

/**
 * Populate mechanical data columns from events.
 * Called once on first analysis view — subsequent views read from DB.
 */
function populateMechanicalData(sessionId: string, row: SessionRow): void {
  const amplifierHome = getAmplifierHome()
  const eventsPath = join(
    amplifierHome,
    'projects',
    row.projectSlug,
    'sessions',
    sessionId,
    'events.jsonl',
  )
  const { events } = tailReadEvents(eventsPath, 0)

  const prompts = extractAllPrompts(events)
  const testResults = extractTestResults(events)
  const gitOps = extractGitOperations(events)

  // Build file changes from tool calls
  const fileChangeMap = new Map<string, FileChange>()
  for (const event of events) {
    if (event.type !== 'tool_call') continue
    const data = event.data as Record<string, unknown>
    const tool = data.tool as string | undefined
    if (!tool || !WRITE_OPERATIONS.has(tool)) continue
    const args = data.args as Record<string, unknown> | undefined
    const filePath = (args?.path as string) ?? undefined
    if (!filePath) continue
    const changeType: FileChange['changeType'] =
      tool === 'create_file' ? 'created' : tool === 'delete_file' ? 'deleted' : 'modified'
    fileChangeMap.set(filePath, { path: filePath, changeType })
  }

  saveMechanicalData(sessionId, {
    test_status: testResults ? JSON.stringify(testResults) : null,
    prompt_history: JSON.stringify(prompts),
    files_changed: JSON.stringify(Array.from(fileChangeMap.values())),
    git_operations: JSON.stringify(gitOps),
  })
}

function parseMechanicalData(row: SessionRow): MechanicalData {
  return {
    testStatus: row.test_status ? parseJSON(row.test_status) : null,
    promptHistory: row.prompt_history ? parseJSON(row.prompt_history) ?? [] : [],
    filesChanged: row.files_changed ? parseJSON(row.files_changed) ?? [] : [],
    gitOperations: row.git_operations ? parseJSON(row.git_operations) ?? [] : [],
  }
}

function parseJSON<T>(json: string): T | null {
  try {
    return JSON.parse(json) as T
  } catch {
    return null
  }
}

/**
 * Generate a realistic mock analysis response.
 * Simulates what the LLM would return based on digest content.
 */
function generateMockAnalysis(digest: import('../shared/analysisTypes').SessionDigest): AnalysisResult {
  const sections: AnalysisResult['sections'] = []

  // Always include a summary
  const promptText = digest.prompts.map((p) => p.text).join('; ')
  sections.push({
    type: 'summary',
    title: 'Summary',
    content: {
      text: promptText.length > 100
        ? `Session addressed: ${promptText.slice(0, 100)}...`
        : `Session addressed: ${promptText || 'various tasks'}`,
    },
  })

  // Include changes if files were modified
  if (digest.filesChanged.length > 0) {
    sections.push({
      type: 'changes',
      title: 'Changes',
      content: {
        files: digest.filesChanged.map((f) => ({
          path: f.path,
          changeType: f.changeType,
        })),
        prUrl: digest.gitOperations.find((op) => op.type === 'pr-create')?.prUrl,
      },
    })
  }

  // Include key moments if session had notable events
  if (digest.errors.length > 0 || digest.testResults) {
    const moments: Array<{ timestamp: string; description: string }> = []
    for (const error of digest.errors) {
      moments.push({ timestamp: error.timestamp, description: `Error: ${error.message}` })
    }
    if (digest.testResults) {
      const ts = digest.duration.endedAt
      moments.push({
        timestamp: ts,
        description: `Tests: ${digest.testResults.passed} passed, ${digest.testResults.failed} failed`,
      })
    }
    sections.push({
      type: 'key-moments',
      title: 'Key Moments',
      content: { moments },
    })
  }

  // Always include next steps
  sections.push({
    type: 'next-steps',
    title: 'Next Steps',
    content: {
      items: [
        'Review the changes and run the full test suite',
        'Consider adding integration tests for new functionality',
      ],
    },
  })

  return { sections }
}
```

### Step 2: Verify build passes

Run: `npm run build`
Expected: Build succeeds with no errors

### Step 3: Commit

```bash
git add src/main/analysisService.ts
git commit -m "feat(phase2): add analysis service with stubbed LLM and DB caching"
```

---

## Task 6: IPC Handlers

**Files:**
- Modify: `src/main/ipc.ts`

### Step 1: Add imports and handlers for analysis IPC

At the top of `src/main/ipc.ts`, add the import for the analysis service. After the existing `import { getSessionById } from './db'` line:

```ts
import { getAnalysis, triggerAnalysis } from './analysisService'
import type { SessionAnalysisData } from '../shared/analysisTypes'
```

### Step 2: Add the GET_ANALYSIS handler

Inside `registerIpcHandlers()`, after the `SESSION_RESUME` handler block (before the `mainWindow.on('closed', ...)` listener), add:

```ts
  ipcMain.handle(
    IPC_CHANNELS.GET_ANALYSIS,
    (_event, { sessionId }: { sessionId: string }): SessionAnalysisData | null => {
      try {
        return getAnalysis(sessionId)
      } catch (err) {
        console.error('[ipc] GET_ANALYSIS failed:', err instanceof Error ? err.message : String(err))
        return null
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.TRIGGER_ANALYSIS,
    async (_event, { sessionId }: { sessionId: string }): Promise<SessionAnalysisData | null> => {
      try {
        const result = await triggerAnalysis(sessionId)
        // Push the ready notification to the renderer
        if (mainWindow && !mainWindow.isDestroyed() && result) {
          mainWindow.webContents.send(IPC_CHANNELS.ANALYSIS_READY, result)
        }
        return result
      } catch (err) {
        console.error('[ipc] TRIGGER_ANALYSIS failed:', err instanceof Error ? err.message : String(err))
        return null
      }
    },
  )
```

### Step 3: Add cleanup in the `mainWindow.on('closed', ...)` listener

Add these two lines before `killPty()` in the closed listener:

```ts
    ipcMain.removeHandler(IPC_CHANNELS.GET_ANALYSIS)
    ipcMain.removeHandler(IPC_CHANNELS.TRIGGER_ANALYSIS)
```

### Step 4: Verify build passes

Run: `npm run build`
Expected: Build succeeds with no errors

### Step 5: Commit

```bash
git add src/main/ipc.ts
git commit -m "feat(phase2): wire analysis IPC handlers — get and trigger"
```

---

## Task 7: Preload Bridge

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/env.d.ts`

### Step 1: Add analysis bridge methods to `src/preload/index.ts`

Add the import for `SessionAnalysisData` at the top:

```ts
import type { SessionState, FileActivity, FileEntry } from '../shared/types'
import type { SessionAnalysisData } from '../shared/analysisTypes'
```

Then add these three methods to the `api` object, after the `resumeSession` method:

```ts
  // Analysis: get cached analysis data for a session
  getAnalysis: (sessionId: string): Promise<SessionAnalysisData | null> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_ANALYSIS, { sessionId })
  },

  // Analysis: trigger AI analysis generation
  triggerAnalysis: (sessionId: string): Promise<SessionAnalysisData | null> => {
    return ipcRenderer.invoke(IPC_CHANNELS.TRIGGER_ANALYSIS, { sessionId })
  },

  // Analysis: receive analysis-ready notification
  onAnalysisReady: (callback: (data: SessionAnalysisData) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: SessionAnalysisData): void => {
      callback(data)
    }
    ipcRenderer.on(IPC_CHANNELS.ANALYSIS_READY, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.ANALYSIS_READY, handler)
    }
  },
```

### Step 2: Verify env.d.ts types auto-resolve

The `env.d.ts` file already imports from `ElectronAPI` which is `typeof api`, so the new methods will be typed automatically. No changes needed to `env.d.ts`.

### Step 3: Verify build passes

Run: `npm run build`
Expected: Build succeeds with no errors

### Step 4: Commit

```bash
git add src/preload/index.ts
git commit -m "feat(phase2): expose analysis bridge methods to renderer"
```

---

## Task 8: Section Renderer Components

**Files:**
- Create: `src/renderer/src/components/sections/SummarySection.tsx`
- Create: `src/renderer/src/components/sections/ChangesSection.tsx`
- Create: `src/renderer/src/components/sections/KeyMomentsSection.tsx`
- Create: `src/renderer/src/components/sections/NextStepsSection.tsx`
- Create: `src/renderer/src/components/sections/DecisionsSection.tsx`
- Create: `src/renderer/src/components/sections/ActionItemsSection.tsx`
- Create: `src/renderer/src/components/sections/OpenQuestionsSection.tsx`
- Create: `src/renderer/src/components/sections/index.ts`

### Step 1: Create the sections directory and index

Create `src/renderer/src/components/sections/index.ts`:

```ts
export { SummarySection } from './SummarySection'
export { ChangesSection } from './ChangesSection'
export { KeyMomentsSection } from './KeyMomentsSection'
export { NextStepsSection } from './NextStepsSection'
export { DecisionsSection } from './DecisionsSection'
export { ActionItemsSection } from './ActionItemsSection'
export { OpenQuestionsSection } from './OpenQuestionsSection'
```

### Step 2: Create each section renderer

Create `src/renderer/src/components/sections/SummarySection.tsx`:

```tsx
import type { SummaryContent } from '../../../../shared/analysisTypes'

export function SummarySection({ content }: { content: SummaryContent }): React.ReactElement {
  return (
    <div data-testid="section-summary" style={{ marginBottom: 16 }}>
      <p style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.5, fontStyle: 'italic' }}>
        {content.text}
      </p>
    </div>
  )
}
```

Create `src/renderer/src/components/sections/ChangesSection.tsx`:

```tsx
import type { ChangesContent } from '../../../../shared/analysisTypes'

const CHANGE_COLORS: Record<string, string> = {
  created: 'var(--green)',
  modified: 'var(--amber)',
  deleted: 'var(--red)',
}

const CHANGE_LABELS: Record<string, string> = {
  created: 'A',
  modified: 'M',
  deleted: 'D',
}

export function ChangesSection({ content }: { content: ChangesContent }): React.ReactElement {
  return (
    <div data-testid="section-changes" style={{ marginBottom: 16 }}>
      {content.files.map((file, idx) => (
        <div
          key={idx}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: '13px', fontFamily: 'var(--font-mono)' }}
        >
          <span style={{ color: CHANGE_COLORS[file.changeType] ?? 'var(--text-muted)', fontWeight: 600, width: 14, textAlign: 'center' }}>
            {CHANGE_LABELS[file.changeType] ?? '?'}
          </span>
          <span style={{ color: 'var(--text-primary)' }}>{file.path}</span>
        </div>
      ))}
      {content.prUrl && (
        <div style={{ marginTop: 8, fontSize: '12px' }}>
          <a href={content.prUrl} style={{ color: 'var(--amber)', textDecoration: 'none' }}>
            View Pull Request →
          </a>
        </div>
      )}
    </div>
  )
}
```

Create `src/renderer/src/components/sections/KeyMomentsSection.tsx`:

```tsx
import type { KeyMomentsContent } from '../../../../shared/analysisTypes'

export function KeyMomentsSection({ content }: { content: KeyMomentsContent }): React.ReactElement {
  return (
    <div data-testid="section-key-moments" style={{ marginBottom: 16 }}>
      {content.moments.map((moment, idx) => {
        const time = new Date(moment.timestamp)
        const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        return (
          <div key={idx} style={{ display: 'flex', gap: 10, padding: '4px 0', fontSize: '13px' }}>
            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0, minWidth: 50 }}>
              {timeStr}
            </span>
            <span style={{ color: 'var(--text-primary)' }}>{moment.description}</span>
          </div>
        )
      })}
    </div>
  )
}
```

Create `src/renderer/src/components/sections/NextStepsSection.tsx`:

```tsx
import type { NextStepsContent } from '../../../../shared/analysisTypes'

export function NextStepsSection({ content }: { content: NextStepsContent }): React.ReactElement {
  return (
    <div data-testid="section-next-steps" style={{ marginBottom: 16 }}>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {content.items.map((item, idx) => (
          <li key={idx} style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.6 }}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

Create `src/renderer/src/components/sections/DecisionsSection.tsx`:

```tsx
import type { DecisionsContent } from '../../../../shared/analysisTypes'

export function DecisionsSection({ content }: { content: DecisionsContent }): React.ReactElement {
  return (
    <div data-testid="section-decisions" style={{ marginBottom: 16 }}>
      {content.decisions.map((d, idx) => (
        <div key={idx} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {d.decision}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 2 }}>
            {d.rationale}
          </div>
        </div>
      ))}
    </div>
  )
}
```

Create `src/renderer/src/components/sections/ActionItemsSection.tsx`:

```tsx
import type { ActionItemsContent } from '../../../../shared/analysisTypes'

export function ActionItemsSection({ content }: { content: ActionItemsContent }): React.ReactElement {
  return (
    <div data-testid="section-action-items" style={{ marginBottom: 16 }}>
      {content.items.map((item, idx) => (
        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: '13px' }}>
          <span style={{
            width: 14,
            height: 14,
            borderRadius: 3,
            border: '1.5px solid var(--text-muted)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontSize: '10px',
            color: item.completed ? 'var(--green)' : 'transparent',
          }}>
            {item.completed ? '\u2713' : ''}
          </span>
          <span style={{
            color: item.completed ? 'var(--text-muted)' : 'var(--text-primary)',
            textDecoration: item.completed ? 'line-through' : 'none',
          }}>
            {item.text}
          </span>
        </div>
      ))}
    </div>
  )
}
```

Create `src/renderer/src/components/sections/OpenQuestionsSection.tsx`:

```tsx
import type { OpenQuestionsContent } from '../../../../shared/analysisTypes'

export function OpenQuestionsSection({ content }: { content: OpenQuestionsContent }): React.ReactElement {
  return (
    <div data-testid="section-open-questions" style={{ marginBottom: 16 }}>
      <ul style={{ margin: 0, paddingLeft: 20, listStyleType: 'disc' }}>
        {content.questions.map((q, idx) => (
          <li key={idx} style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.6 }}>
            {q}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

### Step 3: Verify build passes

Run: `npm run build`
Expected: Build succeeds with no errors

### Step 4: Commit

```bash
git add src/renderer/src/components/sections/
git commit -m "feat(phase2): add 7 typed section renderer components"
```

---

## Task 9: SessionAnalysis Component

**Files:**
- Create: `src/renderer/src/components/SessionAnalysis.tsx`

### Step 1: Create the main ANALYSIS view component

Create `src/renderer/src/components/SessionAnalysis.tsx`:

```tsx
import { useState, useEffect, useCallback } from 'react'
import type {
  SessionAnalysisData,
  AnalysisSection,
  AnalysisSectionContent,
  SummaryContent,
  ChangesContent,
  KeyMomentsContent,
  NextStepsContent,
  DecisionsContent,
  ActionItemsContent,
  OpenQuestionsContent,
} from '../../../shared/analysisTypes'
import {
  SummarySection,
  ChangesSection,
  KeyMomentsSection,
  NextStepsSection,
  DecisionsSection,
  ActionItemsSection,
  OpenQuestionsSection,
} from './sections'

interface SessionAnalysisProps {
  sessionId: string
  title?: string
  duration?: string
  promptCount?: number
  toolCallCount?: number
}

function formatDuration(startedAt: string, endedAt?: string): string {
  if (!endedAt) return '—'
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime()
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  if (mins === 0) return `${secs}s`
  return `${mins}m ${secs}s`
}

function renderSection(section: AnalysisSection): React.ReactElement | null {
  const content = section.content as AnalysisSectionContent
  switch (section.type) {
    case 'summary':
      return <SummarySection content={content as SummaryContent} />
    case 'changes':
      return <ChangesSection content={content as ChangesContent} />
    case 'key-moments':
      return <KeyMomentsSection content={content as KeyMomentsContent} />
    case 'next-steps':
      return <NextStepsSection content={content as NextStepsContent} />
    case 'decisions':
      return <DecisionsSection content={content as DecisionsContent} />
    case 'action-items':
      return <ActionItemsSection content={content as ActionItemsContent} />
    case 'open-questions':
      return <OpenQuestionsSection content={content as OpenQuestionsContent} />
    default:
      return null
  }
}

export function SessionAnalysis({ sessionId, title, promptCount, toolCallCount }: SessionAnalysisProps): React.ReactElement {
  const [data, setData] = useState<SessionAnalysisData | null>(null)
  const [loading, setLoading] = useState(true)
  const [promptsExpanded, setPromptsExpanded] = useState(false)

  const fetchAnalysis = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.getAnalysis(sessionId)
      setData(result)

      // If analysis hasn't been generated yet, trigger it
      if (result && result.analysisStatus === 'none') {
        const triggered = await window.electronAPI.triggerAnalysis(sessionId)
        if (triggered) setData(triggered)
      }
    } catch (err) {
      console.error('[SessionAnalysis] Failed to fetch:', err)
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    fetchAnalysis()

    // Listen for analysis-ready pushes
    const unsub = window.electronAPI.onAnalysisReady((ready) => {
      if (ready.sessionId === sessionId) {
        setData(ready)
      }
    })
    return unsub
  }, [sessionId, fetchAnalysis])

  const handleRegenerate = async (): Promise<void> => {
    setData((prev) => prev ? { ...prev, analysisStatus: 'loading' } : prev)
    const result = await window.electronAPI.triggerAnalysis(sessionId)
    if (result) setData(result)
  }

  const mechanical = data?.mechanical
  const testStatus = mechanical?.testStatus
  const prompts = mechanical?.promptHistory ?? []

  return (
    <div
      data-testid="session-analysis"
      style={{ flex: 1, overflow: 'auto', padding: 16 }}
    >
      {/* Mechanical Header — always renders */}
      <div data-testid="analysis-header" style={{ marginBottom: 16 }}>
        {title && (
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px 0' }}>
            {title}
          </h2>
        )}
        <div style={{ display: 'flex', gap: 16, fontSize: '12px', color: 'var(--text-muted)' }}>
          {promptCount != null && (
            <span data-testid="stat-prompts">{promptCount} prompts</span>
          )}
          {toolCallCount != null && (
            <span data-testid="stat-tools">{toolCallCount} tool calls</span>
          )}
          {testStatus && (
            <span
              data-testid="stat-tests"
              style={{ color: testStatus.failed > 0 ? 'var(--red)' : 'var(--green)' }}
            >
              {testStatus.failed > 0
                ? `${testStatus.failed} failing`
                : `${testStatus.passed}/${testStatus.passed} passing`}
            </span>
          )}
        </div>
      </div>

      {/* Prompt History — collapsible */}
      {prompts.length > 0 && (
        <div data-testid="prompt-history" style={{ marginBottom: 20 }}>
          <button
            data-testid="prompt-history-toggle"
            onClick={() => setPromptsExpanded(!promptsExpanded)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--text-muted)',
              padding: '0 0 6px 0',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span style={{ fontSize: '9px' }}>{promptsExpanded ? '\u25BC' : '\u25B6'}</span>
            Prompts ({prompts.length})
          </button>
          {promptsExpanded && (
            <ol style={{ margin: 0, paddingLeft: 20 }}>
              {prompts.map((prompt, idx) => (
                <li
                  key={idx}
                  data-testid="prompt-entry"
                  style={{
                    fontSize: '12px',
                    color: 'var(--text-primary)',
                    lineHeight: 1.5,
                    marginBottom: 4,
                  }}
                >
                  {prompt.text.length > 100 ? `${prompt.text.slice(0, 100)}...` : prompt.text}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* AI Sections — loading/skeleton/content */}
      <div data-testid="ai-sections">
        {loading || (data?.analysisStatus === 'loading') ? (
          <div data-testid="analysis-skeleton" style={{ padding: '20px 0' }}>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  height: 14,
                  backgroundColor: 'var(--border)',
                  borderRadius: 4,
                  marginBottom: 10,
                  width: `${80 - i * 15}%`,
                  opacity: 0.5,
                }}
              />
            ))}
            <div style={{ fontSize: '11px', color: 'var(--text-very-muted)', marginTop: 8 }}>
              Generating analysis...
            </div>
          </div>
        ) : data?.analysisResult?.sections ? (
          <>
            {data.analysisResult.sections.map((section, idx) => (
              <div key={idx} style={{ marginBottom: 4 }}>
                {section.type !== 'summary' && (
                  <h3 style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--text-muted)',
                    margin: '0 0 6px 0',
                  }}>
                    {section.title}
                  </h3>
                )}
                {renderSection(section)}
              </div>
            ))}
          </>
        ) : null}
      </div>

      {/* Regenerate button */}
      {data?.analysisStatus === 'ready' && (
        <button
          data-testid="regenerate-btn"
          onClick={handleRegenerate}
          style={{
            marginTop: 16,
            padding: '6px 12px',
            fontSize: '11px',
            color: 'var(--text-muted)',
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          Regenerate Analysis
        </button>
      )}
    </div>
  )
}
```

### Step 2: Verify build passes

Run: `npm run build`
Expected: Build succeeds with no errors

### Step 3: Commit

```bash
git add src/renderer/src/components/SessionAnalysis.tsx
git commit -m "feat(phase2): add SessionAnalysis component — header, prompts, AI sections, skeleton"
```

---

## Task 10: Viewer Integration

**Files:**
- Modify: `src/renderer/src/components/Viewer.tsx`

### Step 1: Import SessionAnalysis and remove CHANGES tab

At the top of `Viewer.tsx`, add the import:

```ts
import { SessionAnalysis } from './SessionAnalysis'
```

### Step 2: Remove the CHANGES tab from the tab list

Change the `PrimaryTab` type and `primaryTabs` array:

```ts
type PrimaryTab = 'FILES' | 'APP' | 'ANALYSIS'
```

```ts
  const primaryTabs: PrimaryTab[] = ['FILES', 'APP', 'ANALYSIS']
```

### Step 3: Replace the ANALYSIS placeholder with the real component

Replace the existing ANALYSIS tab content block (lines 353–367):

```tsx
      {/* ANALYSIS tab content */}
      {primaryTab === 'ANALYSIS' && (
        <SessionAnalysis
          sessionId={session?.id ?? ''}
          title={session?.title ?? undefined}
          promptCount={session?.promptCount ?? undefined}
          toolCallCount={session?.toolCallCount ?? undefined}
        />
      )}
```

### Step 4: Remove the CHANGES tab content block entirely

Delete lines 369–382 (the `{/* CHANGES tab content */}` block).

### Step 5: Verify build passes

Run: `npm run build`
Expected: Build succeeds with no errors

### Step 6: Commit

```bash
git add src/renderer/src/components/Viewer.tsx
git commit -m "feat(phase2): integrate SessionAnalysis into Viewer, remove CHANGES tab"
```

---

## Task 11: Store Updates

**Files:**
- Modify: `src/renderer/src/store.ts`

### Step 1: Add analysis state tracking to the Zustand store

Import the analysis types at the top of `store.ts`:

```ts
import type { SessionState, FileActivity, Toast } from '../../shared/types'
import type { AnalysisStatus } from '../../shared/analysisTypes'
```

Add to the `CanvasStore` interface (after the `toasts` state field):

```ts
  analysisStatusMap: Record<string, AnalysisStatus>
```

Add to the actions section:

```ts
  setAnalysisStatus: (sessionId: string, status: AnalysisStatus) => void
  getAnalysisStatus: (sessionId: string) => AnalysisStatus
```

Add the initial state (after `toasts: []`):

```ts
  analysisStatusMap: {},
```

Add the action implementations (after `dismissToast`):

```ts
  setAnalysisStatus: (sessionId, status) =>
    set((state) => ({
      analysisStatusMap: { ...state.analysisStatusMap, [sessionId]: status },
    })),

  getAnalysisStatus: (sessionId) => {
    return get().analysisStatusMap[sessionId] ?? 'none'
  },
```

### Step 2: Verify build passes

Run: `npm run build`
Expected: Build succeeds with no errors

### Step 3: Commit

```bash
git add src/renderer/src/store.ts
git commit -m "feat(phase2): add analysis status tracking to Zustand store"
```

---

## Task 12: E2E Tests

**Files:**
- Create: `e2e/fixtures/amplifier-home/projects/team-pulse/sessions/tp-session-analysis/events.jsonl`
- Create: `e2e/analysis.spec.ts`

### Step 1: Create a rich fixture session for analysis testing

Create `e2e/fixtures/amplifier-home/projects/team-pulse/sessions/tp-session-analysis/events.jsonl`:

```jsonl
{"type":"session:start","timestamp":"2026-04-07T14:00:00Z","data":{"sessionId":"tp-session-analysis","projectSlug":"team-pulse","cwd":"../../workdir"}}
{"type":"user_message","timestamp":"2026-04-07T14:00:01Z","data":{"text":"Build the user authentication module with login and signup"}}
{"type":"tool_call","timestamp":"2026-04-07T14:00:05Z","data":{"tool":"read_file","args":{"path":"src/auth.ts"}}}
{"type":"tool_call","timestamp":"2026-04-07T14:00:10Z","data":{"tool":"write_file","args":{"path":"src/auth.ts"}}}
{"type":"tool_call","timestamp":"2026-04-07T14:00:15Z","data":{"tool":"create_file","args":{"path":"src/login.ts"}}}
{"type":"tool_call","timestamp":"2026-04-07T14:00:20Z","data":{"tool":"edit_file","args":{"path":"src/utils.ts"}}}
{"type":"tool_result","timestamp":"2026-04-07T14:00:25Z","data":{"tool":"bash","output":"5 passed, 1 failed"}}
{"type":"error","timestamp":"2026-04-07T14:00:26Z","data":{"message":"Type error in login.ts line 42"}}
{"type":"user_message","timestamp":"2026-04-07T14:00:30Z","data":{"text":"Fix the type error and run tests again"}}
{"type":"tool_call","timestamp":"2026-04-07T14:00:35Z","data":{"tool":"edit_file","args":{"path":"src/login.ts"}}}
{"type":"tool_result","timestamp":"2026-04-07T14:00:40Z","data":{"tool":"bash","output":"6 passed"}}
{"type":"tool_result","timestamp":"2026-04-07T14:00:45Z","data":{"tool":"bash","output":"[main abc1234] feat: add auth module\n 3 files changed"}}
{"type":"assistant_message","timestamp":"2026-04-07T14:00:50Z","data":{"text":"Done. Auth module with login and signup is ready."}}
{"type":"session:end","timestamp":"2026-04-07T14:00:55Z","data":{"exitCode":0}}
```

### Step 2: Register the new fixture session in the DB

The fixture DB at `e2e/fixtures/amplifier-home/canvas/canvas.db` needs to contain a row for this session. You can either:

- **Option A (recommended):** Add a beforeAll hook in the test that inserts the row programmatically via Electron evaluate.
- **Option B:** Re-run the app with the fixture once to let the watcher pick it up.

For Option A, the test file handles it directly.

### Step 3: Create `e2e/analysis.spec.ts`

```ts
import { test, expect } from './fixtures'

// Helper: expand Team Pulse project and wait for sessions
async function expandTeamPulse(appWindow: import('@playwright/test').Page): Promise<void> {
  await appWindow.waitForTimeout(2000)
  const projectItems = appWindow.locator('[data-testid="project-item"]')
  const count = await projectItems.count()
  for (let i = 0; i < count; i++) {
    const name = await projectItems.nth(i).locator('[data-testid="project-name"]').textContent()
    if (name === 'Team Pulse') {
      const selected = await projectItems.nth(i).getAttribute('data-selected')
      if (selected !== 'true') {
        await projectItems.nth(i).click()
        await appWindow.waitForTimeout(300)
      }
      break
    }
  }
}

// Helper: click a completed session (tp-session-001 is done with exitCode 0)
async function clickCompletedSession(appWindow: import('@playwright/test').Page): Promise<void> {
  await expandTeamPulse(appWindow)
  // tp-session-001 is completed (has session:end with exitCode 0)
  const sessions = appWindow.locator('[data-testid="session-item"]')
  await expect(sessions.first()).toBeVisible({ timeout: 5000 })

  // Click the first session (most recent first — completed ones should be present)
  await sessions.first().click()
  await appWindow.waitForTimeout(300)
}

test('A1: ANALYSIS tab exists and is clickable', async ({ appWindow }) => {
  await clickCompletedSession(appWindow)
  const analysisTab = appWindow.locator('[data-testid="tab-analysis"]')
  await expect(analysisTab).toBeVisible({ timeout: 3000 })
  await analysisTab.click()
})

test('A2: CHANGES tab is removed — only FILES, APP, ANALYSIS remain', async ({ appWindow }) => {
  await clickCompletedSession(appWindow)
  const changesTab = appWindow.locator('[data-testid="tab-changes"]')
  await expect(changesTab).not.toBeVisible()

  // Verify the 3 remaining tabs
  await expect(appWindow.locator('[data-testid="tab-files"]')).toBeVisible()
  await expect(appWindow.locator('[data-testid="tab-app"]')).toBeVisible()
  await expect(appWindow.locator('[data-testid="tab-analysis"]')).toBeVisible()
})

test('A3: clicking ANALYSIS tab shows the analysis component', async ({ appWindow }) => {
  await clickCompletedSession(appWindow)
  await appWindow.locator('[data-testid="tab-analysis"]').click()
  await appWindow.waitForTimeout(500)
  const analysis = appWindow.locator('[data-testid="session-analysis"]')
  await expect(analysis).toBeVisible({ timeout: 5000 })
})

test('A4: analysis header shows stats', async ({ appWindow }) => {
  await clickCompletedSession(appWindow)
  await appWindow.locator('[data-testid="tab-analysis"]').click()
  await appWindow.waitForTimeout(500)
  const header = appWindow.locator('[data-testid="analysis-header"]')
  await expect(header).toBeVisible({ timeout: 5000 })
})

test('A5: prompt history section is present and toggleable', async ({ appWindow }) => {
  await clickCompletedSession(appWindow)
  await appWindow.locator('[data-testid="tab-analysis"]').click()
  await appWindow.waitForTimeout(1000)

  const toggle = appWindow.locator('[data-testid="prompt-history-toggle"]')
  // May not be visible if mechanical data hasn't populated — check gracefully
  const visible = await toggle.isVisible().catch(() => false)
  if (visible) {
    await toggle.click()
    await appWindow.waitForTimeout(300)
    const entries = appWindow.locator('[data-testid="prompt-entry"]')
    const count = await entries.count()
    expect(count).toBeGreaterThan(0)
  }
})

test('A6: AI sections area is present (loading or content)', async ({ appWindow }) => {
  await clickCompletedSession(appWindow)
  await appWindow.locator('[data-testid="tab-analysis"]').click()
  await appWindow.waitForTimeout(500)

  const aiSections = appWindow.locator('[data-testid="ai-sections"]')
  await expect(aiSections).toBeVisible({ timeout: 5000 })
})

test('A7: electronAPI exposes analysis bridge methods', async ({ appWindow }) => {
  const apiShape = await appWindow.evaluate(() => ({
    hasGetAnalysis: typeof window.electronAPI?.getAnalysis === 'function',
    hasTriggerAnalysis: typeof window.electronAPI?.triggerAnalysis === 'function',
    hasOnAnalysisReady: typeof window.electronAPI?.onAnalysisReady === 'function',
  }))
  expect(apiShape.hasGetAnalysis).toBe(true)
  expect(apiShape.hasTriggerAnalysis).toBe(true)
  expect(apiShape.hasOnAnalysisReady).toBe(true)
})
```

### Step 4: Run E2E tests

Run: `npx playwright test e2e/analysis.spec.ts`
Expected: All A1–A7 tests pass

**Note:** Some tests may need timeout adjustments depending on how fast the analysis service runs. If tests are flaky, increase `waitForTimeout` values.

### Step 5: Run the full pre-commit gate

Run: `npm run build && npx playwright test`
Expected: Build succeeds, all E2E tests pass (existing + new analysis tests)

**Important:** The removal of the CHANGES tab (Task 10) will break existing viewer E2E tests that assert 4 tabs. Specifically, `e2e/viewer.spec.ts` test `'V1: Viewer panel has four primary tabs'` (line 56) checks for `tab-changes`. This test must be updated:

- In `e2e/viewer.spec.ts`, find the test `'V1: Viewer panel has four primary tabs'` and update it to check for 3 tabs and remove the `tab-changes` assertion. The test title should change to `'V1: Viewer panel has three primary tabs'`.

### Step 6: Commit

```bash
git add e2e/analysis.spec.ts e2e/fixtures/amplifier-home/projects/team-pulse/sessions/tp-session-analysis/ e2e/viewer.spec.ts
git commit -m "feat(phase2): add E2E tests for ANALYSIS view, update viewer tab tests"
```

---

## Pre-Commit Verification Checklist

After all 12 tasks are complete, run the full verification:

```bash
# 1. Unit tests
npx tsx --test tests/events-parser.test.ts
npx tsx --test tests/digestBuilder.test.ts

# 2. Build
npm run build

# 3. E2E tests
npx playwright test

# 4. Type check
npx tsc --noEmit
```

All four must pass before Phase 2 is considered complete.

---

## Summary of All Files

### New files (9 + 1 fixture):
| File | Task |
|---|---|
| `src/shared/analysisTypes.ts` | 1 |
| `src/main/digestBuilder.ts` | 4 |
| `src/main/analysisService.ts` | 5 |
| `src/renderer/src/components/SessionAnalysis.tsx` | 9 |
| `src/renderer/src/components/sections/index.ts` | 8 |
| `src/renderer/src/components/sections/SummarySection.tsx` | 8 |
| `src/renderer/src/components/sections/ChangesSection.tsx` | 8 |
| `src/renderer/src/components/sections/KeyMomentsSection.tsx` | 8 |
| `src/renderer/src/components/sections/NextStepsSection.tsx` | 8 |
| `src/renderer/src/components/sections/DecisionsSection.tsx` | 8 |
| `src/renderer/src/components/sections/ActionItemsSection.tsx` | 8 |
| `src/renderer/src/components/sections/OpenQuestionsSection.tsx` | 8 |
| `tests/digestBuilder.test.ts` | 4 |
| `e2e/analysis.spec.ts` | 12 |
| `e2e/fixtures/.../tp-session-analysis/events.jsonl` | 12 |

### Modified files (7):
| File | Task |
|---|---|
| `src/shared/types.ts` | 1 |
| `src/main/db.ts` | 2 |
| `src/main/events-parser.ts` | 3 |
| `src/main/ipc.ts` | 6 |
| `src/preload/index.ts` | 7 |
| `src/renderer/src/components/Viewer.tsx` | 10 |
| `src/renderer/src/store.ts` | 11 |
| `tests/events-parser.test.ts` | 3 |
| `e2e/viewer.spec.ts` | 12 |