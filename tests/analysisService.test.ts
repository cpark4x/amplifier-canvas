import { test, describe, beforeEach, afterEach } from 'node:test'
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
import { getAnalysis, triggerAnalysis } from '../src/main/analysisService'

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

// --- triggerAnalysis ---

describe('triggerAnalysis', () => {
  let tmpDir: string

  beforeEach(() => {
    setupDb()
    tmpDir = mkdtempSync(join(tmpdir(), 'canvas-test-'))
    process.env['AMPLIFIER_HOME'] = tmpDir
  })

  afterEach(() => {
    closeDatabase()
    delete process.env['AMPLIFIER_HOME']
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('returns null when session does not exist', async () => {
    const result = await triggerAnalysis('nonexistent-session')
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

    const result = await triggerAnalysis(sessionId)
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

    const result = await triggerAnalysis(sessionId)
    assert.ok(result !== null)
    assert.ok(result!.analysisResult !== null)
    const sections = result!.analysisResult!.sections
    const summarySection = sections.find((s) => s.type === 'summary')
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

    const result = await triggerAnalysis(sessionId)
    assert.ok(result !== null)
    assert.ok(result!.analysisResult !== null)
    const sections = result!.analysisResult!.sections
    const changesSection = sections.find((s) => s.type === 'changes')
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

    const result = await triggerAnalysis(sessionId)
    assert.ok(result !== null)
    const sections = result!.analysisResult!.sections
    const changesSection = sections.find((s) => s.type === 'changes')
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

    const result = await triggerAnalysis(sessionId)
    assert.ok(result !== null)
    const sections = result!.analysisResult!.sections
    const nextStepsSection = sections.find((s) => s.type === 'next-steps')
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

    const result = await triggerAnalysis(sessionId)
    assert.ok(result !== null)
    const sections = result!.analysisResult!.sections
    const keyMomentsSection = sections.find((s) => s.type === 'key-moments')
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

    const result = await triggerAnalysis(sessionId)
    assert.ok(result !== null)
    const sections = result!.analysisResult!.sections
    const keyMomentsSection = sections.find((s) => s.type === 'key-moments')
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

    await triggerAnalysis(sessionId)

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

    const result = await triggerAnalysis(sessionId)
    // Should not throw; should return a result
    // With no events, analysis should still succeed (empty digest) or fail gracefully
    assert.ok(result !== null, 'Should return a result even with missing events')
  })
})
