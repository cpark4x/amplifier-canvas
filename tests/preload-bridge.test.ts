/**
 * Unit tests for the preload bridge analysis methods.
 * Verifies that getAnalysis, triggerAnalysis, and onAnalysisReady
 * are exposed on the api object and call the correct IPC channels.
 *
 * Strategy: inject mocked electron into require.cache before loading
 * the preload module, then capture the exposed api via contextBridge mock.
 */

import { test, describe, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import Module from 'node:module'
import path from 'node:path'

// --------------------------------------------------------------------------
// Tracked calls for mock ipcRenderer
// --------------------------------------------------------------------------

const invokeCalls: Array<{ channel: string; args: unknown }> = []
const onCalls: Array<{ channel: string; handler: Function }> = []
const removeCalls: Array<{ channel: string; handler: Function }> = []

const mockIpcRenderer = {
  send(_channel: string, _args: unknown) {},
  invoke(channel: string, args: unknown): Promise<unknown> {
    invokeCalls.push({ channel, args })
    return Promise.resolve(null)
  },
  on(channel: string, handler: Function) {
    onCalls.push({ channel, handler })
  },
  removeListener(channel: string, handler: Function) {
    removeCalls.push({ channel, handler })
  },
}

// --------------------------------------------------------------------------
// Capture what contextBridge exposes
// --------------------------------------------------------------------------

let exposedApi: Record<string, unknown> = {}

const mockContextBridge = {
  exposeInMainWorld(_key: string, api: Record<string, unknown>) {
    exposedApi = api
  },
}

// --------------------------------------------------------------------------
// Inject cache stubs
// --------------------------------------------------------------------------

type CacheEntry = NodeJS.Module & { exports: unknown }

function injectCache(specifier: string, exports: unknown): void {
  const id =
    specifier === 'electron'
      ? require.resolve('electron')
      : require.resolve(path.resolve(__dirname, specifier))

  const entry: CacheEntry = {
    id,
    filename: id,
    loaded: true,
    exports,
    parent: undefined,
    children: [],
    path: path.dirname(id),
    paths: [],
    require: Module.createRequire(id),
    load: function (filename: string) { void filename },
    isPreloading: false,
  } as unknown as CacheEntry

  require.cache[id] = entry
}

// Inject electron stub before loading preload module
injectCache('electron', {
  contextBridge: mockContextBridge,
  ipcRenderer: mockIpcRenderer,
})

// --------------------------------------------------------------------------
// Load preload module AFTER stubs are in place
// --------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('../src/preload/index.ts')

// --------------------------------------------------------------------------
// IPC channel constants (mirrors src/shared/types.ts)
// --------------------------------------------------------------------------

const CH = {
  GET_ANALYSIS: 'analysis:get',
  TRIGGER_ANALYSIS: 'analysis:trigger',
  ANALYSIS_READY: 'analysis:ready',
}

// --------------------------------------------------------------------------
// Reset helpers
// --------------------------------------------------------------------------

function reset() {
  invokeCalls.length = 0
  onCalls.length = 0
  removeCalls.length = 0
}

// Cleanup after all tests
after(() => {
  delete require.cache[require.resolve('electron')]
})

// --------------------------------------------------------------------------
// Test suite
// --------------------------------------------------------------------------

describe('preload bridge — analysis methods', () => {
  beforeEach(() => reset())

  // ---------- getAnalysis ----------

  test('api exposes getAnalysis method', () => {
    assert.ok(
      typeof exposedApi.getAnalysis === 'function',
      'getAnalysis must be a function on the exposed api',
    )
  })

  test('getAnalysis calls ipcRenderer.invoke with GET_ANALYSIS channel and sessionId', async () => {
    const getAnalysis = exposedApi.getAnalysis as (sessionId: string) => Promise<unknown>
    await getAnalysis('session-abc')

    assert.equal(invokeCalls.length, 1, 'invoke must be called exactly once')
    assert.equal(invokeCalls[0].channel, CH.GET_ANALYSIS, 'must use GET_ANALYSIS channel')
    assert.deepEqual(invokeCalls[0].args, { sessionId: 'session-abc' }, 'must pass sessionId')
  })

  // ---------- triggerAnalysis ----------

  test('api exposes triggerAnalysis method', () => {
    assert.ok(
      typeof exposedApi.triggerAnalysis === 'function',
      'triggerAnalysis must be a function on the exposed api',
    )
  })

  test('triggerAnalysis calls ipcRenderer.invoke with TRIGGER_ANALYSIS channel and sessionId', async () => {
    const triggerAnalysis = exposedApi.triggerAnalysis as (sessionId: string) => Promise<unknown>
    await triggerAnalysis('session-xyz')

    assert.equal(invokeCalls.length, 1, 'invoke must be called exactly once')
    assert.equal(invokeCalls[0].channel, CH.TRIGGER_ANALYSIS, 'must use TRIGGER_ANALYSIS channel')
    assert.deepEqual(invokeCalls[0].args, { sessionId: 'session-xyz' }, 'must pass sessionId')
  })

  // ---------- onAnalysisReady ----------

  test('api exposes onAnalysisReady method', () => {
    assert.ok(
      typeof exposedApi.onAnalysisReady === 'function',
      'onAnalysisReady must be a function on the exposed api',
    )
  })

  test('onAnalysisReady registers listener on ANALYSIS_READY channel', () => {
    const onAnalysisReady = exposedApi.onAnalysisReady as (cb: (data: unknown) => void) => () => void
    const callback = (_data: unknown) => {}
    onAnalysisReady(callback)

    assert.equal(onCalls.length, 1, 'ipcRenderer.on must be called exactly once')
    assert.equal(onCalls[0].channel, CH.ANALYSIS_READY, 'must use ANALYSIS_READY channel')
  })

  test('onAnalysisReady returns a cleanup function that removes the listener', () => {
    const onAnalysisReady = exposedApi.onAnalysisReady as (cb: (data: unknown) => void) => () => void
    const callback = (_data: unknown) => {}
    const cleanup = onAnalysisReady(callback)

    assert.equal(typeof cleanup, 'function', 'must return a cleanup function')

    cleanup()

    assert.equal(removeCalls.length, 1, 'ipcRenderer.removeListener must be called once on cleanup')
    assert.equal(removeCalls[0].channel, CH.ANALYSIS_READY, 'must remove ANALYSIS_READY listener')
  })

  test('onAnalysisReady cleanup removes the same handler that was registered', () => {
    const onAnalysisReady = exposedApi.onAnalysisReady as (cb: (data: unknown) => void) => () => void
    const callback = (_data: unknown) => {}
    const cleanup = onAnalysisReady(callback)
    cleanup()

    assert.equal(
      onCalls[0].handler,
      removeCalls[0].handler,
      'the same handler reference must be passed to both on() and removeListener()',
    )
  })

  test('onAnalysisReady callback is invoked with data from the IPC event', () => {
    const onAnalysisReady = exposedApi.onAnalysisReady as (cb: (data: unknown) => void) => () => void
    let received: unknown = null
    onAnalysisReady((data) => { received = data })

    // Simulate IPC event by calling the registered handler
    const registeredHandler = onCalls[onCalls.length - 1].handler
    const fakeData = { sessionId: 'test', analysisStatus: 'ready' }
    registeredHandler({} /* event */, fakeData)

    assert.deepEqual(received, fakeData, 'callback must receive the data from the IPC event')
  })
})
