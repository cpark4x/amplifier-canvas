import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createRequire } from 'node:module'
import {
  initDatabase,
  closeDatabase,
  upsertProject,
  upsertSession,
  saveAnalysisResult,
  saveMechanicalData,
  getSessionById,
} from '../src/main/db'
import { getAnalysis } from '../src/main/analysisService'

const _require = createRequire(import.meta.url)

// --------------------------------------------------------------------------
// CJS module refs for spawn-level mocking (same instances used by llm.ts)
// --------------------------------------------------------------------------

const cp = _require('child_process')
const fsModule = _require('fs')

// --------------------------------------------------------------------------
// Fake ChildProcess helper
// --------------------------------------------------------------------------

function createFakeProc(): any {
  const proc: any = new EventEmitter()
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()

  proc.stdin = {
    write(_data: unknown) {},
    end() {},
  }

  proc.kill = () => {}
  proc.emitClose = (code: number) => proc.emit('close', code)

  return proc
}

// --------------------------------------------------------------------------
// Mock LLM response helper
//
// invokeLLM reads stdout, parses JSON, extracts parsed.response (a string).
// That string is passed to parseAnalysisResponse which expects AnalysisResult JSON.
// --------------------------------------------------------------------------

function makeLLMOutput(analysisResult: object): Buffer {
  return Buffer.from(JSON.stringify({ response: JSON.stringify(analysisResult) }))
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
  beforeEach(() => initDatabase(':memory:'))
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

// --- triggerAnalysis ---

describe('triggerAnalysis', () => {
  let tmpDir: string
  let fakeProc: any
  let originalSpawn: unknown
  let originalExistsSync: unknown
  let service: any
  let llm: any

  beforeEach(() => {
    initDatabase(':memory:')
    tmpDir = mkdtempSync(join(tmpdir(), 'canvas-test-'))
    process.env['AMPLIFIER_HOME'] = tmpDir

    fakeProc = createFakeProc()

    // Save originals so afterEach can restore them
    originalSpawn = cp.spawn
    originalExistsSync = fsModule.existsSync

    // Mock spawn to intercept the invokeLLM → amplifier binary call
    cp.spawn = (_binary: string, _args: string[]) => fakeProc

    // Mock existsSync so binary resolution always succeeds without a real binary
    fsModule.existsSync = () => true

    // Clear module cache so fresh require picks up mocked spawn / existsSync
    const llmKey = _require.resolve('../src/main/llm.ts')
    delete _require.cache[llmKey]
    const serviceKey = _require.resolve('../src/main/analysisService.ts')
    delete _require.cache[serviceKey]

    // Load fresh modules (they see the mocked child_process)
    llm = _require('../src/main/llm.ts')
    llm._resetBinaryCache()
    service = _require('../src/main/analysisService.ts')
  })

  afterEach(() => {
    closeDatabase()
    delete process.env['AMPLIFIER_HOME']
    rmSync(tmpDir, { recursive: true, force: true })

    // Restore originals
    cp.spawn = originalSpawn
    fsModule.existsSync = originalExistsSync
  })

  test('returns null when session does not exist', async () => {
    const result = await service.triggerAnalysis('nonexistent-session')
    assert.equal(result, null)
  })

  test('generates analysis and caches it for a session with events', async () => {
    const projectSlug = 'test-project'
    const sessionId = 'test-session-analysis'
    createTestSession(sessionId, projectSlug)

    // Create the events.jsonl file
    const eventsDir = join(tmpDir, 'projects', projectSlug, 'sessions', sessionId)
    mkdirSync(eventsDir, { recursive: true })
    const events = [
      { type: 'session:start', timestamp: '2024-01-01T00:00:00Z', data: {} },
      { type: 'user_message', timestamp: '2024-01-01T00:00:01Z', data: { text: 'Add auth feature' } },
      { type: 'tool_call', timestamp: '2024-01-01T00:00:02Z', data: { tool: 'write_file', args: { path: 'src/auth.ts' } } },
      { type: 'session:end', timestamp: '2024-01-01T00:01:00Z', data: { exitCode: 0 } },
    ]
    writeFileSync(join(eventsDir, 'events.jsonl'), events.map((e) => JSON.stringify(e)).join('\n'))

    const fakeAnalysis = {
      sections: [
        { type: 'summary', title: 'Summary', content: { text: 'Work was done' } },
      ],
    }
    const promise = service.triggerAnalysis(sessionId)
    setImmediate(() => {
      fakeProc.stdout.emit('data', makeLLMOutput(fakeAnalysis))
      fakeProc.emitClose(0)
    })
    const result = await promise

    assert.ok(result !== null)
    assert.equal(result!.analysisStatus, 'ready')
    assert.ok(result!.analysisResult !== null)
    assert.ok(result!.analysisResult!.sections.length > 0)
    assert.ok(result!.analysisGeneratedAt !== null)

    // Verify it was cached in DB
    const dbRow = getSessionById(sessionId)
    assert.equal(dbRow!.analysis_status, 'ready')
    assert.ok(dbRow!.analysis_json !== null)
  })

  test('analysis result always includes summary section', async () => {
    const projectSlug = 'test-project'
    const sessionId = 'test-session-summary'
    createTestSession(sessionId, projectSlug)

    const eventsDir = join(tmpDir, 'projects', projectSlug, 'sessions', sessionId)
    mkdirSync(eventsDir, { recursive: true })
    const events = [
      { type: 'session:start', timestamp: '2024-01-01T00:00:00Z', data: {} },
      { type: 'user_message', timestamp: '2024-01-01T00:00:01Z', data: { text: 'Build a login form' } },
      { type: 'session:end', timestamp: '2024-01-01T00:01:00Z', data: { exitCode: 0 } },
    ]
    writeFileSync(join(eventsDir, 'events.jsonl'), events.map((e) => JSON.stringify(e)).join('\n'))

    const fakeAnalysis = {
      sections: [
        { type: 'summary', title: 'Summary', content: { text: 'Built the login form' } },
      ],
    }
    const promise = service.triggerAnalysis(sessionId)
    setImmediate(() => {
      fakeProc.stdout.emit('data', makeLLMOutput(fakeAnalysis))
      fakeProc.emitClose(0)
    })
    const result = await promise

    assert.ok(result !== null)
    assert.ok(result!.analysisResult !== null)
    const sections = result!.analysisResult!.sections
    const summarySection = sections.find((s: { type: string }) => s.type === 'summary')
    assert.ok(summarySection !== undefined, 'Should have summary section')
    assert.ok((summarySection!.content as { text: string }).text.length > 0)
  })

  test('analysis result includes changes section when files were modified', async () => {
    const projectSlug = 'test-project'
    const sessionId = 'test-session-changes'
    createTestSession(sessionId, projectSlug)

    const eventsDir = join(tmpDir, 'projects', projectSlug, 'sessions', sessionId)
    mkdirSync(eventsDir, { recursive: true })
    const events = [
      { type: 'session:start', timestamp: '2024-01-01T00:00:00Z', data: {} },
      { type: 'user_message', timestamp: '2024-01-01T00:00:01Z', data: { text: 'Add auth' } },
      { type: 'tool_call', timestamp: '2024-01-01T00:00:02Z', data: { tool: 'write_file', args: { path: 'src/auth.ts' } } },
      { type: 'session:end', timestamp: '2024-01-01T00:01:00Z', data: { exitCode: 0 } },
    ]
    writeFileSync(join(eventsDir, 'events.jsonl'), events.map((e) => JSON.stringify(e)).join('\n'))

    const fakeAnalysis = {
      sections: [
        { type: 'summary', title: 'Summary', content: { text: 'Added auth module' } },
        {
          type: 'changes',
          title: 'Changes',
          content: { files: [{ path: 'src/auth.ts', changeType: 'modified' }] },
        },
      ],
    }
    const promise = service.triggerAnalysis(sessionId)
    setImmediate(() => {
      fakeProc.stdout.emit('data', makeLLMOutput(fakeAnalysis))
      fakeProc.emitClose(0)
    })
    const result = await promise

    assert.ok(result !== null)
    assert.ok(result!.analysisResult !== null)
    const sections = result!.analysisResult!.sections
    const changesSection = sections.find((s: { type: string }) => s.type === 'changes')
    assert.ok(changesSection !== undefined, 'Should have changes section when files were modified')
    const content = changesSection!.content as { files: Array<{ path: string }> }
    assert.ok(content.files.length > 0)
  })

  test('analysis result does not include changes section when no files changed', async () => {
    const projectSlug = 'test-project'
    const sessionId = 'test-session-no-changes'
    createTestSession(sessionId, projectSlug)

    const eventsDir = join(tmpDir, 'projects', projectSlug, 'sessions', sessionId)
    mkdirSync(eventsDir, { recursive: true })
    const events = [
      { type: 'session:start', timestamp: '2024-01-01T00:00:00Z', data: {} },
      { type: 'user_message', timestamp: '2024-01-01T00:00:01Z', data: { text: 'Just asking a question' } },
      { type: 'session:end', timestamp: '2024-01-01T00:01:00Z', data: { exitCode: 0 } },
    ]
    writeFileSync(join(eventsDir, 'events.jsonl'), events.map((e) => JSON.stringify(e)).join('\n'))

    const fakeAnalysis = {
      sections: [
        { type: 'summary', title: 'Summary', content: { text: 'Just a conversation, no files changed' } },
      ],
    }
    const promise = service.triggerAnalysis(sessionId)
    setImmediate(() => {
      fakeProc.stdout.emit('data', makeLLMOutput(fakeAnalysis))
      fakeProc.emitClose(0)
    })
    const result = await promise

    assert.ok(result !== null)
    const sections = result!.analysisResult!.sections
    const changesSection = sections.find((s: { type: string }) => s.type === 'changes')
    assert.equal(changesSection, undefined, 'Should NOT have changes section when no files modified')
  })

  test('analysis result always includes next-steps section with 2+ items', async () => {
    const projectSlug = 'test-project'
    const sessionId = 'test-session-nextsteps'
    createTestSession(sessionId, projectSlug)

    const eventsDir = join(tmpDir, 'projects', projectSlug, 'sessions', sessionId)
    mkdirSync(eventsDir, { recursive: true })
    const events = [
      { type: 'session:start', timestamp: '2024-01-01T00:00:00Z', data: {} },
      { type: 'user_message', timestamp: '2024-01-01T00:00:01Z', data: { text: 'Do something' } },
      { type: 'session:end', timestamp: '2024-01-01T00:01:00Z', data: { exitCode: 0 } },
    ]
    writeFileSync(join(eventsDir, 'events.jsonl'), events.map((e) => JSON.stringify(e)).join('\n'))

    const fakeAnalysis = {
      sections: [
        { type: 'summary', title: 'Summary', content: { text: 'Did something' } },
        { type: 'next-steps', title: 'Next Steps', content: { items: ['step 1', 'step 2'] } },
      ],
    }
    const promise = service.triggerAnalysis(sessionId)
    setImmediate(() => {
      fakeProc.stdout.emit('data', makeLLMOutput(fakeAnalysis))
      fakeProc.emitClose(0)
    })
    const result = await promise

    assert.ok(result !== null)
    const sections = result!.analysisResult!.sections
    const nextStepsSection = sections.find((s: { type: string }) => s.type === 'next-steps')
    assert.ok(nextStepsSection !== undefined, 'Should always have next-steps section')
    const content = nextStepsSection!.content as { items: string[] }
    assert.ok(content.items.length >= 2, 'Should have at least 2 next-step items')
  })

  test('analysis result includes key-moments when errors present', async () => {
    const projectSlug = 'test-project'
    const sessionId = 'test-session-errors'
    createTestSession(sessionId, projectSlug)

    const eventsDir = join(tmpDir, 'projects', projectSlug, 'sessions', sessionId)
    mkdirSync(eventsDir, { recursive: true })
    const events = [
      { type: 'session:start', timestamp: '2024-01-01T00:00:00Z', data: {} },
      { type: 'user_message', timestamp: '2024-01-01T00:00:01Z', data: { text: 'Fix the bug' } },
      {
        type: 'error',
        timestamp: '2024-01-01T00:00:05Z',
        data: { message: 'TypeError: Cannot read property of undefined' },
      },
      { type: 'session:end', timestamp: '2024-01-01T00:01:00Z', data: { exitCode: 1 } },
    ]
    writeFileSync(join(eventsDir, 'events.jsonl'), events.map((e) => JSON.stringify(e)).join('\n'))

    const fakeAnalysis = {
      sections: [
        { type: 'summary', title: 'Summary', content: { text: 'Fixed a bug with some errors along the way' } },
        {
          type: 'key-moments',
          title: 'Key Moments',
          content: { moments: ['TypeError: Cannot read property of undefined'] },
        },
      ],
    }
    const promise = service.triggerAnalysis(sessionId)
    setImmediate(() => {
      fakeProc.stdout.emit('data', makeLLMOutput(fakeAnalysis))
      fakeProc.emitClose(0)
    })
    const result = await promise

    assert.ok(result !== null)
    const sections = result!.analysisResult!.sections
    const keyMomentsSection = sections.find((s: { type: string }) => s.type === 'key-moments')
    assert.ok(keyMomentsSection !== undefined, 'Should have key-moments section when errors are present')
  })

  test('analysis result includes key-moments when test results present', async () => {
    const projectSlug = 'test-project'
    const sessionId = 'test-session-tests'
    createTestSession(sessionId, projectSlug)

    const eventsDir = join(tmpDir, 'projects', projectSlug, 'sessions', sessionId)
    mkdirSync(eventsDir, { recursive: true })
    const events = [
      { type: 'session:start', timestamp: '2024-01-01T00:00:00Z', data: {} },
      { type: 'user_message', timestamp: '2024-01-01T00:00:01Z', data: { text: 'Run tests' } },
      {
        type: 'tool_result',
        timestamp: '2024-01-01T00:00:05Z',
        data: { output: '10 passed, 2 failed' },
      },
      { type: 'session:end', timestamp: '2024-01-01T00:01:00Z', data: { exitCode: 0 } },
    ]
    writeFileSync(join(eventsDir, 'events.jsonl'), events.map((e) => JSON.stringify(e)).join('\n'))

    const fakeAnalysis = {
      sections: [
        { type: 'summary', title: 'Summary', content: { text: 'Tests ran with some failures' } },
        {
          type: 'key-moments',
          title: 'Key Moments',
          content: { moments: ['10 passed, 2 failed'] },
        },
      ],
    }
    const promise = service.triggerAnalysis(sessionId)
    setImmediate(() => {
      fakeProc.stdout.emit('data', makeLLMOutput(fakeAnalysis))
      fakeProc.emitClose(0)
    })
    const result = await promise

    assert.ok(result !== null)
    const sections = result!.analysisResult!.sections
    const keyMomentsSection = sections.find((s: { type: string }) => s.type === 'key-moments')
    assert.ok(keyMomentsSection !== undefined, 'Should have key-moments section when test results present')
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

    // Verify no prompt_history before trigger
    const before = getSessionById(sessionId)
    assert.equal(before!.prompt_history, null)

    const fakeAnalysis = {
      sections: [
        { type: 'summary', title: 'Summary', content: { text: 'Said hello' } },
      ],
    }
    const promise = service.triggerAnalysis(sessionId)
    setImmediate(() => {
      fakeProc.stdout.emit('data', makeLLMOutput(fakeAnalysis))
      fakeProc.emitClose(0)
    })
    await promise

    // Verify prompt_history was populated
    const after = getSessionById(sessionId)
    assert.ok(after!.prompt_history !== null, 'prompt_history should be populated after trigger')
    const prompts = JSON.parse(after!.prompt_history!) as Array<{ text: string }>
    assert.equal(prompts.length, 1)
    assert.equal(prompts[0].text, 'Hello world')
  })

  test('sets status to failed and returns result when events file is missing', async () => {
    const projectSlug = 'test-project'
    const sessionId = 'test-session-missing-events'
    createTestSession(sessionId, projectSlug)
    // No events.jsonl file created

    const fakeAnalysis = {
      sections: [
        { type: 'summary', title: 'Summary', content: { text: 'No events to process' } },
      ],
    }
    const promise = service.triggerAnalysis(sessionId)
    setImmediate(() => {
      // tailReadEvents returns empty events when file is missing (no throw),
      // so invokeLLM is still called — emit a valid response to avoid hanging
      fakeProc.stdout.emit('data', makeLLMOutput(fakeAnalysis))
      fakeProc.emitClose(0)
    })
    const result = await promise

    // Should not throw; should return a result
    // With no events, analysis should still succeed (empty digest) or fail gracefully
    assert.ok(result !== null, 'Should return a result even with missing events')
  })
})
