/**
 * Tests for task-4: IPC Handlers for Settings (SETTINGS_GET and SETTINGS_SAVE)
 * Verifies that both settings IPC handlers are registered in registerIpcHandlers()
 * and removed on window close.
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

function makeMockWindow() {
  const listeners = new Map<string, Array<() => void>>()
  return {
    webContents: {
      send(_channel: string, _data: unknown) {},
    },
    isDestroyed() {
      return false
    },
    on(event: string, cb: () => void) {
      const list = listeners.get(event) ?? []
      list.push(cb)
      listeners.set(event, list)
    },
    _emit(event: string) {
      for (const cb of listeners.get(event) ?? []) cb()
    },
  }
}

// --------------------------------------------------------------------------
// Control variables: tests override these before calling a handler
// --------------------------------------------------------------------------

let mockGetSettingsResult: unknown = { analysisModel: 'claude-sonnet-4-5', analysisProvider: null }
let mockGetSettingsShouldThrow = false
let mockSaveSettingsCalls: unknown[] = []
let mockSaveSettingsShouldThrow = false

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

// Resolve ipc.ts path so we can clear its cache entry before requiring
const ipcTsPath = path.resolve(__dirname, '../src/main/ipc.ts')

// Clear any cached version of ipc.ts (from another test file running first)
delete require.cache[ipcTsPath]

// electron stub
injectCache('electron', {
  ipcMain: mockIpcMain,
  BrowserWindow: class {},
})

// pty stub
injectCache('../src/main/pty', {
  spawnPty: () => ({ onData: () => {}, onExit: () => {} }),
  writeToPty: () => {},
  resizePty: () => {},
  killPty: () => {},
  killAllPtys: () => {},
  getPty: () => null,
  hasPty: () => false,
  appendToBuffer: () => {},
  getBuffer: () => '',
})

// scanner stub
injectCache('../src/main/scanner', {
  getAmplifierHome: () => '/fake-amplifier-home',
  scanSingleProject: () => [],
})

// watcher stub
injectCache('../src/main/watcher', {
  addProjectWatch: () => {},
})

// db stub
injectCache('../src/main/db', {
  getSessionById: () => null,
  getRegisteredProjects: () => [],
  setProjectRegistered: () => {},
  setSessionHidden: () => {},
  upsertProject: () => {},
  getRegisteredProjectCount: () => 0,
})

// workspace stub
injectCache('../src/main/workspace', {
  getWorkspaceState: () => ({}),
  saveWorkspaceState: () => {},
})

// discovery stub
injectCache('../src/main/discovery', {
  discoverProjects: () => [],
})

// analysisService stub
injectCache('../src/main/analysisService', {
  getAnalysis: () => null,
  triggerAnalysis: async () => null,
})

// settings stub — this is what we're testing integration with
injectCache('../src/main/settings', {
  getSettings() {
    if (mockGetSettingsShouldThrow) throw new Error('settings read error')
    return mockGetSettingsResult
  },
  saveSettings(settings: unknown) {
    if (mockSaveSettingsShouldThrow) throw new Error('settings write error')
    mockSaveSettingsCalls.push(settings)
    return { success: true }
  },
  getDefaultSettings() {
    return { analysisModel: 'claude-sonnet-4-5', analysisProvider: null }
  },
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
  SETTINGS_GET: 'settings:get',
  SETTINGS_SAVE: 'settings:save',
}

// --------------------------------------------------------------------------
// Reset helpers
// --------------------------------------------------------------------------

function reset() {
  registeredHandlers.clear()
  removedHandlers.length = 0
  mockGetSettingsResult = { analysisModel: 'claude-sonnet-4-5', analysisProvider: null }
  mockGetSettingsShouldThrow = false
  mockSaveSettingsCalls = []
  mockSaveSettingsShouldThrow = false
}

// Cleanup cache entries after all tests
after(() => {
  delete require.cache[require.resolve('electron')]
  delete require.cache[ipcTsPath]
})

// --------------------------------------------------------------------------
// Test suite
// --------------------------------------------------------------------------

describe('registerIpcHandlers — settings channels', () => {
  beforeEach(() => reset())

  // ---- AC: Both handlers registered ----

  test('registers SETTINGS_GET handler', () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)
    assert.ok(registeredHandlers.has(CH.SETTINGS_GET), 'SETTINGS_GET must be registered')
  })

  test('registers SETTINGS_SAVE handler', () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)
    assert.ok(registeredHandlers.has(CH.SETTINGS_SAVE), 'SETTINGS_SAVE must be registered')
  })

  // ---- AC: SETTINGS_GET behavior ----

  test('SETTINGS_GET returns settings from getSettings()', async () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)

    mockGetSettingsResult = { analysisModel: 'claude-opus-4-5', analysisProvider: 'anthropic' }

    const handler = registeredHandlers.get(CH.SETTINGS_GET)!
    const result = await handler({}, undefined)

    assert.deepEqual(result, { analysisModel: 'claude-opus-4-5', analysisProvider: 'anthropic' })
  })

  test('SETTINGS_GET returns default settings when getSettings() throws', async () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)

    mockGetSettingsShouldThrow = true

    const handler = registeredHandlers.get(CH.SETTINGS_GET)!
    const result = await handler({}, undefined) as { analysisModel: string; analysisProvider: string | null }

    assert.equal(typeof result.analysisModel, 'string', 'must return an object with analysisModel')
    assert.ok('analysisProvider' in result, 'must include analysisProvider field in fallback')
  })

  // ---- AC: SETTINGS_SAVE behavior ----

  test('SETTINGS_SAVE calls saveSettings with provided settings and returns {success: true}', async () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)

    const fakeSettings = { analysisModel: 'claude-haiku-3', analysisProvider: null }

    const handler = registeredHandlers.get(CH.SETTINGS_SAVE)!
    const result = await handler({}, fakeSettings) as { success: boolean }

    assert.equal(result.success, true)
    assert.equal(mockSaveSettingsCalls.length, 1)
    assert.deepEqual(mockSaveSettingsCalls[0], fakeSettings)
  })

  test('SETTINGS_SAVE returns {success: false} when saveSettings() throws', async () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)

    mockSaveSettingsShouldThrow = true

    const fakeSettings = { analysisModel: 'claude-haiku-3', analysisProvider: null }

    const handler = registeredHandlers.get(CH.SETTINGS_SAVE)!
    const result = await handler({}, fakeSettings) as { success: boolean }

    assert.equal(result.success, false)
  })

  // ---- AC: Cleanup on window close ----

  test('removes SETTINGS_GET handler on window closed', () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)

    win._emit('closed')

    assert.ok(
      removedHandlers.includes(CH.SETTINGS_GET),
      'SETTINGS_GET must be removed via ipcMain.removeHandler() on window closed',
    )
  })

  test('removes SETTINGS_SAVE handler on window closed', () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)

    win._emit('closed')

    assert.ok(
      removedHandlers.includes(CH.SETTINGS_SAVE),
      'SETTINGS_SAVE must be removed via ipcMain.removeHandler() on window closed',
    )
  })
})
