/**
 * Tests for task-5-llm-wrapper: LLM subprocess wrapper (src/main/llm.ts)
 *
 * Strategy: Real shell scripts in temp directories simulate the amplifier binary.
 * PATH manipulation + _resetBinaryCache() control which binary is discovered.
 * Each test calls loadLlm() to get a fresh module with null cachedBinaryPath.
 */

import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'

const _require = createRequire(import.meta.url)

// --------------------------------------------------------------------------
// Module loader — always returns a fresh module instance (null cache)
// --------------------------------------------------------------------------

function loadLlm(): {
  resolveAmplifierBinary: () => string
  _resetBinaryCache: () => void
  invokeLLM: (
    prompt: string,
    options?: { model?: string; provider?: string; timeoutMs?: number },
  ) => Promise<string>
} {
  const key = _require.resolve('../src/main/llm.ts')
  delete _require.cache[key]
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return _require('../src/main/llm.ts')
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

/**
 * Create a fake "amplifier" shell script at <dir>/amplifier.
 * Returns the path to the binary.
 */
function createFakeBinary(dir: string, script: string): string {
  const binPath = join(dir, 'amplifier')
  writeFileSync(binPath, `#!/bin/sh\n${script}`, { mode: 0o755 })
  return binPath
}

// --------------------------------------------------------------------------
// Lifecycle
// --------------------------------------------------------------------------

let tmpDir: string
let originalPath: string | undefined
let originalHome: string | undefined

beforeEach(() => {
  originalPath = process.env.PATH
  originalHome = process.env.HOME
  tmpDir = mkdtempSync(join(tmpdir(), 'llm-test-'))
})

afterEach(() => {
  if (originalPath !== undefined) process.env.PATH = originalPath
  else delete process.env.PATH
  if (originalHome !== undefined) process.env.HOME = originalHome
  else delete process.env.HOME
  rmSync(tmpDir, { recursive: true, force: true })
})

// ─── resolveAmplifierBinary ───────────────────────────────────────────────

describe('resolveAmplifierBinary', () => {
  test('finds binary via PATH using which', () => {
    createFakeBinary(tmpDir, 'echo "fake amplifier"')
    process.env.PATH = `${tmpDir}:/usr/bin:/bin`

    const { resolveAmplifierBinary } = loadLlm()
    const result = resolveAmplifierBinary()

    assert.ok(
      result.endsWith('amplifier'),
      `Expected result to end with 'amplifier', got: ${result}`,
    )
  })

  test('finds binary via fallback ~/.local/bin when not in PATH', () => {
    // Place binary in ~/.local/bin/amplifier (relative to fake HOME)
    const localBin = join(tmpDir, '.local', 'bin')
    mkdirSync(localBin, { recursive: true })
    createFakeBinary(localBin, 'echo "local bin amplifier"')

    process.env.HOME = tmpDir
    process.env.PATH = '/nonexistent-path-xyz' // force which to fail

    const { resolveAmplifierBinary } = loadLlm()
    const result = resolveAmplifierBinary()

    assert.ok(
      result.endsWith('amplifier'),
      `Expected result to end with 'amplifier', got: ${result}`,
    )
    assert.ok(
      result.includes('.local'),
      `Expected fallback path to include '.local', got: ${result}`,
    )
  })

  test('throws descriptive error when binary not found anywhere', () => {
    process.env.PATH = '/nonexistent-path-xyz'
    process.env.HOME = tmpDir // no amplifier in any fallback locations

    const { resolveAmplifierBinary } = loadLlm()

    assert.throws(
      () => resolveAmplifierBinary(),
      (err: unknown) => {
        assert.ok(err instanceof Error, 'Should throw an Error instance')
        assert.ok(
          err.message.toLowerCase().includes('amplifier'),
          `Error should mention 'amplifier': ${err.message}`,
        )
        return true
      },
    )
  })

  test('caches resolved path on subsequent calls', () => {
    createFakeBinary(tmpDir, 'echo "fake"')
    process.env.PATH = `${tmpDir}:/usr/bin:/bin`

    const { resolveAmplifierBinary } = loadLlm() // single module instance
    const first = resolveAmplifierBinary() // caches path

    // Make binary unreachable — cache should still return the first result
    process.env.PATH = '/nonexistent-path-xyz'

    const second = resolveAmplifierBinary()
    assert.equal(second, first, 'Second call should return cached path')
  })
})

// ─── _resetBinaryCache ────────────────────────────────────────────────────

describe('_resetBinaryCache', () => {
  test('clears cached path so next call re-resolves', () => {
    createFakeBinary(tmpDir, 'echo "fake"')
    process.env.PATH = `${tmpDir}:/usr/bin:/bin`

    const { resolveAmplifierBinary, _resetBinaryCache } = loadLlm()
    resolveAmplifierBinary() // populate cache

    // Remove binary and make it unreachable everywhere
    rmSync(join(tmpDir, 'amplifier'))
    process.env.PATH = '/nonexistent-path-xyz'
    process.env.HOME = tmpDir // no amplifier in fallback locations either

    _resetBinaryCache() // clear the cache

    assert.throws(
      () => resolveAmplifierBinary(),
      /amplifier/i,
      'Should throw after cache is cleared and binary is gone',
    )
  })
})

// ─── invokeLLM ────────────────────────────────────────────────────────────

describe('invokeLLM', () => {
  beforeEach(() => {
    // Default binary: drain stdin and emit valid JSON
    createFakeBinary(
      tmpDir,
      `
cat - > /dev/null
echo '{"response": "test response"}'
`,
    )
    process.env.PATH = `${tmpDir}:/usr/bin:/bin`
  })

  test('resolves with response string from JSON output', async () => {
    const { invokeLLM } = loadLlm()
    const result = await invokeLLM('hello world')
    assert.equal(result, 'test response')
  })

  test('strips non-JSON preamble lines before first { line', async () => {
    createFakeBinary(
      tmpDir,
      `
cat - > /dev/null
echo "Loading model..."
echo "Preparing workspace..."
echo '{"response": "preamble stripped"}'
`,
    )
    const { invokeLLM } = loadLlm()
    const result = await invokeLLM('test prompt')
    assert.equal(result, 'preamble stripped')
  })

  test('passes --model flag when model option is provided', async () => {
    createFakeBinary(
      tmpDir,
      `
cat - > /dev/null
echo "{\\"response\\": \\"args: $*\\"}"
`,
    )
    const { invokeLLM } = loadLlm()
    const result = await invokeLLM('test', { model: 'claude-haiku' })
    assert.ok(result.includes('--model'), `Should include --model, got: ${result}`)
    assert.ok(result.includes('claude-haiku'), `Should include model name, got: ${result}`)
  })

  test('passes --provider flag when provider option is provided', async () => {
    createFakeBinary(
      tmpDir,
      `
cat - > /dev/null
echo "{\\"response\\": \\"args: $*\\"}"
`,
    )
    const { invokeLLM } = loadLlm()
    const result = await invokeLLM('test', { provider: 'anthropic' })
    assert.ok(result.includes('--provider'), `Should include --provider, got: ${result}`)
    assert.ok(result.includes('anthropic'), `Should include provider name, got: ${result}`)
  })

  test('rejects with descriptive error on non-zero exit code', async () => {
    createFakeBinary(
      tmpDir,
      `
cat - > /dev/null
echo "error output" >&2
exit 1
`,
    )
    const { invokeLLM } = loadLlm()
    await assert.rejects(
      () => invokeLLM('test'),
      (err: unknown) => {
        assert.ok(err instanceof Error, 'Should reject with Error')
        assert.ok(err.message.length > 0, 'Error message should not be empty')
        return true
      },
    )
  })

  test('rejects with timeout error and kills process', async () => {
    createFakeBinary(
      tmpDir,
      `
cat - > /dev/null
sleep 10
`,
    )
    const { invokeLLM } = loadLlm()
    await assert.rejects(
      () => invokeLLM('test', { timeoutMs: 150 }),
      (err: unknown) => {
        assert.ok(err instanceof Error, 'Should reject with Error')
        assert.ok(
          err.message.toLowerCase().includes('timeout'),
          `Error should mention 'timeout': ${err.message}`,
        )
        return true
      },
    )
  })

  test('rejects when output contains no JSON', async () => {
    createFakeBinary(
      tmpDir,
      `
cat - > /dev/null
echo "just some plain text output with no JSON at all"
`,
    )
    const { invokeLLM } = loadLlm()
    await assert.rejects(
      () => invokeLLM('test'),
      (err: unknown) => {
        assert.ok(err instanceof Error, 'Should reject with Error')
        assert.ok(err.message.length > 0, 'Error message should not be empty')
        return true
      },
    )
  })

  test('rejects when JSON output is missing the response field', async () => {
    createFakeBinary(
      tmpDir,
      `
cat - > /dev/null
echo '{"other_field": "some value", "no_response_here": true}'
`,
    )
    const { invokeLLM } = loadLlm()
    await assert.rejects(
      () => invokeLLM('test'),
      (err: unknown) => {
        assert.ok(err instanceof Error, 'Should reject with Error')
        assert.ok(
          err.message.toLowerCase().includes('response'),
          `Error should mention 'response' field: ${err.message}`,
        )
        return true
      },
    )
  })

  test('invokeLLM is exported and returns Promise<string>', () => {
    const { invokeLLM } = loadLlm()
    assert.equal(typeof invokeLLM, 'function', 'invokeLLM should be a function')
    // Create a binary that immediately responds (no hanging)
    const promise = invokeLLM('test')
    assert.ok(promise instanceof Promise, 'invokeLLM should return a Promise')
    // Clean up — let it resolve naturally
    promise.catch(() => {}) // suppress unhandled rejection
  })
})
