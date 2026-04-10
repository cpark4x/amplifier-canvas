import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  initDatabase,
  closeDatabase,
  upsertProject,
  upsertSession,
  getSessionById,
  saveMechanicalData,
  saveAnalysisResult,
  updateAnalysisStatus,
} from '../src/main/db'

// Use in-memory SQLite for tests
function setupDb() {
  return initDatabase(':memory:')
}

function createTestSession(id = 'test-session-1') {
  upsertProject('test-project', '/some/path', 'Test Project')
  upsertSession({
    id,
    projectSlug: 'test-project',
    startedBy: 'user',
    startedAt: '2024-01-01T00:00:00Z',
    status: 'active',
    byteOffset: 0,
  })
}

describe('Phase 2 DB migrations - new columns exist', () => {
  beforeEach(() => setupDb())
  afterEach(() => closeDatabase())

  test('sessions table has test_status column', () => {
    createTestSession()
    const session = getSessionById('test-session-1')
    assert.ok(session !== null, 'Session should exist')
    assert.ok('test_status' in session!, 'test_status column should exist')
  })

  test('sessions table has prompt_history column', () => {
    createTestSession()
    const session = getSessionById('test-session-1')
    assert.ok('prompt_history' in session!, 'prompt_history column should exist')
  })

  test('sessions table has files_changed column', () => {
    createTestSession()
    const session = getSessionById('test-session-1')
    assert.ok('files_changed' in session!, 'files_changed column should exist')
  })

  test('sessions table has git_operations column', () => {
    createTestSession()
    const session = getSessionById('test-session-1')
    assert.ok('git_operations' in session!, 'git_operations column should exist')
  })

  test('sessions table has analysis_json column', () => {
    createTestSession()
    const session = getSessionById('test-session-1')
    assert.ok('analysis_json' in session!, 'analysis_json column should exist')
  })

  test('sessions table has analysis_generated_at column', () => {
    createTestSession()
    const session = getSessionById('test-session-1')
    assert.ok('analysis_generated_at' in session!, 'analysis_generated_at column should exist')
  })

  test('sessions table has analysis_status column with default none', () => {
    createTestSession()
    const session = getSessionById('test-session-1')
    assert.ok('analysis_status' in session!, 'analysis_status column should exist')
    assert.equal(session!.analysis_status, 'none', 'analysis_status should default to none')
  })
})

describe('saveMechanicalData', () => {
  beforeEach(() => setupDb())
  afterEach(() => closeDatabase())

  test('saves test_status, prompt_history, files_changed, git_operations', () => {
    createTestSession()
    saveMechanicalData('test-session-1', {
      test_status: 'passed',
      prompt_history: JSON.stringify(['prompt 1', 'prompt 2']),
      files_changed: JSON.stringify(['src/foo.ts', 'src/bar.ts']),
      git_operations: JSON.stringify(['git commit', 'git push']),
    })
    const session = getSessionById('test-session-1')
    assert.equal(session!.test_status, 'passed')
    assert.equal(session!.prompt_history, JSON.stringify(['prompt 1', 'prompt 2']))
    assert.equal(session!.files_changed, JSON.stringify(['src/foo.ts', 'src/bar.ts']))
    assert.equal(session!.git_operations, JSON.stringify(['git commit', 'git push']))
  })

  test('allows null values for mechanical data fields', () => {
    createTestSession()
    saveMechanicalData('test-session-1', {
      test_status: null,
      prompt_history: null,
      files_changed: null,
      git_operations: null,
    })
    const session = getSessionById('test-session-1')
    assert.equal(session!.test_status, null)
    assert.equal(session!.prompt_history, null)
  })
})

describe('saveAnalysisResult', () => {
  beforeEach(() => setupDb())
  afterEach(() => closeDatabase())

  test('saves analysis_json, analysis_generated_at, and analysis_status', () => {
    createTestSession()
    saveAnalysisResult('test-session-1', {
      analysis_json: JSON.stringify({ summary: 'did stuff' }),
      analysis_generated_at: '2024-06-01T12:00:00Z',
      analysis_status: 'ready',
    })
    const session = getSessionById('test-session-1')
    assert.equal(session!.analysis_json, JSON.stringify({ summary: 'did stuff' }))
    assert.equal(session!.analysis_generated_at, '2024-06-01T12:00:00Z')
    assert.equal(session!.analysis_status, 'ready')
  })
})

describe('updateAnalysisStatus', () => {
  beforeEach(() => setupDb())
  afterEach(() => closeDatabase())

  test('updates only analysis_status', () => {
    createTestSession()
    // First set some analysis data
    saveAnalysisResult('test-session-1', {
      analysis_json: JSON.stringify({ summary: 'did stuff' }),
      analysis_generated_at: '2024-06-01T12:00:00Z',
      analysis_status: 'ready',
    })
    // Then update just the status
    updateAnalysisStatus('test-session-1', 'generating')
    const session = getSessionById('test-session-1')
    assert.equal(session!.analysis_status, 'generating')
    // Other fields should be untouched
    assert.equal(session!.analysis_json, JSON.stringify({ summary: 'did stuff' }))
    assert.equal(session!.analysis_generated_at, '2024-06-01T12:00:00Z')
  })

  test('can set analysis_status to none', () => {
    createTestSession()
    updateAnalysisStatus('test-session-1', 'none')
    const session = getSessionById('test-session-1')
    assert.equal(session!.analysis_status, 'none')
  })
})
