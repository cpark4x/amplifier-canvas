/**
 * Tests for task-4: Preload bridge methods for settings (getSettings, saveSettings)
 * Verifies that getSettings() and saveSettings() are exposed on window.electronAPI.
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

const mockIpcRenderer = {
  send(_channel: string, _args: unknown) {},
  invoke(channel: string, args: unknown): Promise<unknown> {
    invokeCalls.push({ channel, args })
    return Promise.resolve(null)
  },
  on(_channel: string, _handler: unknown) {},
  removeListener(_channel: string, _handler: unknown) {},
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

// Resolve the preload module path so we can clear its cache entry
const preloadPath = path.resolve(__dirname, '../src/preload/index.ts')

// Clear any cached version of the preload module
delete require.cache[preloadPath]

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
  SETTINGS_GET: 'settings:get',
  SETTINGS_SAVE: 'settings:save',
}

// --------------------------------------------------------------------------
// Reset helpers
// --------------------------------------------------------------------------

function reset() {
  invokeCalls.length = 0
}

// Cleanup after all tests
after(() => {
  delete require.cache[require.resolve('electron')]
  delete require.cache[preloadPath]
})

// --------------------------------------------------------------------------
// Test suite
// --------------------------------------------------------------------------

describe('preload bridge — settings methods', () => {
  beforeEach(() => reset())

  // ---------- getSettings ----------

  test('api exposes getSettings method', () => {
    assert.ok(
      typeof exposedApi.getSettings === 'function',
      'getSettings must be a function on the exposed api',
    )
  })

  test('getSettings calls ipcRenderer.invoke with SETTINGS_GET channel (no args)', async () => {
    const getSettings = exposedApi.getSettings as () => Promise<unknown>
    await getSettings()

    assert.equal(invokeCalls.length, 1, 'invoke must be called exactly once')
    assert.equal(invokeCalls[0].channel, CH.SETTINGS_GET, 'must use SETTINGS_GET channel')
  })

  // ---------- saveSettings ----------

  test('api exposes saveSettings method', () => {
    assert.ok(
      typeof exposedApi.saveSettings === 'function',
      'saveSettings must be a function on the exposed api',
    )
  })

  test('saveSettings calls ipcRenderer.invoke with SETTINGS_SAVE channel and settings object', async () => {
    const saveSettings = exposedApi.saveSettings as (settings: unknown) => Promise<unknown>
    const fakeSettings = { analysisModel: 'claude-haiku-3', analysisProvider: null }
    await saveSettings(fakeSettings)

    assert.equal(invokeCalls.length, 1, 'invoke must be called exactly once')
    assert.equal(invokeCalls[0].channel, CH.SETTINGS_SAVE, 'must use SETTINGS_SAVE channel')
    assert.deepEqual(invokeCalls[0].args, fakeSettings, 'must pass settings object as second arg')
  })
})
