/**
 * Tests for task-10: Wire triggerAnalysis to real LLM call chain
 *
 * Verifies that triggerAnalysis uses the buildAnalysisPrompt -> invokeLLM ->
 * parseAnalysisResponse chain instead of the old generateMockAnalysis function.
 *
 * Mocking strategy: Mock child_process.spawn at the CJS module level (same
 * pattern as llm.test.ts). This works reliably because:
 *  1. We mutate cp.spawn before clearing the module cache
 *  2. We clear + re-require llm.ts and analysisService.ts so fresh module
 *     code executes with the mocked spawn already in place
 *  3. This avoids the tsx/esbuild non-configurable getter-only export problem
 *     that makes "replace invokeLLM on the module object" silently fail.
 */

import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createRequire } from 'node:module'
import { initDatabase, closeDatabase, upsertProject, upsertSession } from '../src/main/db'

const _require = createRequire(import.meta.url)

// --------------------------------------------------------------------------
// CJS module refs for mocking (same module instances used by llm.ts)
// --------------------------------------------------------------------------

const cp = _require('child_process')
const fsModule = _require('fs')

// --------------------------------------------------------------------------
// Fake ChildProcess helper
// --------------------------------------------------------------------------

/**
 * Returns a fake ChildProcess with:
 *   - EventEmitter-based stdout and stderr
 *   - stdin that captures all written data (for prompt assertions)
 *   - emitClose(code) helper to trigger the 'close' event
 */
function createFakeProc(): any {
  const proc: any = new EventEmitter()
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()

  let capturedStdinData = ''

  proc.stdin = {
    write(data: string | Buffer) {
      capturedStdinData += typeof data === 'string' ? data : data.toString()
    },
    end() {},
    get capturedData() {
      return capturedStdinData
    },
  }

  proc.kill = () => {}
  proc.emitClose = (code: number) => proc.emit('close', code)

  return proc
}

// --------------------------------------------------------------------------
// Mock LLM response helpers
// --------------------------------------------------------------------------

/**
 * A valid AnalysisResult that parseAnalysisResponse can parse.
 * The summary text 'This is from the real LLM chain' is DISTINCT from anything
 * generateMockAnalysis would produce, so we can use it as a canary value.
 */
const MOCK_ANALYSIS_RESULT = {
  sections: [
    {
      type: 'summary',
      title: 'Mock Summary',
      content: { text: 'This is from the real LLM chain' },
    },
    {
      type: 'next-steps',
      title: 'Next Steps',
      content: { items: ['Mock step 1', 'Mock step 2'] },
    },
  ],
}

/**
 * Build the stdout payload that invokeLLM expects.
 * invokeLLM parses JSON from stdout and extracts the 'response' field.
 * The 'response' field value is then passed to parseAnalysisResponse.
 */
function makeLLMOutput(analysisResult: object): Buffer {
  return Buffer.from(JSON.stringify({ response: JSON.stringify(analysisResult) }))
}

// --------------------------------------------------------------------------
// Test helpers
// --------------------------------------------------------------------------

function createTestSession(id = 'test-session', projectSlug = 'test-project') {
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

function writeEventsFile(tmpDir: string, projectSlug: string, sessionId: string, events: object[]) {
  const eventsDir = join(tmpDir, 'projects', projectSlug, 'sessions', sessionId)
  mkdirSync(eventsDir, { recursive: true })
  writeFileSync(join(eventsDir, 'events.jsonl'), events.map((e) => JSON.stringify(e)).join('\n'))
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe('triggerAnalysis — LLM chain wiring', () => {
  let tmpDir: string
  let fakeProc: any
  let spawnArgs: string[]
  let originalSpawn: unknown
  let originalExistsSync: unknown
  let service: any
  let llm: any

  beforeEach(() => {
    initDatabase(':memory:')
    tmpDir = mkdtempSync(join(tmpdir(), 'canvas-wire-test-'))
    process.env['AMPLIFIER_HOME'] = tmpDir

    fakeProc = createFakeProc()
    spawnArgs = []

    // Save originals so afterEach can restore them
    originalSpawn = cp.spawn
    originalExistsSync = fsModule.existsSync

    // Mock spawn: capture args and return fakeProc
    cp.spawn = (_binary: string, args: string[]) => {
      spawnArgs = args
      return fakeProc
    }

    // Mock existsSync to return true so binary resolution always succeeds
    fsModule.existsSync = () => true

    // Clear module cache so fresh require picks up mocked spawn / existsSync
    const llmKey = _require.resolve('../src/main/llm.ts')
    delete _require.cache[llmKey]
    const serviceKey = _require.resolve('../src/main/analysisService.ts')
    delete _require.cache[serviceKey]

    // Load fresh llm.ts (picks up mocked spawn / existsSync)
    llm = _require('../src/main/llm.ts')
    llm._resetBinaryCache()

    // Load fresh analysisService.ts (uses the freshly-loaded llm.ts)
    service = _require('../src/main/analysisService.ts')
  })

  afterEach(() => {
    closeDatabase()
    delete process.env['AMPLIFIER_HOME']
    rmSync(tmpDir, { recursive: true, force: true })

    // Restore the originals
    cp.spawn = originalSpawn
    fsModule.existsSync = originalExistsSync
  })

  test('triggerAnalysis calls invokeLLM and uses its response (not generateMockAnalysis)', async () => {
    const projectSlug = 'test-project'
    const sessionId = 'test-wire-llm'
    createTestSession(sessionId, projectSlug)
    writeEventsFile(tmpDir, projectSlug, sessionId, [
      { type: 'session:start', timestamp: '2024-01-01T00:00:00Z', data: {} },
      { type: 'user_message', timestamp: '2024-01-01T00:00:01Z', data: { text: 'Do something' } },
      { type: 'session:end', timestamp: '2024-01-01T00:01:00Z', data: { exitCode: 0 } },
    ])

    const promise = service.triggerAnalysis(sessionId)
    setImmediate(() => {
      fakeProc.stdout.emit('data', makeLLMOutput(MOCK_ANALYSIS_RESULT))
      fakeProc.emitClose(0)
    })
    const result = await promise

    // invokeLLM must have been called (stdin received the prompt)
    assert.ok(fakeProc.stdin.capturedData.length > 0, 'invokeLLM should be called with a prompt')

    // The result should reflect the mocked LLM response, not generateMockAnalysis output
    assert.ok(result !== null)
    assert.equal(result.analysisStatus, 'ready')
    assert.ok(result.analysisResult !== null)
    const summarySection = result.analysisResult.sections.find(
      (s: { type: string }) => s.type === 'summary',
    )
    assert.ok(summarySection !== undefined, 'should have summary section')
    assert.equal(
      (summarySection.content as { text: string }).text,
      'This is from the real LLM chain',
      'summary content should come from LLM, not generateMockAnalysis',
    )
  })

  test('triggerAnalysis passes model and provider from settings to invokeLLM', async () => {
    const projectSlug = 'test-project'
    const sessionId = 'test-wire-settings'
    createTestSession(sessionId, projectSlug)
    writeEventsFile(tmpDir, projectSlug, sessionId, [
      { type: 'session:start', timestamp: '2024-01-01T00:00:00Z', data: {} },
      { type: 'session:end', timestamp: '2024-01-01T00:01:00Z', data: { exitCode: 0 } },
    ])

    const promise = service.triggerAnalysis(sessionId)
    setImmediate(() => {
      fakeProc.stdout.emit('data', makeLLMOutput(MOCK_ANALYSIS_RESULT))
      fakeProc.emitClose(0)
    })
    await promise

    // spawn args must include --model with a string value (from settings.analysisModel)
    assert.ok(
      spawnArgs.includes('--model'),
      `Expected '--model' in spawn args: [${spawnArgs.join(', ')}]`,
    )
    const modelIndex = spawnArgs.indexOf('--model')
    assert.ok(
      modelIndex !== -1 && typeof spawnArgs[modelIndex + 1] === 'string',
      'should pass model string value from settings',
    )

    // provider: default is null → undefined → --provider flag is omitted entirely
    // if somehow --provider IS present, its value must be a string (not null/undefined)
    const providerIndex = spawnArgs.indexOf('--provider')
    if (providerIndex !== -1) {
      assert.ok(
        typeof spawnArgs[providerIndex + 1] === 'string',
        'provider value should be a string when the flag is present',
      )
    }
    // Both absent (default) and present-as-string satisfy the spec
  })

  test('triggerAnalysis sends the session digest embedded in the prompt to invokeLLM', async () => {
    const projectSlug = 'test-project'
    const sessionId = 'test-wire-digest'
    createTestSession(sessionId, projectSlug)
    writeEventsFile(tmpDir, projectSlug, sessionId, [
      { type: 'session:start', timestamp: '2024-01-01T00:00:00Z', data: {} },
      {
        type: 'user_message',
        timestamp: '2024-01-01T00:00:01Z',
        data: { text: 'Unique marker XYZ987' },
      },
      { type: 'session:end', timestamp: '2024-01-01T00:01:00Z', data: { exitCode: 0 } },
    ])

    const promise = service.triggerAnalysis(sessionId)
    setImmediate(() => {
      fakeProc.stdout.emit('data', makeLLMOutput(MOCK_ANALYSIS_RESULT))
      fakeProc.emitClose(0)
    })
    await promise

    // The prompt (written to stdin) should contain the session digest (which includes the unique message text)
    assert.ok(
      fakeProc.stdin.capturedData.includes('Unique marker XYZ987'),
      'prompt should contain session digest data (user message text)',
    )
  })
})
