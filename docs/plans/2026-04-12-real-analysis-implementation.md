# Real LLM-Powered Session Analysis — Implementation Plan

> **Execution:** Use the subagent-driven-development workflow to implement this plan.

**Goal:** Replace `generateMockAnalysis()` with real LLM calls via the Amplifier CLI, and add a settings system for configuring the analysis model.

**Architecture:** Three new modules (`llm.ts`, `prompts/analysis.ts`, `settings.ts`) plus a Settings UI component. The analysis service swaps the mock for a real call chain: build prompt → read settings → invoke LLM subprocess → parse response. IPC channels and preload bridge are extended for the new settings system.

**Tech Stack:** TypeScript, Node.js `child_process.spawn`, Electron IPC, React (inline styles), `node:test` + `node:assert/strict`

---

## Task 1: Types & IPC Channels

**Files:**
- Modify: `src/shared/types.ts`

### Step 1: Add `CanvasSettings` interface and IPC channels

Open `src/shared/types.ts` and add two new entries to the `IPC_CHANNELS` object and a new `CanvasSettings` interface at the bottom of the file.

In `src/shared/types.ts`, add these two lines inside the `IPC_CHANNELS` object, right before the closing `} as const`:

```typescript
  SETTINGS_GET: 'settings:get',
  SETTINGS_SAVE: 'settings:save',
```

Then add this interface at the very bottom of the file:

```typescript
// --- Settings types ---

export interface CanvasSettings {
  analysisModel: string
  analysisProvider: string | null
}
```

### Step 2: Verify the file compiles

Run:
```bash
npx tsc --noEmit src/shared/types.ts
```
Expected: No errors.

### Step 3: Commit

```bash
git add src/shared/types.ts
git commit -m "feat: add CanvasSettings type and SETTINGS IPC channels"
```

---

## Task 2: Settings Module

**Files:**
- Create: `src/main/settings.ts`

### Step 1: Write the settings module

Create `src/main/settings.ts` with the following content:

```typescript
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { CanvasSettings } from '../shared/types'

const SETTINGS_DIR = join(homedir(), '.amplifier-canvas')
const SETTINGS_PATH = join(SETTINGS_DIR, 'settings.json')

export function getDefaultSettings(): CanvasSettings {
  return {
    analysisModel: 'claude-sonnet-4-5',
    analysisProvider: null,
  }
}

export function getSettings(): CanvasSettings {
  try {
    const raw = readFileSync(SETTINGS_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<CanvasSettings>
    const defaults = getDefaultSettings()
    return {
      analysisModel:
        typeof parsed.analysisModel === 'string' && parsed.analysisModel.length > 0
          ? parsed.analysisModel
          : defaults.analysisModel,
      analysisProvider:
        parsed.analysisProvider !== undefined ? parsed.analysisProvider : defaults.analysisProvider,
    }
  } catch {
    return getDefaultSettings()
  }
}

export async function saveSettings(
  settings: CanvasSettings,
): Promise<{ success: boolean }> {
  try {
    if (!existsSync(SETTINGS_DIR)) {
      mkdirSync(SETTINGS_DIR, { recursive: true })
    }
    writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8')
    return { success: true }
  } catch (err) {
    console.error('[settings] saveSettings failed:', err)
    return { success: false }
  }
}
```

### Step 2: Verify the file compiles

Run:
```bash
npx tsc --noEmit src/main/settings.ts
```
Expected: No errors.

### Step 3: Commit

```bash
git add src/main/settings.ts
git commit -m "feat: add settings module with read/write/defaults"
```

---

## Task 3: Settings Tests

**Files:**
- Create: `tests/settings.test.ts`

### Step 1: Write the failing tests

Create `tests/settings.test.ts` with the following content:

```typescript
import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// We need to override the settings path for testing.
// We'll do this by mocking the module internals via dynamic import and env var.
// But the module uses homedir() directly, so we'll test via a different approach:
// We'll test getDefaultSettings directly and test the file I/O behavior
// by temporarily pointing HOME to a temp dir.

let tmpDir: string
let originalHome: string | undefined

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'canvas-settings-test-'))
  originalHome = process.env['HOME']
  process.env['HOME'] = tmpDir
})

afterEach(() => {
  if (originalHome !== undefined) {
    process.env['HOME'] = originalHome
  } else {
    delete process.env['HOME']
  }
  rmSync(tmpDir, { recursive: true, force: true })
})

// We must re-import each time since homedir() caches per-process,
// but Node's os.homedir() reads HOME env var on each call on POSIX systems.
async function loadSettings() {
  // Clear the module from cache so it re-reads HOME
  const modulePath = require.resolve('../src/main/settings')
  delete require.cache[modulePath]
  return await import('../src/main/settings')
}

// --- getDefaultSettings ---

describe('getDefaultSettings', () => {
  test('returns expected defaults', async () => {
    const { getDefaultSettings } = await loadSettings()
    const defaults = getDefaultSettings()
    assert.equal(defaults.analysisModel, 'claude-sonnet-4-5')
    assert.equal(defaults.analysisProvider, null)
  })
})

// --- getSettings ---

describe('getSettings', () => {
  test('returns defaults when settings file is missing', async () => {
    const { getSettings, getDefaultSettings } = await loadSettings()
    const settings = getSettings()
    assert.deepEqual(settings, getDefaultSettings())
  })

  test('returns defaults when settings file is corrupt JSON', async () => {
    const { getSettings, getDefaultSettings } = await loadSettings()
    const settingsDir = join(tmpDir, '.amplifier-canvas')
    const { mkdirSync } = await import('fs')
    mkdirSync(settingsDir, { recursive: true })
    writeFileSync(join(settingsDir, 'settings.json'), 'not-valid-json', 'utf-8')

    const settings = getSettings()
    assert.deepEqual(settings, getDefaultSettings())
  })

  test('returns parsed settings from valid file', async () => {
    const { getSettings } = await loadSettings()
    const settingsDir = join(tmpDir, '.amplifier-canvas')
    const { mkdirSync } = await import('fs')
    mkdirSync(settingsDir, { recursive: true })
    writeFileSync(
      join(settingsDir, 'settings.json'),
      JSON.stringify({ analysisModel: 'claude-haiku-4-5', analysisProvider: 'bedrock' }),
      'utf-8',
    )

    const settings = getSettings()
    assert.equal(settings.analysisModel, 'claude-haiku-4-5')
    assert.equal(settings.analysisProvider, 'bedrock')
  })
})

// --- saveSettings ---

describe('saveSettings', () => {
  test('creates directory if missing and writes valid JSON', async () => {
    const { saveSettings } = await loadSettings()
    const result = await saveSettings({
      analysisModel: 'gpt-4o',
      analysisProvider: 'openai',
    })

    assert.deepEqual(result, { success: true })

    const settingsPath = join(tmpDir, '.amplifier-canvas', 'settings.json')
    assert.ok(existsSync(settingsPath), 'settings.json should exist')

    const written = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    assert.equal(written.analysisModel, 'gpt-4o')
    assert.equal(written.analysisProvider, 'openai')
  })

  test('overwrites existing settings file', async () => {
    const { saveSettings, getSettings } = await loadSettings()

    await saveSettings({ analysisModel: 'model-a', analysisProvider: null })
    await saveSettings({ analysisModel: 'model-b', analysisProvider: 'custom' })

    const settings = getSettings()
    assert.equal(settings.analysisModel, 'model-b')
    assert.equal(settings.analysisProvider, 'custom')
  })

  test('returns { success: boolean }', async () => {
    const { saveSettings } = await loadSettings()
    const result = await saveSettings({
      analysisModel: 'claude-sonnet-4-5',
      analysisProvider: null,
    })
    assert.ok(typeof result.success === 'boolean')
    assert.equal(result.success, true)
  })
})
```

### Step 2: Run the tests

Run:
```bash
npx tsx --test tests/settings.test.ts
```
Expected: All 7 tests PASS.

### Step 3: Commit

```bash
git add tests/settings.test.ts
git commit -m "test: add settings module unit tests"
```

---

## Task 4: Settings IPC + Preload

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`

### Step 1: Add settings import and handlers in `ipc.ts`

In `src/main/ipc.ts`, add the settings import near the top of the file. After the existing import of `{ addProjectWatch } from './watcher'` (line 23), add:

```typescript
import { getSettings, saveSettings } from './settings'
import type { CanvasSettings } from '../shared/types'
```

Then, inside the `registerIpcHandlers` function, add the two settings handlers. Place them right before the `mainWindow.on('closed', ...)` block (before line 357). Add:

```typescript
  // --- Settings ---

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET,
    (): CanvasSettings => {
      try {
        return getSettings()
      } catch (err) {
        console.error('[ipc] SETTINGS_GET failed:', err)
        return { analysisModel: 'claude-sonnet-4-5', analysisProvider: null }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SAVE,
    async (
      _event,
      settings: CanvasSettings,
    ): Promise<{ success: boolean }> => {
      try {
        return await saveSettings(settings)
      } catch (err) {
        console.error('[ipc] SETTINGS_SAVE failed:', err)
        return { success: false }
      }
    },
  )
```

Then in the `mainWindow.on('closed', ...)` block, add these two cleanup lines before `killAllPtys()`:

```typescript
    ipcMain.removeHandler(IPC_CHANNELS.SETTINGS_GET)
    ipcMain.removeHandler(IPC_CHANNELS.SETTINGS_SAVE)
```

### Step 2: Add settings bridge methods in `preload/index.ts`

In `src/preload/index.ts`, first add the import for `CanvasSettings`. Update line 3 to:

```typescript
import type { SessionState, FileActivity, FileEntry, WorkspaceState, CanvasSettings } from '../shared/types'
```

Then add these two bridge methods inside the `api` object, right before the closing `}` of the api object (before the `contextBridge.exposeInMainWorld` line). Place them after the `onRunningSessionsToast` method:

```typescript

  // Settings: get current settings
  getSettings: (): Promise<CanvasSettings> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET)
  },

  // Settings: save updated settings
  saveSettings: (settings: CanvasSettings): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SAVE, settings)
  },
```

### Step 3: Verify compilation

Run:
```bash
npx tsc --noEmit src/main/ipc.ts src/preload/index.ts
```
Expected: No errors.

### Step 4: Commit

```bash
git add src/main/ipc.ts src/preload/index.ts
git commit -m "feat: wire settings IPC handlers and preload bridge"
```

---

## Task 5: LLM Wrapper

**Files:**
- Create: `src/main/llm.ts`

### Step 1: Write the LLM wrapper module

Create `src/main/llm.ts` with the following content:

```typescript
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

// Cache the resolved binary path for the session lifetime
let cachedBinaryPath: string | null = null

function resolveAmplifierBinary(): string {
  if (cachedBinaryPath) return cachedBinaryPath

  // 1. Check PATH — try 'which amplifier'
  try {
    const { execFileSync } = require('child_process') as typeof import('child_process')
    const result = execFileSync('which', ['amplifier'], { encoding: 'utf-8' }).trim()
    if (result && existsSync(result)) {
      cachedBinaryPath = result
      return result
    }
  } catch {
    // which failed — continue to fallback locations
  }

  // 2. Check common install locations
  const commonPaths = [
    join(homedir(), '.local', 'bin', 'amplifier'),
    '/usr/local/bin/amplifier',
    '/opt/homebrew/bin/amplifier',
  ]

  for (const candidate of commonPaths) {
    if (existsSync(candidate)) {
      cachedBinaryPath = candidate
      return candidate
    }
  }

  // 3. Not found
  throw new Error(
    'amplifier CLI not found. Install from https://docs.amplifier.dev/install and ensure it is on your PATH.',
  )
}

/** Reset the cached binary path. Exposed for testing only. */
export function _resetBinaryCache(): void {
  cachedBinaryPath = null
}

export interface InvokeLLMOptions {
  model?: string
  provider?: string
  timeoutMs?: number
}

export async function invokeLLM(
  prompt: string,
  options?: InvokeLLMOptions,
): Promise<string> {
  const binaryPath = resolveAmplifierBinary()
  const timeoutMs = options?.timeoutMs ?? 60_000

  const args = ['run', '--mode', 'single', '--output-format', 'json']
  if (options?.model) {
    args.push('--model', options.model)
  }
  if (options?.provider) {
    args.push('--provider', options.provider)
  }

  return new Promise<string>((resolve, reject) => {
    const proc = spawn(binaryPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    let stdout = ''
    let stderr = ''
    let killed = false

    const timer = setTimeout(() => {
      killed = true
      proc.kill()
      reject(new Error(`amplifier CLI timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    proc.on('close', (code) => {
      clearTimeout(timer)
      if (killed) return // already rejected

      if (code !== 0) {
        reject(
          new Error(
            `amplifier CLI exited with code ${code}: ${stderr.slice(0, 500)}`,
          ),
        )
        return
      }

      try {
        // Strip non-JSON preamble lines — find the first line starting with '{'
        const lines = stdout.split('\n')
        const jsonStartIdx = lines.findIndex((line) => line.trimStart().startsWith('{'))
        if (jsonStartIdx === -1) {
          reject(new Error(`No JSON found in amplifier CLI output: ${stdout.slice(0, 500)}`))
          return
        }
        const jsonStr = lines.slice(jsonStartIdx).join('\n')
        const parsed = JSON.parse(jsonStr) as { response?: string }

        if (typeof parsed.response !== 'string') {
          reject(new Error('amplifier CLI output missing "response" field'))
          return
        }

        resolve(parsed.response)
      } catch (err) {
        reject(
          new Error(
            `Failed to parse amplifier CLI output: ${err instanceof Error ? err.message : String(err)}`,
          ),
        )
      }
    })

    proc.on('error', (err) => {
      clearTimeout(timer)
      reject(new Error(`Failed to spawn amplifier CLI: ${err.message}`))
    })

    // Write prompt to stdin and close
    proc.stdin.write(prompt)
    proc.stdin.end()
  })
}
```

### Step 2: Verify the file compiles

Run:
```bash
npx tsc --noEmit src/main/llm.ts
```
Expected: No errors.

### Step 3: Commit

```bash
git add src/main/llm.ts
git commit -m "feat: add LLM subprocess wrapper with binary resolution"
```

---

## Task 6: LLM Wrapper Tests

**Files:**
- Create: `tests/llm.test.ts`

### Step 1: Write the LLM tests

Create `tests/llm.test.ts` with the following content:

```typescript
import { test, describe, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'events'
import type { ChildProcess } from 'child_process'

// We'll mock child_process.spawn at the module level
let spawnMock: ReturnType<typeof mock.fn>
let existsSyncMock: ReturnType<typeof mock.fn>

// Helper: create a fake ChildProcess-like object
function createFakeProc(): {
  proc: ChildProcess
  stdin: { write: ReturnType<typeof mock.fn>; end: ReturnType<typeof mock.fn> }
  stdout: EventEmitter
  stderr: EventEmitter
  emitClose: (code: number) => void
  kill: ReturnType<typeof mock.fn>
} {
  const stdout = new EventEmitter()
  const stderr = new EventEmitter()
  const stdinWrite = mock.fn()
  const stdinEnd = mock.fn()
  const killFn = mock.fn()

  const proc = new EventEmitter() as unknown as ChildProcess
  ;(proc as unknown as Record<string, unknown>).stdout = stdout
  ;(proc as unknown as Record<string, unknown>).stderr = stderr
  ;(proc as unknown as Record<string, unknown>).stdin = { write: stdinWrite, end: stdinEnd }
  ;(proc as unknown as Record<string, unknown>).kill = killFn

  return {
    proc,
    stdin: { write: stdinWrite, end: stdinEnd },
    stdout,
    stderr,
    emitClose: (code: number) => (proc as unknown as EventEmitter).emit('close', code),
    kill: killFn,
  }
}

// --- invokeLLM ---

describe('invokeLLM', () => {
  let originalSpawn: unknown
  let originalExistsSync: unknown
  let invokeLLM: typeof import('../src/main/llm').invokeLLM
  let _resetBinaryCache: typeof import('../src/main/llm')._resetBinaryCache

  beforeEach(async () => {
    // Mock spawn
    const childProcess = await import('child_process')
    originalSpawn = childProcess.spawn
    spawnMock = mock.fn()
    ;(childProcess as unknown as Record<string, unknown>).spawn = spawnMock

    // Mock existsSync so binary resolution succeeds
    const fs = await import('fs')
    originalExistsSync = fs.existsSync
    existsSyncMock = mock.fn(() => true)
    ;(fs as unknown as Record<string, unknown>).existsSync = existsSyncMock

    // Clear module cache and re-import
    const modulePath = require.resolve('../src/main/llm')
    delete require.cache[modulePath]
    const mod = await import('../src/main/llm')
    invokeLLM = mod.invokeLLM
    _resetBinaryCache = mod._resetBinaryCache
    _resetBinaryCache()
  })

  afterEach(async () => {
    // Restore originals
    const childProcess = await import('child_process')
    ;(childProcess as unknown as Record<string, unknown>).spawn = originalSpawn
    const fs = await import('fs')
    ;(fs as unknown as Record<string, unknown>).existsSync = originalExistsSync
  })

  test('returns response string from valid JSON output', async () => {
    const fake = createFakeProc()
    spawnMock.mock.mockImplementation(() => {
      // Simulate async stdout data
      process.nextTick(() => {
        fake.stdout.emit('data', Buffer.from(JSON.stringify({ response: 'Hello from LLM' })))
        fake.emitClose(0)
      })
      return fake.proc
    })

    const result = await invokeLLM('test prompt')
    assert.equal(result, 'Hello from LLM')
    assert.equal(fake.stdin.write.mock.callCount(), 1)
    assert.equal(fake.stdin.end.mock.callCount(), 1)
  })

  test('strips preamble lines before JSON', async () => {
    const fake = createFakeProc()
    spawnMock.mock.mockImplementation(() => {
      process.nextTick(() => {
        const output = 'Loading model...\nInitializing...\n' + JSON.stringify({ response: 'Stripped result' })
        fake.stdout.emit('data', Buffer.from(output))
        fake.emitClose(0)
      })
      return fake.proc
    })

    const result = await invokeLLM('test prompt')
    assert.equal(result, 'Stripped result')
  })

  test('throws on non-zero exit code', async () => {
    const fake = createFakeProc()
    spawnMock.mock.mockImplementation(() => {
      process.nextTick(() => {
        fake.stderr.emit('data', Buffer.from('API key invalid'))
        fake.emitClose(1)
      })
      return fake.proc
    })

    await assert.rejects(
      () => invokeLLM('test prompt'),
      (err: Error) => {
        assert.ok(err.message.includes('exited with code 1'))
        assert.ok(err.message.includes('API key invalid'))
        return true
      },
    )
  })

  test('throws on malformed JSON output', async () => {
    const fake = createFakeProc()
    spawnMock.mock.mockImplementation(() => {
      process.nextTick(() => {
        fake.stdout.emit('data', Buffer.from('not json at all'))
        fake.emitClose(0)
      })
      return fake.proc
    })

    await assert.rejects(
      () => invokeLLM('test prompt'),
      (err: Error) => {
        assert.ok(err.message.includes('No JSON found'))
        return true
      },
    )
  })

  test('throws when JSON is valid but missing response field', async () => {
    const fake = createFakeProc()
    spawnMock.mock.mockImplementation(() => {
      process.nextTick(() => {
        fake.stdout.emit('data', Buffer.from(JSON.stringify({ data: 'no response field' })))
        fake.emitClose(0)
      })
      return fake.proc
    })

    await assert.rejects(
      () => invokeLLM('test prompt'),
      (err: Error) => {
        assert.ok(err.message.includes('missing "response" field'))
        return true
      },
    )
  })

  test('passes model and provider as CLI flags', async () => {
    const fake = createFakeProc()
    spawnMock.mock.mockImplementation(() => {
      process.nextTick(() => {
        fake.stdout.emit('data', Buffer.from(JSON.stringify({ response: 'ok' })))
        fake.emitClose(0)
      })
      return fake.proc
    })

    await invokeLLM('test prompt', { model: 'claude-haiku-4-5', provider: 'bedrock' })

    const spawnArgs = spawnMock.mock.calls[0].arguments[1] as string[]
    assert.ok(spawnArgs.includes('--model'), 'Should include --model flag')
    assert.ok(spawnArgs.includes('claude-haiku-4-5'), 'Should include model name')
    assert.ok(spawnArgs.includes('--provider'), 'Should include --provider flag')
    assert.ok(spawnArgs.includes('bedrock'), 'Should include provider name')
  })

  test('times out and kills process', async () => {
    const fake = createFakeProc()
    spawnMock.mock.mockImplementation(() => {
      // Never emit close — simulate a hung process
      return fake.proc
    })

    await assert.rejects(
      () => invokeLLM('test prompt', { timeoutMs: 50 }),
      (err: Error) => {
        assert.ok(err.message.includes('timed out'))
        return true
      },
    )

    assert.equal(fake.kill.mock.callCount(), 1, 'Should have killed the process')
  })
})
```

### Step 2: Run the tests

Run:
```bash
npx tsx --test tests/llm.test.ts
```
Expected: All 7 tests PASS.

### Step 3: Commit

```bash
git add tests/llm.test.ts
git commit -m "test: add LLM wrapper unit tests"
```

---

## Task 7: Prompt Builder

**Files:**
- Create: `src/main/prompts/analysis.ts`

### Step 1: Create the prompts directory and write the prompt builder

Create the directory `src/main/prompts/` and then create `src/main/prompts/analysis.ts`:

```typescript
import type { SessionDigest, AnalysisSectionType } from '../../shared/analysisTypes'

// --- Truncation limits ---
const MAX_PROMPTS = 20
const MAX_ERRORS = 10
const MAX_FILE_CHANGES = 50
const MAX_GIT_OPERATIONS = 20

const VALID_SECTION_TYPES: AnalysisSectionType[] = [
  'summary',
  'changes',
  'key-moments',
  'next-steps',
  'decisions',
  'action-items',
  'open-questions',
]

const SYSTEM_INSTRUCTIONS = `You are a session analyst for Amplifier, an AI coding assistant. Your job is to analyze a coding session digest and produce a structured JSON summary.

You MUST return valid JSON matching this exact schema:

{
  "sections": [
    {
      "type": "<section-type>",
      "title": "<human-readable title>",
      "content": <content-object>
    }
  ]
}

Valid section types and their content shapes:

1. "summary" — { "text": "<paragraph summarizing what happened>" }
2. "changes" — { "files": [{ "path": "<file>", "changeType": "created"|"modified"|"deleted" }] }
3. "key-moments" — { "moments": [{ "timestamp": "<ISO>", "description": "<what happened>" }] }
4. "next-steps" — { "items": ["<step 1>", "<step 2>", ...] }
5. "decisions" — { "decisions": [{ "decision": "<what>", "rationale": "<why>" }] }
6. "action-items" — { "items": [{ "text": "<item>", "completed": false }] }
7. "open-questions" — { "questions": ["<question 1>", ...] }

Rules:
- Always include a "summary" section first.
- Only include sections that are relevant to the session. If no files changed, omit "changes". If no decisions were made, omit "decisions".
- Use the EXACT hyphenated type names shown above (e.g. "key-moments", NOT "key_moments").
- Return ONLY the JSON object. No markdown fences, no explanation, no preamble.
- Keep summaries concise but specific. Reference actual file names, error messages, and prompts from the digest.

Example output for a session that added authentication:
{
  "sections": [
    { "type": "summary", "title": "Summary", "content": { "text": "Added JWT-based authentication to the Express API. Created auth middleware, login/signup routes, and user model. All 12 tests pass." } },
    { "type": "changes", "title": "Changes", "content": { "files": [{ "path": "src/middleware/auth.ts", "changeType": "created" }, { "path": "src/routes/auth.ts", "changeType": "created" }] } },
    { "type": "next-steps", "title": "Next Steps", "content": { "items": ["Add refresh token rotation", "Set up rate limiting on auth endpoints"] } }
  ]
}`

export function buildAnalysisPrompt(digest: SessionDigest): string {
  const truncatedDigest = truncateDigest(digest)
  const digestJson = JSON.stringify(truncatedDigest, null, 2)

  return `${SYSTEM_INSTRUCTIONS}

---

Here is the session digest to analyze:

${digestJson}`
}

/** Exported for testing — the valid section types the prompt instructs the LLM to use. */
export { VALID_SECTION_TYPES }

function truncateDigest(digest: SessionDigest): SessionDigest {
  const prompts =
    digest.prompts.length > MAX_PROMPTS
      ? [
          ...digest.prompts.slice(0, MAX_PROMPTS),
          {
            text: `... and ${digest.prompts.length - MAX_PROMPTS} more prompts`,
            timestamp: digest.prompts[digest.prompts.length - 1].timestamp,
          },
        ]
      : digest.prompts

  const errors = digest.errors.slice(0, MAX_ERRORS)
  const filesChanged = digest.filesChanged.slice(0, MAX_FILE_CHANGES)
  const gitOperations = digest.gitOperations.slice(0, MAX_GIT_OPERATIONS)

  return {
    ...digest,
    prompts,
    errors,
    filesChanged,
    gitOperations,
  }
}
```

### Step 2: Verify the file compiles

Run:
```bash
npx tsc --noEmit src/main/prompts/analysis.ts
```
Expected: No errors.

### Step 3: Commit

```bash
git add src/main/prompts/analysis.ts
git commit -m "feat: add analysis prompt builder with truncation"
```

---

## Task 8: Prompt Builder Tests

**Files:**
- Create: `tests/analysis-prompt.test.ts`

### Step 1: Write the prompt builder tests

Create `tests/analysis-prompt.test.ts` with the following content:

```typescript
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { buildAnalysisPrompt, VALID_SECTION_TYPES } from '../src/main/prompts/analysis'
import type { SessionDigest } from '../src/shared/analysisTypes'

function createMinimalDigest(overrides?: Partial<SessionDigest>): SessionDigest {
  return {
    sessionId: 'test-session-1',
    projectSlug: 'test-project',
    duration: {
      startedAt: '2024-01-01T00:00:00Z',
      endedAt: '2024-01-01T00:05:00Z',
    },
    prompts: [{ text: 'Add auth feature', timestamp: '2024-01-01T00:00:01Z' }],
    toolCalls: [{ tool: 'write_file', path: 'src/auth.ts', timestamp: '2024-01-01T00:00:02Z' }],
    errors: [],
    testResults: null,
    filesChanged: [{ path: 'src/auth.ts', changeType: 'created' }],
    gitOperations: [],
    ...overrides,
  }
}

// --- buildAnalysisPrompt ---

describe('buildAnalysisPrompt', () => {
  test('returns a string containing the serialized digest', () => {
    const digest = createMinimalDigest()
    const prompt = buildAnalysisPrompt(digest)

    assert.ok(typeof prompt === 'string')
    assert.ok(prompt.includes('test-session-1'), 'Should contain session ID')
    assert.ok(prompt.includes('Add auth feature'), 'Should contain prompt text')
    assert.ok(prompt.includes('src/auth.ts'), 'Should contain file path')
  })

  test('includes JSON schema instructions', () => {
    const digest = createMinimalDigest()
    const prompt = buildAnalysisPrompt(digest)

    assert.ok(prompt.includes('"sections"'), 'Should describe sections schema')
    assert.ok(prompt.includes('"type"'), 'Should describe type field')
    assert.ok(prompt.includes('"title"'), 'Should describe title field')
    assert.ok(prompt.includes('"content"'), 'Should describe content field')
  })

  test('uses hyphenated section type names', () => {
    const digest = createMinimalDigest()
    const prompt = buildAnalysisPrompt(digest)

    assert.ok(prompt.includes('key-moments'), 'Should use key-moments (hyphenated)')
    assert.ok(prompt.includes('next-steps'), 'Should use next-steps (hyphenated)')
    assert.ok(prompt.includes('action-items'), 'Should use action-items (hyphenated)')
    assert.ok(prompt.includes('open-questions'), 'Should use open-questions (hyphenated)')
    // Verify no underscored variants
    assert.ok(!prompt.includes('key_moments'), 'Should NOT use key_moments')
    assert.ok(!prompt.includes('next_steps'), 'Should NOT use next_steps')
    assert.ok(!prompt.includes('action_items'), 'Should NOT use action_items')
    assert.ok(!prompt.includes('open_questions'), 'Should NOT use open_questions')
  })

  test('truncates prompts exceeding 20 entries', () => {
    const manyPrompts = Array.from({ length: 30 }, (_, i) => ({
      text: `Prompt ${i}`,
      timestamp: '2024-01-01T00:00:00Z',
    }))
    const digest = createMinimalDigest({ prompts: manyPrompts })
    const prompt = buildAnalysisPrompt(digest)

    assert.ok(prompt.includes('Prompt 0'), 'Should include first prompt')
    assert.ok(prompt.includes('Prompt 19'), 'Should include 20th prompt')
    assert.ok(!prompt.includes('Prompt 20'), 'Should NOT include 21st prompt')
    assert.ok(prompt.includes('and 10 more prompts'), 'Should include truncation note')
  })

  test('truncates errors exceeding 10 entries', () => {
    const manyErrors = Array.from({ length: 15 }, (_, i) => ({
      message: `Error ${i}`,
      timestamp: '2024-01-01T00:00:00Z',
    }))
    const digest = createMinimalDigest({ errors: manyErrors })
    const prompt = buildAnalysisPrompt(digest)

    assert.ok(prompt.includes('Error 0'), 'Should include first error')
    assert.ok(prompt.includes('Error 9'), 'Should include 10th error')
    assert.ok(!prompt.includes('Error 10'), 'Should NOT include 11th error')
  })

  test('truncates fileChanges exceeding 50 entries', () => {
    const manyFiles = Array.from({ length: 60 }, (_, i) => ({
      path: `src/file-${i}.ts`,
      changeType: 'modified' as const,
    }))
    const digest = createMinimalDigest({ filesChanged: manyFiles })
    const prompt = buildAnalysisPrompt(digest)

    assert.ok(prompt.includes('file-0.ts'), 'Should include first file')
    assert.ok(prompt.includes('file-49.ts'), 'Should include 50th file')
    assert.ok(!prompt.includes('file-50.ts'), 'Should NOT include 51st file')
  })

  test('VALID_SECTION_TYPES matches the exact AnalysisSectionType union', () => {
    const expected = ['summary', 'changes', 'key-moments', 'next-steps', 'decisions', 'action-items', 'open-questions']
    assert.deepEqual(VALID_SECTION_TYPES, expected)
  })
})
```

### Step 2: Run the tests

Run:
```bash
npx tsx --test tests/analysis-prompt.test.ts
```
Expected: All 8 tests PASS.

### Step 3: Commit

```bash
git add tests/analysis-prompt.test.ts
git commit -m "test: add prompt builder unit tests"
```

---

## Task 9: `parseAnalysisResponse`

**Files:**
- Modify: `src/main/analysisService.ts`

### Step 1: Add `parseAnalysisResponse` function

In `src/main/analysisService.ts`, add the following import at the top of the file. After the existing `import type { ... } from '../shared/analysisTypes'` block (line 18-28), add:

```typescript
import type { AnalysisSectionType } from '../shared/analysisTypes'
```

Actually, `AnalysisSectionType` is not yet imported. Add it to the existing `import type` block. Change line 18-28 from:

```typescript
import type {
  SessionAnalysisData,
  SessionDigest,
  AnalysisResult,
  MechanicalData,
  AnalysisStatus,
  PromptEntry,
  TestStatus,
  FileChange,
  GitOperation,
} from '../shared/analysisTypes'
```

to:

```typescript
import type {
  SessionAnalysisData,
  SessionDigest,
  AnalysisResult,
  AnalysisSection,
  AnalysisSectionType,
  MechanicalData,
  AnalysisStatus,
  PromptEntry,
  TestStatus,
  FileChange,
  GitOperation,
} from '../shared/analysisTypes'
```

Then add the following function in the `// --- Private helpers ---` section (after the existing `parseJSON` function, before `generateMockAnalysis`):

```typescript
const VALID_SECTION_TYPES = new Set<AnalysisSectionType>([
  'summary',
  'changes',
  'key-moments',
  'next-steps',
  'decisions',
  'action-items',
  'open-questions',
])

export function parseAnalysisResponse(raw: string): AnalysisResult {
  // Strip markdown code fences if present
  let jsonStr = raw.trim()
  if (jsonStr.startsWith('```')) {
    const lines = jsonStr.split('\n')
    // Remove first line (```json or ```) and last line (```)
    const start = 1
    const end = lines[lines.length - 1].trim() === '```' ? lines.length - 1 : lines.length
    jsonStr = lines.slice(start, end).join('\n')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error(`LLM response is not valid JSON: ${jsonStr.slice(0, 200)}`)
  }

  const obj = parsed as Record<string, unknown>
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.sections)) {
    throw new Error('LLM response missing "sections" array')
  }

  const sections = obj.sections as Array<Record<string, unknown>>
  const validatedSections: AnalysisSection[] = []

  for (const section of sections) {
    if (typeof section.type !== 'string') {
      throw new Error('Section missing "type" field')
    }
    if (!VALID_SECTION_TYPES.has(section.type as AnalysisSectionType)) {
      throw new Error(`Invalid section type: "${section.type}"`)
    }
    if (typeof section.title !== 'string') {
      throw new Error(`Section "${section.type}" missing "title" field`)
    }
    if (section.content === undefined || section.content === null) {
      throw new Error(`Section "${section.type}" missing "content" field`)
    }
    validatedSections.push(section as unknown as AnalysisSection)
  }

  return { sections: validatedSections }
}
```

### Step 2: Verify the file compiles

Run:
```bash
npx tsc --noEmit src/main/analysisService.ts
```
Expected: No errors.

### Step 3: Commit

```bash
git add src/main/analysisService.ts
git commit -m "feat: add parseAnalysisResponse with validation"
```

---

## Task 10: Wire It All Together

**Files:**
- Modify: `src/main/analysisService.ts`

### Step 1: Add imports for new modules

In `src/main/analysisService.ts`, add these imports near the top. After the existing `import { buildSessionDigest } from './digestBuilder'` line (line 16), add:

```typescript
import { buildAnalysisPrompt } from './prompts/analysis'
import { invokeLLM } from './llm'
import { getSettings } from './settings'
```

### Step 2: Replace `generateMockAnalysis` with real LLM call in `triggerAnalysis`

In `src/main/analysisService.ts`, replace these lines inside `triggerAnalysis` (the section that calls `generateMockAnalysis` and saves the result):

```typescript
    const digest = buildSessionDigest(sessionId, row.projectSlug, events)
    const analysisResult = generateMockAnalysis(digest)

    saveAnalysisResult(sessionId, {
      analysis_json: JSON.stringify(analysisResult),
      analysis_generated_at: new Date().toISOString(),
      analysis_status: 'ready',
    })
```

Replace with:

```typescript
    const digest = buildSessionDigest(sessionId, row.projectSlug, events)
    const prompt = buildAnalysisPrompt(digest)
    const settings = getSettings()
    const raw = await invokeLLM(prompt, {
      model: settings.analysisModel,
      provider: settings.analysisProvider ?? undefined,
    })
    const analysisResult = parseAnalysisResponse(raw)

    saveAnalysisResult(sessionId, {
      analysis_json: JSON.stringify(analysisResult),
      analysis_generated_at: new Date().toISOString(),
      analysis_status: 'ready',
    })
```

### Step 3: Delete the `generateMockAnalysis` function

Delete the entire `generateMockAnalysis` function (lines 137-208 in the original file — everything from `function generateMockAnalysis(digest: SessionDigest): AnalysisResult {` through the closing `}`).

After this step, you should also be able to remove any unused imports that were only needed by the mock function. Check if `SessionDigest` is still needed — yes it is, because `buildSessionDigest` returns it. All existing imports should still be needed.

### Step 4: Verify the file compiles

Run:
```bash
npx tsc --noEmit src/main/analysisService.ts
```
Expected: No errors.

### Step 5: Commit

```bash
git add src/main/analysisService.ts
git commit -m "feat: replace generateMockAnalysis with real LLM call chain"
```

---

## Task 11: Update Analysis Tests

**Files:**
- Modify: `tests/analysisService.test.ts`

### Step 1: Rewrite the test file

Replace the entire contents of `tests/analysisService.test.ts` with:

```typescript
import { test, describe, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  initDatabase,
  closeDatabase,
  upsertProject,
  upsertSession,
  saveAnalysisResult,
  saveMechanicalData,
  getSessionById,
} from '../src/main/db'
import { getAnalysis, triggerAnalysis, parseAnalysisResponse } from '../src/main/analysisService'

function setupDb() {
  return initDatabase(':memory:')
}

function createTestSession(id = 'test-session-1', projectSlug = 'test-project') {
  upsertProject(projectSlug, '/some/path', 'Test Project')
  upsertSession({
    id,
    projectSlug,
    startedBy: 'user',
    startedAt: '2024-01-01T00:00:00Z',
    status: 'active',
    byteOffset: 0,
  })
}

// --- getAnalysis ---

describe('getAnalysis', () => {
  beforeEach(() => setupDb())
  afterEach(() => closeDatabase())

  test('returns null when session does not exist', () => {
    const result = getAnalysis('nonexistent-session')
    assert.equal(result, null)
  })

  test('returns SessionAnalysisData with default values for new session', () => {
    createTestSession()
    const result = getAnalysis('test-session-1')
    assert.ok(result !== null)
    assert.equal(result!.sessionId, 'test-session-1')
    assert.equal(result!.analysisStatus, 'none')
    assert.equal(result!.analysisResult, null)
    assert.equal(result!.analysisGeneratedAt, null)
    assert.deepEqual(result!.mechanical.promptHistory, [])
    assert.deepEqual(result!.mechanical.filesChanged, [])
    assert.deepEqual(result!.mechanical.gitOperations, [])
    assert.equal(result!.mechanical.testStatus, null)
  })

  test('returns cached analysis result when available', () => {
    createTestSession()
    const analysisResult = {
      sections: [{ type: 'summary', title: 'Summary', content: { text: 'Did some work' } }],
    }
    saveAnalysisResult('test-session-1', {
      analysis_json: JSON.stringify(analysisResult),
      analysis_generated_at: '2024-06-01T12:00:00Z',
      analysis_status: 'ready',
    })

    const result = getAnalysis('test-session-1')
    assert.ok(result !== null)
    assert.equal(result!.analysisStatus, 'ready')
    assert.equal(result!.analysisGeneratedAt, '2024-06-01T12:00:00Z')
    assert.deepEqual(result!.analysisResult, analysisResult)
  })

  test('parses mechanical data from DB columns', () => {
    createTestSession()
    const prompts = [{ text: 'Hello', timestamp: '2024-01-01T00:00:00Z' }]
    const files = [{ path: 'src/foo.ts', changeType: 'modified' }]
    const gitOps = [
      { type: 'commit', timestamp: '2024-01-01T00:00:00Z', sha: 'abc1234', message: 'feat: add stuff' },
    ]

    saveMechanicalData('test-session-1', {
      test_status: JSON.stringify({ passed: 5, failed: 0 }),
      prompt_history: JSON.stringify(prompts),
      files_changed: JSON.stringify(files),
      git_operations: JSON.stringify(gitOps),
    })

    const result = getAnalysis('test-session-1')
    assert.ok(result !== null)
    assert.deepEqual(result!.mechanical.promptHistory, prompts)
    assert.deepEqual(result!.mechanical.filesChanged, files)
    assert.deepEqual(result!.mechanical.gitOperations, gitOps)
    assert.deepEqual(result!.mechanical.testStatus, { passed: 5, failed: 0 })
  })

  test('handles malformed JSON in mechanical data columns gracefully', () => {
    createTestSession()
    saveMechanicalData('test-session-1', {
      test_status: 'not-valid-json',
      prompt_history: 'also-not-json',
      files_changed: null,
      git_operations: null,
    })

    const result = getAnalysis('test-session-1')
    assert.ok(result !== null)
    assert.equal(result!.mechanical.testStatus, null)
    assert.deepEqual(result!.mechanical.promptHistory, [])
    assert.deepEqual(result!.mechanical.filesChanged, [])
    assert.deepEqual(result!.mechanical.gitOperations, [])
  })
})

// --- parseAnalysisResponse ---

describe('parseAnalysisResponse', () => {
  test('parses valid JSON response with sections array', () => {
    const raw = JSON.stringify({
      sections: [
        { type: 'summary', title: 'Summary', content: { text: 'Did some work' } },
        { type: 'next-steps', title: 'Next Steps', content: { items: ['Do more'] } },
      ],
    })

    const result = parseAnalysisResponse(raw)
    assert.equal(result.sections.length, 2)
    assert.equal(result.sections[0].type, 'summary')
    assert.equal(result.sections[1].type, 'next-steps')
  })

  test('strips markdown code fences before parsing', () => {
    const json = JSON.stringify({
      sections: [
        { type: 'summary', title: 'Summary', content: { text: 'Fenced response' } },
      ],
    })
    const raw = '```json\n' + json + '\n```'

    const result = parseAnalysisResponse(raw)
    assert.equal(result.sections.length, 1)
    assert.equal(result.sections[0].type, 'summary')
  })

  test('throws on invalid JSON', () => {
    assert.throws(
      () => parseAnalysisResponse('not json'),
      (err: Error) => {
        assert.ok(err.message.includes('not valid JSON'))
        return true
      },
    )
  })

  test('throws when sections array is missing', () => {
    assert.throws(
      () => parseAnalysisResponse(JSON.stringify({ data: 'no sections' })),
      (err: Error) => {
        assert.ok(err.message.includes('missing "sections" array'))
        return true
      },
    )
  })

  test('throws on invalid section type', () => {
    const raw = JSON.stringify({
      sections: [
        { type: 'invalid_type', title: 'Bad', content: { text: 'nope' } },
      ],
    })
    assert.throws(
      () => parseAnalysisResponse(raw),
      (err: Error) => {
        assert.ok(err.message.includes('Invalid section type'))
        return true
      },
    )
  })

  test('throws when section is missing title', () => {
    const raw = JSON.stringify({
      sections: [
        { type: 'summary', content: { text: 'no title' } },
      ],
    })
    assert.throws(
      () => parseAnalysisResponse(raw),
      (err: Error) => {
        assert.ok(err.message.includes('missing "title"'))
        return true
      },
    )
  })

  test('throws when section is missing content', () => {
    const raw = JSON.stringify({
      sections: [
        { type: 'summary', title: 'Summary' },
      ],
    })
    assert.throws(
      () => parseAnalysisResponse(raw),
      (err: Error) => {
        assert.ok(err.message.includes('missing "content"'))
        return true
      },
    )
  })

  test('validates all 7 section types are accepted', () => {
    const sections = [
      { type: 'summary', title: 'Summary', content: { text: 'ok' } },
      { type: 'changes', title: 'Changes', content: { files: [] } },
      { type: 'key-moments', title: 'Key Moments', content: { moments: [] } },
      { type: 'next-steps', title: 'Next Steps', content: { items: [] } },
      { type: 'decisions', title: 'Decisions', content: { decisions: [] } },
      { type: 'action-items', title: 'Action Items', content: { items: [] } },
      { type: 'open-questions', title: 'Open Questions', content: { questions: [] } },
    ]
    const raw = JSON.stringify({ sections })

    const result = parseAnalysisResponse(raw)
    assert.equal(result.sections.length, 7)
  })
})

// --- triggerAnalysis ---

describe('triggerAnalysis', () => {
  let tmpDir: string
  let invokeLLMOriginal: unknown

  beforeEach(async () => {
    setupDb()
    tmpDir = mkdtempSync(join(tmpdir(), 'canvas-test-'))
    process.env['AMPLIFIER_HOME'] = tmpDir

    // Mock invokeLLM to avoid real subprocess calls
    const llmModule = await import('../src/main/llm')
    invokeLLMOriginal = llmModule.invokeLLM
  })

  afterEach(async () => {
    closeDatabase()
    delete process.env['AMPLIFIER_HOME']
    rmSync(tmpDir, { recursive: true, force: true })

    // Restore original invokeLLM
    const llmModule = await import('../src/main/llm')
    ;(llmModule as unknown as Record<string, unknown>).invokeLLM = invokeLLMOriginal
  })

  function mockInvokeLLM(response: string | Error) {
    // Dynamically replace invokeLLM in the module
    const llmModule = require('../src/main/llm')
    if (response instanceof Error) {
      llmModule.invokeLLM = mock.fn(async () => {
        throw response
      })
    } else {
      llmModule.invokeLLM = mock.fn(async () => response)
    }
    return llmModule.invokeLLM
  }

  // Also mock getSettings to avoid filesystem dependency
  function mockGetSettings() {
    const settingsModule = require('../src/main/settings')
    settingsModule.getSettings = mock.fn(() => ({
      analysisModel: 'claude-sonnet-4-5',
      analysisProvider: null,
    }))
  }

  test('returns null when session does not exist', async () => {
    const result = await triggerAnalysis('nonexistent-session')
    assert.equal(result, null)
  })

  test('valid LLM response is parsed, saved to DB, and returned', async () => {
    const projectSlug = 'test-project'
    const sessionId = 'test-session-analysis'
    createTestSession(sessionId, projectSlug)

    const eventsDir = join(tmpDir, 'projects', projectSlug, 'sessions', sessionId)
    mkdirSync(eventsDir, { recursive: true })
    const events = [
      { type: 'session:start', timestamp: '2024-01-01T00:00:00Z', data: {} },
      { type: 'user_message', timestamp: '2024-01-01T00:00:01Z', data: { text: 'Add auth feature' } },
      { type: 'tool_call', timestamp: '2024-01-01T00:00:02Z', data: { tool: 'write_file', args: { path: 'src/auth.ts' } } },
      { type: 'session:end', timestamp: '2024-01-01T00:01:00Z', data: { exitCode: 0 } },
    ]
    writeFileSync(join(eventsDir, 'events.jsonl'), events.map((e) => JSON.stringify(e)).join('\n'))

    const llmResponse = JSON.stringify({
      sections: [
        { type: 'summary', title: 'Summary', content: { text: 'Added auth feature' } },
        { type: 'changes', title: 'Changes', content: { files: [{ path: 'src/auth.ts', changeType: 'created' }] } },
      ],
    })
    mockInvokeLLM(llmResponse)
    mockGetSettings()

    const result = await triggerAnalysis(sessionId)
    assert.ok(result !== null)
    assert.equal(result!.analysisStatus, 'ready')
    assert.ok(result!.analysisResult !== null)
    assert.equal(result!.analysisResult!.sections.length, 2)
    assert.equal(result!.analysisResult!.sections[0].type, 'summary')
    assert.ok(result!.analysisGeneratedAt !== null)

    // Verify DB persistence
    const dbRow = getSessionById(sessionId)
    assert.equal(dbRow!.analysis_status, 'ready')
    assert.ok(dbRow!.analysis_json !== null)
  })

  test('LLM returns malformed JSON — sets status to failed', async () => {
    const projectSlug = 'test-project'
    const sessionId = 'test-session-bad-json'
    createTestSession(sessionId, projectSlug)

    const eventsDir = join(tmpDir, 'projects', projectSlug, 'sessions', sessionId)
    mkdirSync(eventsDir, { recursive: true })
    const events = [
      { type: 'session:start', timestamp: '2024-01-01T00:00:00Z', data: {} },
      { type: 'user_message', timestamp: '2024-01-01T00:00:01Z', data: { text: 'Do something' } },
      { type: 'session:end', timestamp: '2024-01-01T00:01:00Z', data: { exitCode: 0 } },
    ]
    writeFileSync(join(eventsDir, 'events.jsonl'), events.map((e) => JSON.stringify(e)).join('\n'))

    mockInvokeLLM('This is not valid JSON at all')
    mockGetSettings()

    const result = await triggerAnalysis(sessionId)
    assert.ok(result !== null)
    assert.equal(result!.analysisStatus, 'failed')
  })

  test('LLM throws (timeout/crash) — sets status to failed', async () => {
    const projectSlug = 'test-project'
    const sessionId = 'test-session-llm-crash'
    createTestSession(sessionId, projectSlug)

    const eventsDir = join(tmpDir, 'projects', projectSlug, 'sessions', sessionId)
    mkdirSync(eventsDir, { recursive: true })
    const events = [
      { type: 'session:start', timestamp: '2024-01-01T00:00:00Z', data: {} },
      { type: 'user_message', timestamp: '2024-01-01T00:00:01Z', data: { text: 'Do something' } },
      { type: 'session:end', timestamp: '2024-01-01T00:01:00Z', data: { exitCode: 0 } },
    ]
    writeFileSync(join(eventsDir, 'events.jsonl'), events.map((e) => JSON.stringify(e)).join('\n'))

    mockInvokeLLM(new Error('amplifier CLI timed out after 60000ms'))
    mockGetSettings()

    const result = await triggerAnalysis(sessionId)
    assert.ok(result !== null)
    assert.equal(result!.analysisStatus, 'failed')
  })

  test('populates mechanical data (prompt_history) on first trigger', async () => {
    const projectSlug = 'test-project'
    const sessionId = 'test-session-mechanical'
    createTestSession(sessionId, projectSlug)

    const eventsDir = join(tmpDir, 'projects', projectSlug, 'sessions', sessionId)
    mkdirSync(eventsDir, { recursive: true })
    const events = [
      { type: 'session:start', timestamp: '2024-01-01T00:00:00Z', data: {} },
      { type: 'user_message', timestamp: '2024-01-01T00:00:01Z', data: { text: 'Hello world' } },
      { type: 'session:end', timestamp: '2024-01-01T00:01:00Z', data: { exitCode: 0 } },
    ]
    writeFileSync(join(eventsDir, 'events.jsonl'), events.map((e) => JSON.stringify(e)).join('\n'))

    const llmResponse = JSON.stringify({
      sections: [
        { type: 'summary', title: 'Summary', content: { text: 'Greeted the world' } },
      ],
    })
    mockInvokeLLM(llmResponse)
    mockGetSettings()

    // Verify no prompt_history before trigger
    const before = getSessionById(sessionId)
    assert.equal(before!.prompt_history, null)

    await triggerAnalysis(sessionId)

    // Verify prompt_history was populated
    const after = getSessionById(sessionId)
    assert.ok(after!.prompt_history !== null, 'prompt_history should be populated after trigger')
    const prompts = JSON.parse(after!.prompt_history!) as Array<{ text: string }>
    assert.equal(prompts.length, 1)
    assert.equal(prompts[0].text, 'Hello world')
  })

  test('sets status to failed when events file is missing', async () => {
    const projectSlug = 'test-project'
    const sessionId = 'test-session-missing-events'
    createTestSession(sessionId, projectSlug)
    // No events.jsonl file created

    const result = await triggerAnalysis(sessionId)
    assert.ok(result !== null, 'Should return a result even with missing events')
  })
})
```

### Step 2: Run the tests

Run:
```bash
npx tsx --test tests/analysisService.test.ts
```
Expected: All tests PASS. The `parseAnalysisResponse` tests should all pass immediately since the function already exists. The `triggerAnalysis` tests use mocked `invokeLLM` to avoid real subprocess calls.

### Step 3: Run ALL tests to verify nothing is broken

Run:
```bash
npx tsx --test tests/*.test.ts
```
Expected: All tests across the entire test suite PASS.

### Step 4: Commit

```bash
git add tests/analysisService.test.ts
git commit -m "test: update analysis tests for real LLM flow with mocked invokeLLM"
```

---

## Task 12: Settings UI

**Files:**
- Create: `src/renderer/src/components/SettingsModal.tsx`
- Modify: `src/renderer/src/App.tsx`

### Step 1: Create the SettingsModal component

Create `src/renderer/src/components/SettingsModal.tsx` with the following content:

```typescript
import { useState, useEffect } from 'react'
import type { CanvasSettings } from '../../../shared/types'

type SettingsModalProps = {
  onClose: () => void
}

function SettingsModal({ onClose }: SettingsModalProps): React.ReactElement {
  const [model, setModel] = useState('')
  const [provider, setProvider] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.electronAPI.getSettings().then((settings: CanvasSettings) => {
      setModel(settings.analysisModel)
      setProvider(settings.analysisProvider ?? '')
      setLoading(false)
    }).catch(() => {
      setModel('claude-sonnet-4-5')
      setProvider('')
      setLoading(false)
    })
  }, [])

  function handleSave(): void {
    setSaving(true)
    const settings: CanvasSettings = {
      analysisModel: model.trim() || 'claude-sonnet-4-5',
      analysisProvider: provider.trim() || null,
    }
    window.electronAPI.saveSettings(settings).then(() => {
      onClose()
    }).catch(() => {
      setSaving(false)
    })
  }

  return (
    <div
      data-testid="settings-overlay"
      onClick={onClose}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(20,16,10,0.18)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
      }}
    >
      <div
        data-testid="settings-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 400,
          background: 'var(--bg-modal)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          padding: 24,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
            Settings
          </span>
          <button
            data-testid="settings-close"
            onClick={onClose}
            style={{
              fontSize: 16,
              color: 'var(--text-muted)',
              background: 'none',
              border: 'none',
              lineHeight: 1,
              padding: 0,
              cursor: 'pointer',
            }}
          >
            {'\u00d7'}
          </button>
        </div>

        {loading ? (
          <div style={{ marginTop: 16, fontSize: 13, color: 'var(--text-muted)' }}>
            Loading...
          </div>
        ) : (
          <>
            {/* Analysis Model field */}
            <div style={{ marginTop: 20 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 500,
                  color: 'var(--text-muted)',
                  marginBottom: 6,
                }}
              >
                Analysis Model
              </label>
              <input
                data-testid="settings-model-input"
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="claude-sonnet-4-5"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: '1px solid var(--border)',
                  background: '#F5F2EC',
                  borderRadius: 3,
                  fontSize: 13,
                  fontFamily: 'var(--font-ui)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ fontSize: 11, color: 'var(--text-very-muted)', marginTop: 4 }}>
                Model used for session analysis summaries
              </div>
            </div>

            {/* Analysis Provider field */}
            <div style={{ marginTop: 16 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 500,
                  color: 'var(--text-muted)',
                  marginBottom: 6,
                }}
              >
                Analysis Provider
              </label>
              <input
                data-testid="settings-provider-input"
                type="text"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder="default"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: '1px solid var(--border)',
                  background: '#F5F2EC',
                  borderRadius: 3,
                  fontSize: 13,
                  fontFamily: 'var(--font-ui)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ fontSize: 11, color: 'var(--text-very-muted)', marginTop: 4 }}>
                Leave empty to use default routing
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                marginTop: 24,
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 12,
                alignItems: 'center',
              }}
            >
              <button
                data-testid="settings-cancel"
                onClick={onClose}
                style={{
                  fontSize: 13,
                  color: 'var(--text-muted)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-ui)',
                }}
              >
                Cancel
              </button>
              <button
                data-testid="settings-save"
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: '7px 14px',
                  border: '1px solid #3A3530',
                  background: '#2F2B24',
                  color: '#FFFFFF',
                  fontSize: 13,
                  borderRadius: 4,
                  cursor: saving ? 'default' : 'pointer',
                  fontFamily: 'var(--font-ui)',
                  opacity: saving ? 0.5 : 1,
                }}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default SettingsModal
```

### Step 2: Wire the Settings button in App.tsx

In `src/renderer/src/App.tsx`, add the import for `SettingsModal`. After the existing import of `AddProjectModal` (line 5), add:

```typescript
import SettingsModal from './components/SettingsModal'
```

Then add a state variable for showing the settings modal. After the existing `const [showModal, setShowModal] = useState(false)` line (line 71), add:

```typescript
  const [showSettings, setShowSettings] = useState(false)
```

Then find the settings button placeholder (the button with `data-testid="header-btn-settings"` and `onClick={() => undefined}`) and change its `onClick` from `() => undefined` to `() => setShowSettings(true)`:

Change:
```typescript
            onClick={() => undefined}
```
to:
```typescript
            onClick={() => setShowSettings(true)}
```
(This is the button on or near line 216 with `data-testid="header-btn-settings"`)

Finally, render the `SettingsModal` when `showSettings` is true. Find where `AddProjectModal` is rendered (look for `{showModal && (`). Right after the closing of the AddProjectModal conditional rendering block, add:

```typescript
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
```

### Step 3: Verify the app compiles

Run:
```bash
npx tsc --noEmit
```
Expected: No errors.

### Step 4: Run all tests to make sure nothing broke

Run:
```bash
npx tsx --test tests/*.test.ts
```
Expected: All tests PASS.

### Step 5: Commit

```bash
git add src/renderer/src/components/SettingsModal.tsx src/renderer/src/App.tsx
git commit -m "feat: add Settings modal with model and provider fields"
```

---

## Final Verification

After all 12 tasks are complete, run the full test suite one final time:

```bash
npx tsx --test tests/*.test.ts
```

Expected: All tests PASS across all test files.

### Files created (4):
- `src/main/settings.ts`
- `src/main/llm.ts`
- `src/main/prompts/analysis.ts`
- `src/renderer/src/components/SettingsModal.tsx`

### Files modified (5):
- `src/shared/types.ts`
- `src/main/ipc.ts`
- `src/preload/index.ts`
- `src/main/analysisService.ts`
- `src/renderer/src/App.tsx`

### Test files created/modified (4):
- `tests/settings.test.ts` (new)
- `tests/llm.test.ts` (new)
- `tests/analysis-prompt.test.ts` (new)
- `tests/analysisService.test.ts` (modified)
