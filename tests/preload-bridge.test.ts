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

// --------------------------------------------------------------------------
// IPC channel constants for workspace model
// --------------------------------------------------------------------------

const WS_CH = {
  PROJECT_DISCOVER: 'project:discover',
  PROJECT_REGISTER: 'project:register',
  PROJECT_UNREGISTER: 'project:unregister',
  SESSION_HIDE: 'session:hide',
  SESSION_STOP: 'session:stop',
  WORKSPACE_SAVE: 'workspace:save-state',
  WORKSPACE_GET: 'workspace:get-state',
  WORKSPACE_STATE: 'workspace:state',
  RUNNING_SESSIONS_TOAST: 'app:running-sessions-toast',
}

// --------------------------------------------------------------------------
// Workspace model bridge method tests
// --------------------------------------------------------------------------

describe('preload bridge — workspace model methods', () => {
  beforeEach(() => reset())

  // ---------- discoverProjects ----------

  test('api exposes discoverProjects method', () => {
    assert.ok(
      typeof exposedApi.discoverProjects === 'function',
      'discoverProjects must be a function on the exposed api',
    )
  })

  test('discoverProjects calls ipcRenderer.invoke with PROJECT_DISCOVER channel and amplifierHome', async () => {
    const discoverProjects = exposedApi.discoverProjects as (amplifierHome: string) => Promise<unknown>
    await discoverProjects('/home/user/.amplifier')

    assert.equal(invokeCalls.length, 1, 'invoke must be called exactly once')
    assert.equal(invokeCalls[0].channel, WS_CH.PROJECT_DISCOVER, 'must use PROJECT_DISCOVER channel')
    assert.deepEqual(invokeCalls[0].args, { amplifierHome: '/home/user/.amplifier' }, 'must pass amplifierHome')
  })

  // ---------- registerProject ----------

  test('api exposes registerProject method', () => {
    assert.ok(
      typeof exposedApi.registerProject === 'function',
      'registerProject must be a function on the exposed api',
    )
  })

  test('registerProject calls ipcRenderer.invoke with PROJECT_REGISTER channel and slug/path/name', async () => {
    const registerProject = exposedApi.registerProject as (slug: string, path: string, name: string) => Promise<unknown>
    await registerProject('my-project', '/path/to/project', 'My Project')

    assert.equal(invokeCalls.length, 1, 'invoke must be called exactly once')
    assert.equal(invokeCalls[0].channel, WS_CH.PROJECT_REGISTER, 'must use PROJECT_REGISTER channel')
    assert.deepEqual(invokeCalls[0].args, { slug: 'my-project', path: '/path/to/project', name: 'My Project' }, 'must pass slug, path, name')
  })

  // ---------- unregisterProject ----------

  test('api exposes unregisterProject method', () => {
    assert.ok(
      typeof exposedApi.unregisterProject === 'function',
      'unregisterProject must be a function on the exposed api',
    )
  })

  test('unregisterProject calls ipcRenderer.invoke with PROJECT_UNREGISTER channel and slug', async () => {
    const unregisterProject = exposedApi.unregisterProject as (slug: string) => Promise<unknown>
    await unregisterProject('my-project')

    assert.equal(invokeCalls.length, 1, 'invoke must be called exactly once')
    assert.equal(invokeCalls[0].channel, WS_CH.PROJECT_UNREGISTER, 'must use PROJECT_UNREGISTER channel')
    assert.deepEqual(invokeCalls[0].args, { slug: 'my-project' }, 'must pass slug')
  })

  // ---------- hideSession ----------

  test('api exposes hideSession method', () => {
    assert.ok(
      typeof exposedApi.hideSession === 'function',
      'hideSession must be a function on the exposed api',
    )
  })

  test('hideSession calls ipcRenderer.invoke with SESSION_HIDE channel and sessionId', async () => {
    const hideSession = exposedApi.hideSession as (sessionId: string) => Promise<unknown>
    await hideSession('session-123')

    assert.equal(invokeCalls.length, 1, 'invoke must be called exactly once')
    assert.equal(invokeCalls[0].channel, WS_CH.SESSION_HIDE, 'must use SESSION_HIDE channel')
    assert.deepEqual(invokeCalls[0].args, { sessionId: 'session-123' }, 'must pass sessionId')
  })

  // ---------- stopSession ----------

  test('api exposes stopSession method', () => {
    assert.ok(
      typeof exposedApi.stopSession === 'function',
      'stopSession must be a function on the exposed api',
    )
  })

  test('stopSession calls ipcRenderer.invoke with SESSION_STOP channel and sessionId', async () => {
    const stopSession = exposedApi.stopSession as (sessionId: string) => Promise<unknown>
    await stopSession('session-456')

    assert.equal(invokeCalls.length, 1, 'invoke must be called exactly once')
    assert.equal(invokeCalls[0].channel, WS_CH.SESSION_STOP, 'must use SESSION_STOP channel')
    assert.deepEqual(invokeCalls[0].args, { sessionId: 'session-456' }, 'must pass sessionId')
  })

  // ---------- saveWorkspaceState ----------

  test('api exposes saveWorkspaceState method', () => {
    assert.ok(
      typeof exposedApi.saveWorkspaceState === 'function',
      'saveWorkspaceState must be a function on the exposed api',
    )
  })

  test('saveWorkspaceState calls ipcRenderer.invoke with WORKSPACE_SAVE channel and state', async () => {
    const saveWorkspaceState = exposedApi.saveWorkspaceState as (state: unknown) => Promise<unknown>
    const fakeState = {
      selectedProjectSlug: 'my-project',
      expandedProjectSlugs: ['my-project'],
      selectedSessionId: 'session-abc',
      sidebarCollapsed: false,
    }
    await saveWorkspaceState(fakeState)

    assert.equal(invokeCalls.length, 1, 'invoke must be called exactly once')
    assert.equal(invokeCalls[0].channel, WS_CH.WORKSPACE_SAVE, 'must use WORKSPACE_SAVE channel')
    assert.deepEqual(invokeCalls[0].args, fakeState, 'must pass state directly')
  })

  // ---------- getWorkspaceState ----------

  test('api exposes getWorkspaceState method', () => {
    assert.ok(
      typeof exposedApi.getWorkspaceState === 'function',
      'getWorkspaceState must be a function on the exposed api',
    )
  })

  test('getWorkspaceState calls ipcRenderer.invoke with WORKSPACE_GET channel (no args)', async () => {
    const getWorkspaceState = exposedApi.getWorkspaceState as () => Promise<unknown>
    await getWorkspaceState()

    assert.equal(invokeCalls.length, 1, 'invoke must be called exactly once')
    assert.equal(invokeCalls[0].channel, WS_CH.WORKSPACE_GET, 'must use WORKSPACE_GET channel')
  })

  // ---------- onWorkspaceState ----------

  test('api exposes onWorkspaceState method', () => {
    assert.ok(
      typeof exposedApi.onWorkspaceState === 'function',
      'onWorkspaceState must be a function on the exposed api',
    )
  })

  test('onWorkspaceState registers listener on WORKSPACE_STATE channel', () => {
    const onWorkspaceState = exposedApi.onWorkspaceState as (cb: (state: unknown) => void) => () => void
    const callback = (_state: unknown) => {}
    onWorkspaceState(callback)

    assert.equal(onCalls.length, 1, 'ipcRenderer.on must be called exactly once')
    assert.equal(onCalls[0].channel, WS_CH.WORKSPACE_STATE, 'must use WORKSPACE_STATE channel')
  })

  test('onWorkspaceState returns a cleanup function that removes the listener', () => {
    const onWorkspaceState = exposedApi.onWorkspaceState as (cb: (state: unknown) => void) => () => void
    const callback = (_state: unknown) => {}
    const cleanup = onWorkspaceState(callback)

    assert.equal(typeof cleanup, 'function', 'must return a cleanup function')

    cleanup()

    assert.equal(removeCalls.length, 1, 'ipcRenderer.removeListener must be called once on cleanup')
    assert.equal(removeCalls[0].channel, WS_CH.WORKSPACE_STATE, 'must remove WORKSPACE_STATE listener')
  })

  test('onWorkspaceState cleanup removes the same handler that was registered', () => {
    const onWorkspaceState = exposedApi.onWorkspaceState as (cb: (state: unknown) => void) => () => void
    const callback = (_state: unknown) => {}
    const cleanup = onWorkspaceState(callback)
    cleanup()

    assert.equal(
      onCalls[0].handler,
      removeCalls[0].handler,
      'the same handler reference must be passed to both on() and removeListener()',
    )
  })

  test('onWorkspaceState callback is invoked with state from the IPC event', () => {
    const onWorkspaceState = exposedApi.onWorkspaceState as (cb: (state: unknown) => void) => () => void
    let received: unknown = null
    onWorkspaceState((state) => { received = state })

    const registeredHandler = onCalls[onCalls.length - 1].handler
    const fakeState = { selectedProjectSlug: 'proj', expandedProjectSlugs: [], selectedSessionId: null, sidebarCollapsed: false }
    registeredHandler({} /* event */, fakeState)

    assert.deepEqual(received, fakeState, 'callback must receive the state from the IPC event')
  })

  // ---------- onRunningSessionsToast ----------

  test('api exposes onRunningSessionsToast method', () => {
    assert.ok(
      typeof exposedApi.onRunningSessionsToast === 'function',
      'onRunningSessionsToast must be a function on the exposed api',
    )
  })

  test('onRunningSessionsToast registers listener on RUNNING_SESSIONS_TOAST channel', () => {
    const onRunningSessionsToast = exposedApi.onRunningSessionsToast as (cb: (data: unknown) => void) => () => void
    const callback = (_data: unknown) => {}
    onRunningSessionsToast(callback)

    assert.equal(onCalls.length, 1, 'ipcRenderer.on must be called exactly once')
    assert.equal(onCalls[0].channel, WS_CH.RUNNING_SESSIONS_TOAST, 'must use RUNNING_SESSIONS_TOAST channel')
  })

  test('onRunningSessionsToast returns a cleanup function that removes the listener', () => {
    const onRunningSessionsToast = exposedApi.onRunningSessionsToast as (cb: (data: unknown) => void) => () => void
    const callback = (_data: unknown) => {}
    const cleanup = onRunningSessionsToast(callback)

    assert.equal(typeof cleanup, 'function', 'must return a cleanup function')

    cleanup()

    assert.equal(removeCalls.length, 1, 'ipcRenderer.removeListener must be called once on cleanup')
    assert.equal(removeCalls[0].channel, WS_CH.RUNNING_SESSIONS_TOAST, 'must remove RUNNING_SESSIONS_TOAST listener')
  })

  test('onRunningSessionsToast cleanup removes the same handler that was registered', () => {
    const onRunningSessionsToast = exposedApi.onRunningSessionsToast as (cb: (data: unknown) => void) => () => void
    const callback = (_data: unknown) => {}
    const cleanup = onRunningSessionsToast(callback)
    cleanup()

    assert.equal(
      onCalls[0].handler,
      removeCalls[0].handler,
      'the same handler reference must be passed to both on() and removeListener()',
    )
  })

  test('onRunningSessionsToast callback is invoked with data from the IPC event', () => {
    const onRunningSessionsToast = exposedApi.onRunningSessionsToast as (cb: (data: unknown) => void) => () => void
    let received: unknown = null
    onRunningSessionsToast((data) => { received = data })

    const registeredHandler = onCalls[onCalls.length - 1].handler
    const fakeData = { count: 3 }
    registeredHandler({} /* event */, fakeData)

    assert.deepEqual(received, fakeData, 'callback must receive the data from the IPC event')
  })
})
