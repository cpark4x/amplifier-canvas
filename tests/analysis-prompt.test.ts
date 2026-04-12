/**
 * Unit tests for buildAnalysisPrompt (src/main/prompts/analysis.ts)
 *
 * 8 tests covering output format and truncation behaviour.
 * Run with: npx tsx --test tests/analysis-prompt.test.ts
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildAnalysisPrompt, VALID_SECTION_TYPES } from '../src/main/prompts/analysis'
import type { SessionDigest } from '../src/shared/analysisTypes'

// --- Helper ---------------------------------------------------------------

function createMinimalDigest(overrides: Partial<SessionDigest> = {}): SessionDigest {
  return {
    sessionId: 'test-session-1',
    projectSlug: 'test-project',
    duration: {
      startedAt: '2024-01-01T00:00:00Z',
      endedAt: '2024-01-01T01:00:00Z',
    },
    prompts: [{ text: 'Fix the bug', timestamp: '2024-01-01T00:01:00Z' }],
    toolCalls: [{ tool: 'read_file', path: 'src/app.ts', timestamp: '2024-01-01T00:02:00Z' }],
    errors: [],
    testResults: null,
    filesChanged: [{ path: 'src/main.ts', changeType: 'modified' }],
    gitOperations: [],
    ...overrides,
  }
}

// --- Tests ----------------------------------------------------------------

// Test 1: serialized digest content
test('returns string containing serialized digest', () => {
  const result = buildAnalysisPrompt(createMinimalDigest())
  assert.equal(typeof result, 'string')
  assert.ok(result.includes('test-session-1'), 'should contain session ID')
  assert.ok(result.includes('Fix the bug'), 'should contain prompt text')
  assert.ok(result.includes('src/main.ts'), 'should contain file path')
})

// Test 2: JSON schema instructions
test('includes JSON schema instructions', () => {
  const result = buildAnalysisPrompt(createMinimalDigest())
  assert.ok(result.includes('sections'), 'should mention sections')
  assert.ok(result.includes('type'), 'should mention type')
  assert.ok(result.includes('title'), 'should mention title')
  assert.ok(result.includes('content'), 'should mention content')
})

// Test 3: hyphenated section type names ARE present
test('uses hyphenated section type names in instructions', () => {
  const result = buildAnalysisPrompt(createMinimalDigest())
  assert.ok(result.includes('key-moments'), 'should contain key-moments')
  assert.ok(result.includes('next-steps'), 'should contain next-steps')
  assert.ok(result.includes('action-items'), 'should contain action-items')
  assert.ok(result.includes('open-questions'), 'should contain open-questions')
})

// Test 4: underscore section type names are ABSENT
test('does not use underscore section type names in instructions', () => {
  const result = buildAnalysisPrompt(createMinimalDigest())
  assert.ok(!result.includes('key_moments'), 'should not contain key_moments')
  assert.ok(!result.includes('next_steps'), 'should not contain next_steps')
  assert.ok(!result.includes('action_items'), 'should not contain action_items')
  assert.ok(!result.includes('open_questions'), 'should not contain open_questions')
})

// Test 5: prompt truncation at 20
test('truncates prompts exceeding 20 entries', () => {
  const prompts = Array.from({ length: 30 }, (_, i) => ({
    text: `Prompt ${i}`,
    timestamp: '2024-01-01T00:00:00Z',
  }))
  const result = buildAnalysisPrompt(createMinimalDigest({ prompts }))
  assert.ok(result.includes('Prompt 0'), 'Prompt 0 should be present')
  assert.ok(result.includes('Prompt 19'), 'Prompt 19 should be present')
  assert.ok(!result.includes('Prompt 20'), 'Prompt 20 should be truncated')
  assert.ok(result.includes('and 10 more prompts'), 'overflow sentinel should be present')
})

// Test 6: error truncation at 10
test('truncates errors exceeding 10 entries', () => {
  const errors = Array.from({ length: 15 }, (_, i) => ({
    message: `Error ${i}`,
    timestamp: '2024-01-01T00:00:00Z',
  }))
  const result = buildAnalysisPrompt(createMinimalDigest({ errors }))
  assert.ok(result.includes('Error 0'), 'Error 0 should be present')
  assert.ok(result.includes('Error 9'), 'Error 9 should be present')
  assert.ok(!result.includes('Error 10'), 'Error 10 should be truncated')
})

// Test 7: fileChanges truncation at 50
test('truncates fileChanges exceeding 50 entries', () => {
  const filesChanged = Array.from({ length: 60 }, (_, i) => ({
    path: `src/file-${i}.ts`,
    changeType: 'modified' as const,
  }))
  const result = buildAnalysisPrompt(createMinimalDigest({ filesChanged }))
  assert.ok(result.includes('file-0.ts'), 'file-0.ts should be present')
  assert.ok(result.includes('file-49.ts'), 'file-49.ts should be present')
  assert.ok(!result.includes('file-50.ts'), 'file-50.ts should be truncated')
})

// Test 8: VALID_SECTION_TYPES exact union
test('VALID_SECTION_TYPES matches exact union of all 7 section types', () => {
  const expected = [
    'summary',
    'changes',
    'key-moments',
    'next-steps',
    'decisions',
    'action-items',
    'open-questions',
  ]
  assert.deepEqual(VALID_SECTION_TYPES, expected)
})
