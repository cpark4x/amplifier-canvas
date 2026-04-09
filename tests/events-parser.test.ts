import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { extractFirstPrompt, extractSessionStats, deriveSessionTitle } from '../src/main/events-parser'
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
