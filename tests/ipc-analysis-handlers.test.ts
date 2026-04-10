/**
 * Tests for analysis IPC handlers (GET_ANALYSIS and TRIGGER_ANALYSIS)
 * registered in registerIpcHandlers().
 *
 * Strategy: pre-populate require.cache with mocked modules before
 * dynamically requiring ipc.ts, so that Electron and heavy deps are
 * replaced with lightweight stubs that run in plain Node.
 */

import { test, describe, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import Module from 'node:module'
import path from 'node:path'

// --------------------------------------------------------------------------
// In-memory state for mock ipcMain
// --------------------------------------------------------------------------

const registeredHandlers = new Map<string, (event: unknown, args: unknown) => unknown>()
const removedHandlers: string[] = []
const sentMessages: Array<{ channel: string; data: unknown }> = []

const mockIpcMain = {
  handle(channel: string, handler: (event: unknown, args: unknown) => unknown) {
    registeredHandlers.set(channel, handler)
  },
  removeHandler(channel: string) {
    removedHandlers.push(channel)
    registeredHandlers.delete(channel)
  },
  on(_channel: string, _listener: unknown) {},
  removeListener(_channel: string, _listener: unknown) {},
}

// --------------------------------------------------------------------------
// Mock window factory
// --------------------------------------------------------------------------

function makeMockWindow(isDestroyed = false) {
  const listeners = new Map<string, Array<() => void>>()
  return {
    webContents: {
      send(channel: string, data: unknown) {
        sentMessages.push({ channel, data })
      },
    },
    isDestroyed() {
      return isDestroyed
    },
    on(event: string, cb: () => void) {
      const list = listeners.get(event) ?? []
      list.push(cb)
      listeners.set(event, list)
    },
    /** Fire all listeners for the given event (test helper) */
    _emit(event: string) {
      for (const cb of listeners.get(event) ?? []) cb()
    },
  }
}

// --------------------------------------------------------------------------
// Control variables: tests override these before calling a handler
// --------------------------------------------------------------------------

let mockGetAnalysisResult: unknown = null
let mockTriggerAnalysisResult: unknown = null
let mockTriggerAnalysisShouldThrow = false

// --------------------------------------------------------------------------
// Register require.cache stubs for every module that ipc.ts imports
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

// electron stub
injectCache('electron', {
  ipcMain: mockIpcMain,
  BrowserWindow: class {},
})

// analysisService stub
injectCache('../src/main/analysisService', {
  getAnalysis(_sessionId: string) {
    return mockGetAnalysisResult
  },
  async triggerAnalysis(_sessionId: string) {
    if (mockTriggerAnalysisShouldThrow) throw new Error('service error')
    return mockTriggerAnalysisResult
  },
})

// pty stub
injectCache('../src/main/pty', {
  spawnPty: () => ({ onData: () => {}, onExit: () => {} }),
  writeToPty: () => {},
  resizePty: () => {},
  killPty: () => {},
})

// scanner stub
injectCache('../src/main/scanner', {
  getAmplifierHome: () => '/tmp',
})

// db stub
injectCache('../src/main/db', {
  getSessionById: () => null,
})

// --------------------------------------------------------------------------
// Load module-under-test AFTER stubs are in place
// --------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ipcModule = require('../src/main/ipc.ts') as {
  registerIpcHandlers: (win: unknown) => void
}
const { registerIpcHandlers } = ipcModule

// --------------------------------------------------------------------------
// IPC channel name constants (mirrors src/shared/types.ts)
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
  registeredHandlers.clear()
  removedHandlers.length = 0
  sentMessages.length = 0
  mockGetAnalysisResult = null
  mockTriggerAnalysisResult = null
  mockTriggerAnalysisShouldThrow = false
}

// Cleanup cache entries after all tests
after(() => {
  delete require.cache[require.resolve('electron')]
})

// --------------------------------------------------------------------------
// Test suite
// --------------------------------------------------------------------------

describe('registerIpcHandlers — analysis IPC channels', () => {
  beforeEach(() => reset())

  // ---------- AC 1: GET_ANALYSIS handler registration ----------

  test('registers GET_ANALYSIS handler on ipcMain', () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)

    assert.ok(
      registeredHandlers.has(CH.GET_ANALYSIS),
      'GET_ANALYSIS handler must be registered via ipcMain.handle()',
    )
  })

  test('GET_ANALYSIS returns SessionAnalysisData for valid session', () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)

    const fakeData = {
      sessionId: 's1',
      mechanical: { testStatus: null, promptHistory: [], filesChanged: [], gitOperations: [] },
      analysisStatus: 'ready',
      analysisResult: null,
      analysisGeneratedAt: null,
    }
    mockGetAnalysisResult = fakeData

    const handler = registeredHandlers.get(CH.GET_ANALYSIS)!
    const result = handler({}, { sessionId: 's1' })
    assert.deepEqual(result, fakeData)
  })

  test('GET_ANALYSIS returns null when session does not exist', () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)

    mockGetAnalysisResult = null

    const handler = registeredHandlers.get(CH.GET_ANALYSIS)!
    const result = handler({}, { sessionId: 'nonexistent' })
    assert.equal(result, null)
  })

  // ---------- AC 2: TRIGGER_ANALYSIS handler registration ----------

  test('registers TRIGGER_ANALYSIS handler on ipcMain', () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)

    assert.ok(
      registeredHandlers.has(CH.TRIGGER_ANALYSIS),
      'TRIGGER_ANALYSIS handler must be registered via ipcMain.handle()',
    )
  })

  test('TRIGGER_ANALYSIS returns SessionAnalysisData on success', async () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)

    const fakeResult = {
      sessionId: 's2',
      mechanical: { testStatus: null, promptHistory: [], filesChanged: [], gitOperations: [] },
      analysisStatus: 'ready',
      analysisResult: { sections: [] },
      analysisGeneratedAt: '2024-01-01T00:00:00Z',
    }
    mockTriggerAnalysisResult = fakeResult

    const handler = registeredHandlers.get(CH.TRIGGER_ANALYSIS)!
    const result = await handler({}, { sessionId: 's2' })
    assert.deepEqual(result, fakeResult)
  })

  test('TRIGGER_ANALYSIS pushes ANALYSIS_READY to renderer when result is non-null', async () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)

    const fakeResult = {
      sessionId: 's3',
      mechanical: { testStatus: null, promptHistory: [], filesChanged: [], gitOperations: [] },
      analysisStatus: 'ready',
      analysisResult: { sections: [] },
      analysisGeneratedAt: '2024-01-01T00:00:00Z',
    }
    mockTriggerAnalysisResult = fakeResult

    const handler = registeredHandlers.get(CH.TRIGGER_ANALYSIS)!
    await handler({}, { sessionId: 's3' })

    const readyMsg = sentMessages.find((m) => m.channel === CH.ANALYSIS_READY)
    assert.ok(readyMsg !== undefined, 'ANALYSIS_READY push must be sent to renderer')
    assert.deepEqual(readyMsg!.data, fakeResult, 'ANALYSIS_READY payload must be the full result')
  })

  test('TRIGGER_ANALYSIS does NOT push ANALYSIS_READY when result is null', async () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)

    mockTriggerAnalysisResult = null

    const handler = registeredHandlers.get(CH.TRIGGER_ANALYSIS)!
    const result = await handler({}, { sessionId: 'no-session' })

    assert.equal(result, null)
    const readyMsg = sentMessages.find((m) => m.channel === CH.ANALYSIS_READY)
    assert.equal(readyMsg, undefined, 'ANALYSIS_READY must NOT be sent when result is null')
  })

  test('TRIGGER_ANALYSIS returns null when service returns null', async () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)

    mockTriggerAnalysisResult = null

    const handler = registeredHandlers.get(CH.TRIGGER_ANALYSIS)!
    const result = await handler({}, { sessionId: 'no-result' })
    assert.equal(result, null)
  })

  test('TRIGGER_ANALYSIS returns null when service throws', async () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)

    mockTriggerAnalysisShouldThrow = true

    const handler = registeredHandlers.get(CH.TRIGGER_ANALYSIS)!
    const result = await handler({}, { sessionId: 'err' })
    assert.equal(result, null)
    const readyMsg = sentMessages.find((m) => m.channel === CH.ANALYSIS_READY)
    assert.equal(readyMsg, undefined, 'ANALYSIS_READY must NOT be sent when service throws')
  })

  // ---------- AC 3: Cleanup on window closed ----------

  test('GET_ANALYSIS handler is removed on window closed', () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)

    assert.ok(registeredHandlers.has(CH.GET_ANALYSIS), 'handler must be registered first')

    win._emit('closed')

    assert.ok(
      removedHandlers.includes(CH.GET_ANALYSIS),
      'GET_ANALYSIS must be removed via ipcMain.removeHandler() on window closed',
    )
  })

  test('TRIGGER_ANALYSIS handler is removed on window closed', () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)

    assert.ok(registeredHandlers.has(CH.TRIGGER_ANALYSIS), 'handler must be registered first')

    win._emit('closed')

    assert.ok(
      removedHandlers.includes(CH.TRIGGER_ANALYSIS),
      'TRIGGER_ANALYSIS must be removed via ipcMain.removeHandler() on window closed',
    )
  })
})
