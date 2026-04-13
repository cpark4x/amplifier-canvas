/**
 * Tests for task-6-llm-wrapper-tests: LLM subprocess wrapper (src/main/llm.ts)
 *
 * Strategy: Mock child_process.spawn and fs.existsSync to avoid real subprocess
 * calls. Uses createFakeProc() to simulate a fake ChildProcess with EventEmitter-
 * based stdout/stderr and controllable close events.
 */

import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'

const _require = createRequire(import.meta.url)

// --------------------------------------------------------------------------
// Fake ChildProcess helper
// --------------------------------------------------------------------------

/**
 * Returns a fake ChildProcess with:
 *   - EventEmitter-based stdout and stderr
 *   - mock stdin.write / stdin.end (call counts tracked)
 *   - mock kill (call count tracked)
 *   - emitClose(code) helper to trigger the 'close' event
 */
function createFakeProc(): any {
  const proc: any = new EventEmitter()
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()

  let writeCount = 0
  let endCount = 0
  let killCount = 0

  proc.stdin = {
    write(_data: unknown) {
      writeCount++
    },
    end() {
      endCount++
    },
    get writeCount() {
      return writeCount
    },
    get endCount() {
      return endCount
    },
  }

  proc.kill = () => {
    killCount++
  }

  Object.defineProperty(proc, 'killCount', { get: () => killCount })

  proc.emitClose = (code: number) => proc.emit('close', code)

  return proc
}

// --------------------------------------------------------------------------
// CJS module refs for mocking (same module instances used by llm.ts)
// --------------------------------------------------------------------------

const cp = _require('child_process')
const fsModule = _require('fs')

// --------------------------------------------------------------------------
// Test state
// --------------------------------------------------------------------------

let originalSpawn: unknown
let originalExistsSync: unknown
let fakeProc: any
let spawnArgs: string[]
let llm: any

// --------------------------------------------------------------------------
// Lifecycle hooks
// --------------------------------------------------------------------------

beforeEach(() => {
  fakeProc = createFakeProc()
  spawnArgs = []

  // Save originals so afterEach can restore them
  originalSpawn = cp.spawn
  originalExistsSync = fsModule.existsSync

  // Mock spawn: capture args and return fakeProc
  cp.spawn = (_binary: string, args: string[]) => {
    spawnArgs = args
    return fakeProc
  }

  // Mock existsSync to return true so binary resolution always succeeds
  fsModule.existsSync = () => true

  // Clear module cache so fresh import picks up mocked spawn / existsSync
  const key = _require.resolve('../src/main/llm.ts')
  delete _require.cache[key]
  llm = _require('../src/main/llm.ts')

  // Reset cached binary path on the freshly loaded module
  llm._resetBinaryCache()
})

afterEach(() => {
  cp.spawn = originalSpawn
  fsModule.existsSync = originalExistsSync
})

// --------------------------------------------------------------------------
// Tests (7)
// --------------------------------------------------------------------------

test('returns response string from valid JSON output', async () => {
  const promise = llm.invokeLLM('hello world')

  setImmediate(() => {
    fakeProc.stdout.emit('data', Buffer.from('{"response":"Hello from LLM"}'))
    fakeProc.emitClose(0)
  })

  const result = await promise
  assert.equal(result, 'Hello from LLM')
  assert.equal(fakeProc.stdin.writeCount, 1, 'stdin.write should be called once')
  assert.equal(fakeProc.stdin.endCount, 1, 'stdin.end should be called once')
})

test('strips preamble lines before JSON', async () => {
  const promise = llm.invokeLLM('hello')

  setImmediate(() => {
    fakeProc.stdout.emit(
      'data',
      Buffer.from('Loading model...\nInitializing...\n{"response":"Preamble stripped"}'),
    )
    fakeProc.emitClose(0)
  })

  const result = await promise
  assert.equal(result, 'Preamble stripped')
})

test('throws on non-zero exit code', async () => {
  const promise = llm.invokeLLM('hello')

  setImmediate(() => {
    fakeProc.stderr.emit('data', Buffer.from('API key invalid'))
    fakeProc.emitClose(1)
  })

  await assert.rejects(promise, (err: Error) => {
    assert.ok(
      err.message.includes('exited with code 1'),
      `Expected 'exited with code 1' in: ${err.message}`,
    )
    assert.ok(
      err.message.includes('API key invalid'),
      `Expected 'API key invalid' in: ${err.message}`,
    )
    return true
  })
})

test('throws on malformed JSON output', async () => {
  const promise = llm.invokeLLM('hello')

  setImmediate(() => {
    fakeProc.stdout.emit('data', Buffer.from('not json at all'))
    fakeProc.emitClose(0)
  })

  await assert.rejects(promise, (err: Error) => {
    assert.ok(
      err.message.includes('No JSON found'),
      `Expected 'No JSON found' in: ${err.message}`,
    )
    return true
  })
})

test('throws when JSON valid but missing response field', async () => {
  const promise = llm.invokeLLM('hello')

  setImmediate(() => {
    fakeProc.stdout.emit('data', Buffer.from('{"data":"no response field"}'))
    fakeProc.emitClose(0)
  })

  await assert.rejects(promise, (err: Error) => {
    assert.ok(
      err.message.includes('missing "response" field'),
      `Expected 'missing "response" field' in: ${err.message}`,
    )
    return true
  })
})

test('passes model and provider as CLI flags', async () => {
  const promise = llm.invokeLLM('hello', { model: 'claude-haiku-4-5', provider: 'bedrock' })

  // spawn args are captured synchronously during invokeLLM()
  assert.ok(
    spawnArgs.includes('--model'),
    `Expected '--model' in spawn args: [${spawnArgs.join(', ')}]`,
  )
  assert.ok(
    spawnArgs.includes('claude-haiku-4-5'),
    `Expected 'claude-haiku-4-5' in spawn args: [${spawnArgs.join(', ')}]`,
  )
  assert.ok(
    spawnArgs.includes('--provider'),
    `Expected '--provider' in spawn args: [${spawnArgs.join(', ')}]`,
  )
  assert.ok(
    spawnArgs.includes('bedrock'),
    `Expected 'bedrock' in spawn args: [${spawnArgs.join(', ')}]`,
  )

  // Resolve the promise cleanly so the test does not hang
  setImmediate(() => {
    fakeProc.stdout.emit('data', Buffer.from('{"response":"ok"}'))
    fakeProc.emitClose(0)
  })

  await promise
})

test('times out and kills process', async () => {
  await assert.rejects(
    llm.invokeLLM('hello', { timeoutMs: 50 }),
    (err: Error) => {
      assert.ok(
        err.message.includes('timed out'),
        `Expected 'timed out' in: ${err.message}`,
      )
      return true
    },
  )

  assert.equal(fakeProc.killCount, 1, 'kill should be called once')
})
