import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { extractFirstPrompt } from '../src/main/events-parser'
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
