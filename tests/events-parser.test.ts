import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { extractFirstPrompt, extractSessionStats, deriveSessionTitle, extractAllPrompts, extractErrors, extractTestResults, extractGitOperations } from '../src/main/events-parser'
import type { ParsedEvent } from '../src/main/events-parser'

describe('extractFirstPrompt', () => {
  test('returns text of first user_message event', () => {
    const events: ParsedEvent[] = [
      {
        type: 'session:start',
        timestamp: '2024-01-01T00:00:00Z',
        data: {},
      },
      {
        type: 'user_message',
        timestamp: '2024-01-01T00:00:01Z',
        data: { text: 'Hello, what can you do?' },
      },
      {
        type: 'user_message',
        timestamp: '2024-01-01T00:00:02Z',
        data: { text: 'Second message' },
      },
    ]
    assert.equal(extractFirstPrompt(events), 'Hello, what can you do?')
  })

  test('returns undefined when no user_message events exist', () => {
    const events: ParsedEvent[] = [
      {
        type: 'session:start',
        timestamp: '2024-01-01T00:00:00Z',
        data: {},
      },
      {
        type: 'assistant_message',
        timestamp: '2024-01-01T00:00:01Z',
        data: { text: 'Hello!' },
      },
    ]
    assert.equal(extractFirstPrompt(events), undefined)
  })

  test('returns undefined for empty events array', () => {
    const events: ParsedEvent[] = []
    assert.equal(extractFirstPrompt(events), undefined)
  })

  test('returns undefined when user_message has no text field', () => {
    const events: ParsedEvent[] = [
      {
        type: 'user_message',
        timestamp: '2024-01-01T00:00:00Z',
        data: {},
      },
    ]
    assert.equal(extractFirstPrompt(events), undefined)
  })
})

describe('extractSessionStats', () => {
  test('counts prompts, tool calls, unique changed files, and lastEventTimestamp', () => {
    const events: ParsedEvent[] = [
      { type: 'session:start', timestamp: '2024-01-01T00:00:00Z', data: {} },
      { type: 'user_message', timestamp: '2024-01-01T00:00:01Z', data: { text: 'Do something' } },
      {
        type: 'tool_call',
        timestamp: '2024-01-01T00:00:02Z',
        data: { tool: 'read_file', args: { path: '/foo/bar.ts' } },
      },
      {
        type: 'tool_call',
        timestamp: '2024-01-01T00:00:03Z',
        data: { tool: 'write_file', args: { path: '/foo/output.ts' } },
      },
      {
        type: 'tool_call',
        timestamp: '2024-01-01T00:00:04Z',
        data: { tool: 'edit_file', args: { path: '/foo/other.ts' } },
      },
      {
        type: 'tool_call',
        timestamp: '2024-01-01T00:00:05Z',
        data: { tool: 'write_file', args: { path: '/foo/output.ts' } }, // duplicate path
      },
      { type: 'user_message', timestamp: '2024-01-01T00:00:06Z', data: { text: 'And more' } },
    ]
    const stats = extractSessionStats(events)
    assert.equal(stats.promptCount, 2)
    assert.equal(stats.toolCallCount, 4)
    // read_file must not appear; write_file and edit_file paths must appear; duplicates deduplicated
    assert.equal(stats.filesChanged.has('/foo/bar.ts'), false)
    assert.equal(stats.filesChanged.has('/foo/output.ts'), true)
    assert.equal(stats.filesChanged.has('/foo/other.ts'), true)
    assert.equal(stats.filesChanged.size, 2)
    assert.equal(stats.lastEventTimestamp, '2024-01-01T00:00:06Z')
  })

  test('returns zeros for empty events', () => {
    const stats = extractSessionStats([])
    assert.equal(stats.promptCount, 0)
    assert.equal(stats.toolCallCount, 0)
    assert.equal(stats.filesChanged.size, 0)
    assert.equal(stats.lastEventTimestamp, undefined)
  })

  test('counts create_file and delete_file as changed files', () => {
    const events: ParsedEvent[] = [
      {
        type: 'tool_call',
        timestamp: '2024-01-01T00:00:01Z',
        data: { tool: 'create_file', args: { path: '/foo/new.ts' } },
      },
      {
        type: 'tool_call',
        timestamp: '2024-01-01T00:00:02Z',
        data: { tool: 'delete_file', args: { path: '/foo/old.ts' } },
      },
    ]
    const stats = extractSessionStats(events)
    assert.equal(stats.filesChanged.has('/foo/new.ts'), true)
    assert.equal(stats.filesChanged.has('/foo/old.ts'), true)
    assert.equal(stats.filesChanged.size, 2)
  })
})

describe('deriveSessionTitle', () => {
  test('returns short prompts unchanged', () => {
    const short = 'Fix the login button'
    assert.equal(deriveSessionTitle(short), 'Fix the login button')
  })

  test('truncates at word boundary around 60 chars with ellipsis, max length 63', () => {
    // 84 chars — truncates after "with" (57 chars) → "...with..." → total ≤ 63
    const long =
      'Fix the authentication flow so that users can log in with email and password credentials'
    const result = deriveSessionTitle(long)
    assert.ok(result.endsWith('...'), `Expected ellipsis suffix, got: "${result}"`)
    assert.ok(result.length <= 63, `Expected max 63 chars, got ${result.length}: "${result}"`)
    // Should truncate at a word boundary (no mid-word cut)
    const textPart = result.slice(0, -3)
    assert.ok(!textPart.endsWith(' '), `Should not end with trailing space: "${result}"`)
  })

  test('strips markdown bold and inline code formatting', () => {
    const md = 'This is **bold** and `code` text'
    assert.equal(deriveSessionTitle(md), 'This is bold and code text')
  })

  test('returns empty string for empty input', () => {
    assert.equal(deriveSessionTitle(''), '')
  })
})

describe('extractAllPrompts', () => {
  test('returns all user_message events with text and timestamp', () => {
    const events: ParsedEvent[] = [
      {
        type: 'session:start',
        timestamp: '2024-01-01T00:00:00Z',
        data: {},
      },
      {
        type: 'user_message',
        timestamp: '2024-01-01T00:00:01Z',
        data: { text: 'First prompt' },
      },
      {
        type: 'assistant_message',
        timestamp: '2024-01-01T00:00:02Z',
        data: { text: 'Response' },
      },
      {
        type: 'user_message',
        timestamp: '2024-01-01T00:00:03Z',
        data: { text: 'Second prompt' },
      },
    ]
    const result = extractAllPrompts(events)
    assert.equal(result.length, 2)
    assert.equal(result[0].text, 'First prompt')
    assert.equal(result[0].timestamp, '2024-01-01T00:00:01Z')
    assert.equal(result[1].text, 'Second prompt')
    assert.equal(result[1].timestamp, '2024-01-01T00:00:03Z')
  })

  test('returns empty array when no user_message events', () => {
    const events: ParsedEvent[] = [
      { type: 'session:start', timestamp: '2024-01-01T00:00:00Z', data: {} },
      { type: 'assistant_message', timestamp: '2024-01-01T00:00:01Z', data: { text: 'Hello' } },
    ]
    const result = extractAllPrompts(events)
    assert.deepEqual(result, [])
  })

  test('skips user_message events without text field', () => {
    const events: ParsedEvent[] = [
      {
        type: 'user_message',
        timestamp: '2024-01-01T00:00:00Z',
        data: {},
      },
      {
        type: 'user_message',
        timestamp: '2024-01-01T00:00:01Z',
        data: { text: 'Valid prompt' },
      },
    ]
    const result = extractAllPrompts(events)
    assert.equal(result.length, 1)
    assert.equal(result[0].text, 'Valid prompt')
  })
})

describe('extractErrors', () => {
  test('extracts error events with message and timestamp', () => {
    const events: ParsedEvent[] = [
      { type: 'session:start', timestamp: '2024-01-01T00:00:00Z', data: {} },
      {
        type: 'error',
        timestamp: '2024-01-01T00:00:01Z',
        data: { message: 'Something went wrong' },
      },
    ]
    const result = extractErrors(events)
    assert.equal(result.length, 1)
    assert.equal(result[0].message, 'Something went wrong')
    assert.equal(result[0].timestamp, '2024-01-01T00:00:01Z')
  })

  test('extracts tool_result errors (data.error === true with data.output)', () => {
    const events: ParsedEvent[] = [
      {
        type: 'tool_result',
        timestamp: '2024-01-01T00:00:02Z',
        data: { error: true, output: 'File not found: /path/to/file.ts' },
      },
      {
        type: 'tool_result',
        timestamp: '2024-01-01T00:00:03Z',
        data: { error: false, output: 'Success' },
      },
    ]
    const result = extractErrors(events)
    assert.equal(result.length, 1)
    assert.equal(result[0].message, 'File not found: /path/to/file.ts')
    assert.equal(result[0].timestamp, '2024-01-01T00:00:02Z')
  })

  test('returns empty array when no errors', () => {
    const events: ParsedEvent[] = [
      { type: 'session:start', timestamp: '2024-01-01T00:00:00Z', data: {} },
      { type: 'user_message', timestamp: '2024-01-01T00:00:01Z', data: { text: 'Hello' } },
      {
        type: 'tool_result',
        timestamp: '2024-01-01T00:00:02Z',
        data: { error: false, output: 'ok' },
      },
    ]
    const result = extractErrors(events)
    assert.deepEqual(result, [])
  })
})

describe('extractTestResults', () => {
  test('extracts test pass/fail counts from tool_result events matching N passed, N failed', () => {
    const events: ParsedEvent[] = [
      {
        type: 'tool_result',
        timestamp: '2024-01-01T00:00:01Z',
        data: { output: 'Tests complete: 8 passed, 2 failed' },
      },
    ]
    const result = extractTestResults(events)
    assert.ok(result !== null)
    assert.equal(result!.passed, 8)
    assert.equal(result!.failed, 2)
  })

  test('returns null when no test results found', () => {
    const events: ParsedEvent[] = [
      { type: 'session:start', timestamp: '2024-01-01T00:00:00Z', data: {} },
      { type: 'user_message', timestamp: '2024-01-01T00:00:01Z', data: { text: 'Hello' } },
    ]
    const result = extractTestResults(events)
    assert.equal(result, null)
  })

  test("handles pytest-style output ('====== 5 passed, 1 failed ======')", () => {
    const events: ParsedEvent[] = [
      {
        type: 'tool_result',
        timestamp: '2024-01-01T00:00:01Z',
        data: { output: '====== 5 passed, 1 failed ======' },
      },
    ]
    const result = extractTestResults(events)
    assert.ok(result !== null)
    assert.equal(result!.passed, 5)
    assert.equal(result!.failed, 1)
  })

  test("handles all-passing results ('10 passed' -> passed=10, failed=0)", () => {
    const events: ParsedEvent[] = [
      {
        type: 'tool_result',
        timestamp: '2024-01-01T00:00:01Z',
        data: { output: '10 passed' },
      },
    ]
    const result = extractTestResults(events)
    assert.ok(result !== null)
    assert.equal(result!.passed, 10)
    assert.equal(result!.failed, 0)
  })
})

describe('extractGitOperations', () => {
  test('extracts git commit from bash tool_result matching [branch sha] message pattern', () => {
    const events: ParsedEvent[] = [
      {
        type: 'tool_result',
        timestamp: '2024-01-01T00:00:01Z',
        data: { output: '[main abc1234] feat: add new feature\n 3 files changed' },
      },
    ]
    const result = extractGitOperations(events)
    assert.equal(result.length, 1)
    assert.equal(result[0].type, 'commit')
    assert.equal(result[0].sha, 'abc1234')
    assert.equal(result[0].message, 'feat: add new feature')
    assert.equal(result[0].timestamp, '2024-01-01T00:00:01Z')
  })

  test('extracts PR creation from GitHub PR URLs', () => {
    const events: ParsedEvent[] = [
      {
        type: 'tool_result',
        timestamp: '2024-01-01T00:00:02Z',
        data: { output: 'Pull request created: https://github.com/owner/repo/pull/42' },
      },
    ]
    const result = extractGitOperations(events)
    assert.equal(result.length, 1)
    assert.equal(result[0].type, 'pr-create')
    assert.equal(result[0].prUrl, 'https://github.com/owner/repo/pull/42')
    assert.equal(result[0].timestamp, '2024-01-01T00:00:02Z')
  })

  test('returns empty array when no git operations', () => {
    const events: ParsedEvent[] = [
      { type: 'session:start', timestamp: '2024-01-01T00:00:00Z', data: {} },
      {
        type: 'tool_result',
        timestamp: '2024-01-01T00:00:01Z',
        data: { output: 'regular output with no git info' },
      },
    ]
    const result = extractGitOperations(events)
    assert.deepEqual(result, [])
  })
})
