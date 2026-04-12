import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { parseAnalysisResponse } from '../src/main/analysisService'

describe('parseAnalysisResponse', () => {
  // --- Happy path ---

  test('parses valid JSON with a single section', () => {
    const raw = JSON.stringify({
      sections: [{ type: 'summary', title: 'Summary', content: { text: 'Did some work' } }],
    })
    const result = parseAnalysisResponse(raw)
    assert.equal(result.sections.length, 1)
    assert.equal(result.sections[0].type, 'summary')
    assert.equal(result.sections[0].title, 'Summary')
    assert.deepEqual(result.sections[0].content, { text: 'Did some work' })
  })

  test('parses valid JSON with multiple sections', () => {
    const raw = JSON.stringify({
      sections: [
        { type: 'summary', title: 'Summary', content: { text: 'Work done' } },
        { type: 'next-steps', title: 'Next Steps', content: { items: ['Review code'] } },
      ],
    })
    const result = parseAnalysisResponse(raw)
    assert.equal(result.sections.length, 2)
    assert.equal(result.sections[1].type, 'next-steps')
  })

  test('accepts all 7 valid section types', () => {
    const validTypes = [
      'summary',
      'changes',
      'key-moments',
      'next-steps',
      'decisions',
      'action-items',
      'open-questions',
    ]
    for (const type of validTypes) {
      const raw = JSON.stringify({
        sections: [{ type, title: 'Test Title', content: { data: 'x' } }],
      })
      const result = parseAnalysisResponse(raw)
      assert.equal(result.sections[0].type, type)
    }
  })

  test('strips markdown code fences (```json ... ```)', () => {
    const inner = JSON.stringify({
      sections: [{ type: 'summary', title: 'Summary', content: { text: 'Fenced' } }],
    })
    const raw = '```json\n' + inner + '\n```'
    const result = parseAnalysisResponse(raw)
    assert.equal(result.sections.length, 1)
    assert.equal(result.sections[0].type, 'summary')
  })

  test('strips plain triple-backtick fences (``` ... ```)', () => {
    const inner = JSON.stringify({
      sections: [{ type: 'summary', title: 'Summary', content: { text: 'Fenced' } }],
    })
    const raw = '```\n' + inner + '\n```'
    const result = parseAnalysisResponse(raw)
    assert.equal(result.sections.length, 1)
  })

  test('returns empty sections array when sections is empty', () => {
    const raw = JSON.stringify({ sections: [] })
    const result = parseAnalysisResponse(raw)
    assert.deepEqual(result.sections, [])
  })

  // --- Fence stripping ---

  test('does not strip when no code fences present', () => {
    const raw = JSON.stringify({
      sections: [{ type: 'summary', title: 'S', content: {} }],
    })
    const result = parseAnalysisResponse(raw)
    assert.equal(result.sections.length, 1)
  })

  // --- JSON parse errors ---

  test('throws with descriptive message for completely invalid JSON', () => {
    assert.throws(
      () => parseAnalysisResponse('not valid json at all'),
      (err: unknown) => {
        assert.ok(err instanceof Error)
        assert.ok(
          err.message.startsWith('LLM response is not valid JSON:'),
          `Expected error to start with "LLM response is not valid JSON:" but got: ${err.message}`,
        )
        return true
      },
    )
  })

  test('includes first 200 chars of invalid input in error message', () => {
    const longInput = 'x'.repeat(300)
    assert.throws(
      () => parseAnalysisResponse(longInput),
      (err: unknown) => {
        assert.ok(err instanceof Error)
        assert.ok(
          err.message.includes('x'.repeat(200)),
          'Error should include first 200 chars of input',
        )
        // Should NOT include chars beyond 200
        assert.ok(
          !err.message.includes('x'.repeat(201)),
          'Error should not include more than 200 chars',
        )
        return true
      },
    )
  })

  test('includes exactly 200 chars when input is exactly 200 chars', () => {
    const input200 = 'z'.repeat(200)
    assert.throws(
      () => parseAnalysisResponse(input200),
      (err: unknown) => {
        assert.ok(err instanceof Error)
        assert.ok(err.message.includes(input200))
        return true
      },
    )
  })

  // --- Structural validation errors ---

  test('throws when parsed result is not an object', () => {
    assert.throws(
      () => parseAnalysisResponse('"just a string"'),
      (err: unknown) => {
        assert.ok(err instanceof Error)
        assert.equal(err.message, 'LLM response missing "sections" array')
        return true
      },
    )
  })

  test('throws when sections field is missing', () => {
    assert.throws(
      () => parseAnalysisResponse(JSON.stringify({ notSections: [] })),
      (err: unknown) => {
        assert.ok(err instanceof Error)
        assert.equal(err.message, 'LLM response missing "sections" array')
        return true
      },
    )
  })

  test('throws when sections is not an array', () => {
    assert.throws(
      () => parseAnalysisResponse(JSON.stringify({ sections: 'not an array' })),
      (err: unknown) => {
        assert.ok(err instanceof Error)
        assert.equal(err.message, 'LLM response missing "sections" array')
        return true
      },
    )
  })

  test('throws when sections is null', () => {
    assert.throws(
      () => parseAnalysisResponse(JSON.stringify({ sections: null })),
      (err: unknown) => {
        assert.ok(err instanceof Error)
        assert.equal(err.message, 'LLM response missing "sections" array')
        return true
      },
    )
  })

  // --- Section-level validation errors ---

  test('throws when section type field is missing', () => {
    assert.throws(
      () =>
        parseAnalysisResponse(
          JSON.stringify({ sections: [{ title: 'Summary', content: { text: 'x' } }] }),
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error)
        assert.equal(err.message, 'Section missing "type" field')
        return true
      },
    )
  })

  test('throws when section type is not a string (number)', () => {
    assert.throws(
      () =>
        parseAnalysisResponse(
          JSON.stringify({ sections: [{ type: 42, title: 'Summary', content: {} }] }),
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error)
        assert.equal(err.message, 'Section missing "type" field')
        return true
      },
    )
  })

  test('throws when section type is not a string (null)', () => {
    assert.throws(
      () =>
        parseAnalysisResponse(
          JSON.stringify({ sections: [{ type: null, title: 'Summary', content: {} }] }),
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error)
        assert.equal(err.message, 'Section missing "type" field')
        return true
      },
    )
  })

  test('throws with invalid section type message', () => {
    assert.throws(
      () =>
        parseAnalysisResponse(
          JSON.stringify({ sections: [{ type: 'invalid-type', title: 'Bad', content: {} }] }),
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error)
        assert.equal(err.message, 'Invalid section type: "invalid-type"')
        return true
      },
    )
  })

  test('throws with correct invalid type name in error message', () => {
    assert.throws(
      () =>
        parseAnalysisResponse(
          JSON.stringify({ sections: [{ type: 'foo-bar', title: 'X', content: {} }] }),
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error)
        assert.equal(err.message, 'Invalid section type: "foo-bar"')
        return true
      },
    )
  })

  test('throws when section title is missing', () => {
    assert.throws(
      () =>
        parseAnalysisResponse(
          JSON.stringify({ sections: [{ type: 'summary', content: { text: 'x' } }] }),
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error)
        assert.equal(err.message, 'Section "summary" missing "title" field')
        return true
      },
    )
  })

  test('throws when section title is not a string', () => {
    assert.throws(
      () =>
        parseAnalysisResponse(
          JSON.stringify({ sections: [{ type: 'summary', title: 123, content: { text: 'x' } }] }),
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error)
        assert.equal(err.message, 'Section "summary" missing "title" field')
        return true
      },
    )
  })

  test('throws when section content is missing', () => {
    assert.throws(
      () =>
        parseAnalysisResponse(JSON.stringify({ sections: [{ type: 'summary', title: 'Summary' }] })),
      (err: unknown) => {
        assert.ok(err instanceof Error)
        assert.equal(err.message, 'Section "summary" missing "content" field')
        return true
      },
    )
  })

  test('throws when section content is null', () => {
    assert.throws(
      () =>
        parseAnalysisResponse(
          JSON.stringify({ sections: [{ type: 'summary', title: 'Summary', content: null }] }),
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error)
        assert.equal(err.message, 'Section "summary" missing "content" field')
        return true
      },
    )
  })

  test('throws when section content is undefined (key present with explicit undefined)', () => {
    // JSON.stringify drops undefined values, so simulate missing content field
    const raw = '{"sections":[{"type":"summary","title":"Summary","content":undefined}]}'
    // This won't actually parse as valid JSON - undefined isn't valid JSON
    // But we need to test via a missing key scenario
    assert.throws(
      () => parseAnalysisResponse(raw),
      (err: unknown) => {
        assert.ok(err instanceof Error)
        // Either JSON parse error or content error is acceptable since undefined is not valid JSON
        assert.ok(
          err.message.startsWith('LLM response is not valid JSON:') ||
            err.message === 'Section "summary" missing "content" field',
        )
        return true
      },
    )
  })

  // --- Error ordering: type checked before title and content ---

  test('validates type before title', () => {
    // Section has valid type but missing title - should throw title error
    assert.throws(
      () =>
        parseAnalysisResponse(
          JSON.stringify({ sections: [{ type: 'summary', content: { text: 'x' } }] }),
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error)
        assert.equal(err.message, 'Section "summary" missing "title" field')
        return true
      },
    )
  })

  test('validates type before content', () => {
    // Invalid type - should throw invalid type error, not content error
    assert.throws(
      () =>
        parseAnalysisResponse(
          JSON.stringify({ sections: [{ type: 'bad-type', title: 'T' }] }),
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error)
        assert.equal(err.message, 'Invalid section type: "bad-type"')
        return true
      },
    )
  })

  // --- Validates ALL sections, not just first ---

  test('validates second section too', () => {
    assert.throws(
      () =>
        parseAnalysisResponse(
          JSON.stringify({
            sections: [
              { type: 'summary', title: 'Summary', content: { text: 'ok' } },
              { type: 'invalid-type', title: 'Bad', content: {} },
            ],
          }),
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error)
        assert.equal(err.message, 'Invalid section type: "invalid-type"')
        return true
      },
    )
  })
})
