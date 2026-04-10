import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { buildSessionDigest } from '../src/main/digestBuilder'
import type { ParsedEvent } from '../src/main/events-parser'

const BASE_EVENTS: ParsedEvent[] = [
  { type: 'session:start', timestamp: '2024-01-01T00:00:00Z', data: {} },
  { type: 'user_message', timestamp: '2024-01-01T00:00:01Z', data: { text: 'Add auth feature' } },
  { type: 'user_message', timestamp: '2024-01-01T00:00:02Z', data: { text: 'Also add tests' } },
  {
    type: 'tool_call',
    timestamp: '2024-01-01T00:00:03Z',
    data: { tool: 'read_file', args: { path: 'src/auth.ts' } },
  },
  {
    type: 'tool_call',
    timestamp: '2024-01-01T00:00:04Z',
    data: { tool: 'write_file', args: { path: 'src/auth.ts' } },
  },
  {
    type: 'tool_result',
    timestamp: '2024-01-01T00:00:05Z',
    data: { output: '5 passed' },
  },
  {
    type: 'error',
    timestamp: '2024-01-01T00:00:06Z',
    data: { message: 'Type error in auth.ts' },
  },
  {
    type: 'tool_result',
    timestamp: '2024-01-01T00:00:07Z',
    data: { output: '[main abc1234] feat: add auth' },
  },
  { type: 'session:end', timestamp: '2024-01-01T00:01:00Z', data: { exitCode: 0 } },
]

describe('buildSessionDigest', () => {
  test('extracts session metadata (sessionId, projectSlug, duration.startedAt/endedAt)', () => {
    const digest = buildSessionDigest('session-123', 'my-project', BASE_EVENTS)
    assert.equal(digest.sessionId, 'session-123')
    assert.equal(digest.projectSlug, 'my-project')
    assert.equal(digest.duration.startedAt, '2024-01-01T00:00:00Z')
    assert.equal(digest.duration.endedAt, '2024-01-01T00:01:00Z')
  })

  test('extracts all prompts (length=2, texts match)', () => {
    const digest = buildSessionDigest('session-123', 'my-project', BASE_EVENTS)
    assert.equal(digest.prompts.length, 2)
    assert.equal(digest.prompts[0].text, 'Add auth feature')
    assert.equal(digest.prompts[1].text, 'Also add tests')
  })

  test('extracts tool calls with tool name and path (toolCalls.length >= 2, first tool=read_file, path=src/auth.ts)', () => {
    const digest = buildSessionDigest('session-123', 'my-project', BASE_EVENTS)
    assert.ok(digest.toolCalls.length >= 2)
    assert.equal(digest.toolCalls[0].tool, 'read_file')
    assert.equal(digest.toolCalls[0].path, 'src/auth.ts')
  })

  test('extracts errors (length=1, message=Type error in auth.ts)', () => {
    const digest = buildSessionDigest('session-123', 'my-project', BASE_EVENTS)
    assert.equal(digest.errors.length, 1)
    assert.equal(digest.errors[0].message, 'Type error in auth.ts')
  })

  test('extracts test results (not null, passed=5, failed=0)', () => {
    const digest = buildSessionDigest('session-123', 'my-project', BASE_EVENTS)
    assert.ok(digest.testResults !== null)
    assert.equal(digest.testResults!.passed, 5)
    assert.equal(digest.testResults!.failed, 0)
  })

  test('extracts files changed - write operations only (length >= 1, first path=src/auth.ts)', () => {
    const digest = buildSessionDigest('session-123', 'my-project', BASE_EVENTS)
    assert.ok(digest.filesChanged.length >= 1)
    assert.equal(digest.filesChanged[0].path, 'src/auth.ts')
  })

  test('extracts git operations (length=1, type=commit, sha=abc1234)', () => {
    const digest = buildSessionDigest('session-123', 'my-project', BASE_EVENTS)
    assert.equal(digest.gitOperations.length, 1)
    assert.equal(digest.gitOperations[0].type, 'commit')
    assert.equal(digest.gitOperations[0].sha, 'abc1234')
  })

  test('handles empty events gracefully (all arrays empty, testResults null)', () => {
    const digest = buildSessionDigest('session-empty', 'empty-project', [])
    assert.deepEqual(digest.prompts, [])
    assert.deepEqual(digest.toolCalls, [])
    assert.deepEqual(digest.errors, [])
    assert.deepEqual(digest.filesChanged, [])
    assert.deepEqual(digest.gitOperations, [])
    assert.equal(digest.testResults, null)
  })

  test('handles events without session:start or session:end (uses first/last event timestamps)', () => {
    const events: ParsedEvent[] = [
      { type: 'user_message', timestamp: '2024-02-01T10:00:00Z', data: { text: 'Hello' } },
      {
        type: 'tool_call',
        timestamp: '2024-02-01T10:00:05Z',
        data: { tool: 'read_file', args: { path: 'src/main.ts' } },
      },
      {
        type: 'tool_result',
        timestamp: '2024-02-01T10:00:10Z',
        data: { output: 'file contents' },
      },
    ]
    const digest = buildSessionDigest('session-no-bookends', 'test-project', events)
    assert.equal(digest.duration.startedAt, '2024-02-01T10:00:00Z')
    assert.equal(digest.duration.endedAt, '2024-02-01T10:00:10Z')
  })
})
