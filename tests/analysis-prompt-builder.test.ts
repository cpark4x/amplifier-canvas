/**
 * Tests for task-7-prompt-builder: Analysis prompt builder (src/main/prompts/analysis.ts)
 *
 * RED: These tests will fail until the implementation is created.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { buildAnalysisPrompt, VALID_SECTION_TYPES } from '../src/main/prompts/analysis'
import type { SessionDigest } from '../src/shared/analysisTypes'

// --- Helper to create a minimal SessionDigest ---

function makeDigest(overrides: Partial<SessionDigest> = {}): SessionDigest {
  return {
    sessionId: 'session-123',
    projectSlug: 'my-project',
    duration: { startedAt: '2024-01-01T00:00:00Z', endedAt: '2024-01-01T01:00:00Z' },
    prompts: [{ text: 'Fix the auth bug', timestamp: '2024-01-01T00:01:00Z' }],
    toolCalls: [{ tool: 'read_file', path: 'src/auth.ts', timestamp: '2024-01-01T00:02:00Z' }],
    errors: [],
    testResults: null,
    filesChanged: [],
    gitOperations: [],
    ...overrides,
  }
}

// --- VALID_SECTION_TYPES ---

describe('VALID_SECTION_TYPES', () => {
  test('is exported as an array', () => {
    assert.ok(Array.isArray(VALID_SECTION_TYPES))
  })

  test('contains exactly 7 entries', () => {
    assert.equal(VALID_SECTION_TYPES.length, 7)
  })

  test('contains all 7 hyphenated section type names', () => {
    const expected = [
      'summary',
      'changes',
      'key-moments',
      'next-steps',
      'decisions',
      'action-items',
      'open-questions',
    ]
    for (const type of expected) {
      assert.ok(VALID_SECTION_TYPES.includes(type as never), `missing type: ${type}`)
    }
  })
})

// --- buildAnalysisPrompt ---

describe('buildAnalysisPrompt', () => {
  test('returns a string', () => {
    const result = buildAnalysisPrompt(makeDigest())
    assert.equal(typeof result, 'string')
  })

  test('result contains serialized sessionId from the digest', () => {
    const digest = makeDigest({ sessionId: 'session-xyz-unique' })
    const result = buildAnalysisPrompt(digest)
    assert.ok(result.includes('session-xyz-unique'), 'result should contain sessionId')
  })

  test('result contains serialized projectSlug from the digest', () => {
    const digest = makeDigest({ projectSlug: 'my-special-project' })
    const result = buildAnalysisPrompt(digest)
    assert.ok(result.includes('my-special-project'), 'result should contain projectSlug')
  })

  test('result contains system instructions (JSON schema mention)', () => {
    const result = buildAnalysisPrompt(makeDigest())
    // System instructions should describe the role or format
    assert.ok(result.includes('summary'), 'result should mention summary in system instructions')
    assert.ok(result.includes('sections'), 'result should mention sections schema')
  })

  test('result contains serialized digest JSON', () => {
    const digest = makeDigest()
    const result = buildAnalysisPrompt(digest)
    // The digest should be JSON-serialized within the prompt
    assert.ok(result.includes('"sessionId"'), 'result should contain serialized digest JSON key')
    assert.ok(result.includes('"projectSlug"'), 'result should contain serialized digest JSON key')
  })
})

// --- Truncation ---

describe('truncateDigest (via buildAnalysisPrompt)', () => {
  test('prompts are truncated to MAX_PROMPTS (20)', () => {
    const manyPrompts = Array.from({ length: 25 }, (_, i) => ({
      text: `Prompt number ${i}`,
      timestamp: `2024-01-01T00:${String(i).padStart(2, '0')}:00Z`,
    }))
    const digest = makeDigest({ prompts: manyPrompts })
    const result = buildAnalysisPrompt(digest)

    // The sentinel message should appear
    assert.ok(result.includes('more prompts'), `expected truncation sentinel, got: ${result.slice(0, 200)}`)

    // Prompt number 24 (the 25th) should NOT appear in the prompt text values
    // since we truncate to 20 and add a sentinel
    assert.ok(!result.includes('Prompt number 24'), 'prompt 24 should be truncated away')
  })

  test('truncated prompts sentinel contains the correct overflow count', () => {
    // 25 prompts, MAX=20, so 5 overflow
    const manyPrompts = Array.from({ length: 25 }, (_, i) => ({
      text: `Prompt ${i}`,
      timestamp: '2024-01-01T00:00:00Z',
    }))
    const digest = makeDigest({ prompts: manyPrompts })
    const result = buildAnalysisPrompt(digest)
    assert.ok(result.includes('5 more prompts'), `expected "5 more prompts" sentinel in result`)
  })

  test('prompts under MAX_PROMPTS are not truncated', () => {
    const fewPrompts = Array.from({ length: 5 }, (_, i) => ({
      text: `Short prompt ${i}`,
      timestamp: '2024-01-01T00:00:00Z',
    }))
    const digest = makeDigest({ prompts: fewPrompts })
    const result = buildAnalysisPrompt(digest)
    assert.ok(!result.includes('more prompts'), 'should not truncate when under limit')
  })

  test('errors are truncated to MAX_ERRORS (10)', () => {
    const manyErrors = Array.from({ length: 15 }, (_, i) => ({
      message: `Error number ${i}`,
      timestamp: '2024-01-01T00:00:00Z',
    }))
    const digest = makeDigest({ errors: manyErrors })
    const result = buildAnalysisPrompt(digest)
    // Error 14 should not appear in the serialized output
    assert.ok(!result.includes('Error number 14'), 'error 14 should be truncated away')
    assert.ok(!result.includes('Error number 10'), 'error 10 should be truncated away')
    assert.ok(result.includes('Error number 9'), 'error 9 (10th, index 9) should appear')
  })

  test('filesChanged are truncated to MAX_FILE_CHANGES (50)', () => {
    const manyFiles = Array.from({ length: 60 }, (_, i) => ({
      path: `src/file${i}.ts`,
      changeType: 'modified' as const,
    }))
    const digest = makeDigest({ filesChanged: manyFiles })
    const result = buildAnalysisPrompt(digest)
    // file59 (index 59) should not appear
    assert.ok(!result.includes('src/file59.ts'), 'file59 should be truncated away')
    assert.ok(!result.includes('src/file50.ts'), 'file50 should be truncated away')
    assert.ok(result.includes('src/file49.ts'), 'file49 (50th) should appear')
  })

  test('gitOperations are truncated to MAX_GIT_OPERATIONS (20)', () => {
    const manyOps = Array.from({ length: 25 }, (_, i) => ({
      type: 'commit' as const,
      timestamp: '2024-01-01T00:00:00Z',
      message: `Commit number ${i}`,
      sha: `sha${i}`,
    }))
    const digest = makeDigest({ gitOperations: manyOps })
    const result = buildAnalysisPrompt(digest)
    // Operation 24 (index 24) should not appear
    assert.ok(!result.includes('Commit number 24'), 'commit 24 should be truncated away')
    assert.ok(!result.includes('Commit number 20'), 'commit 20 should be truncated away')
    assert.ok(result.includes('Commit number 19'), 'commit 19 (20th) should appear')
  })
})
