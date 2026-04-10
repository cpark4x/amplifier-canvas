/**
 * Tests for task-6: IPC Handlers for Workspace Model
 * Verifies all 7 workspace IPC handlers registered in registerIpcHandlers().
 *
 * Strategy: pre-populate require.cache with mocked modules before
 * dynamically requiring ipc.ts, so that Electron and heavy deps are
 * replaced with lightweight stubs that run in plain Node.
 *
 * NOTE: We explicitly delete the ipc.ts cache entry before requiring,
 * so this test file gets a clean load regardless of module load order.
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

let mockDiscoveredProjects: unknown[] = []
let mockUpsertProjectCalls: Array<[string, string, string]> = []
let mockSetProjectRegisteredCalls: Array<[string, number]> = []
let mockSetSessionHiddenCalls: Array<[string, number]> = []
let mockSaveWorkspaceStateCalls: unknown[] = []
let mockWorkspaceState: unknown = {
  selectedProjectSlug: null,
  expandedProjectSlugs: [],
  selectedSessionId: null,
  sidebarCollapsed: false,
}
let mockRegisteredProjectCount = 0

let mockDiscoverShouldThrow = false
let mockUpsertShouldThrow = false
let mockSaveWorkspaceStateShouldThrow = false
let mockGetWorkspaceStateShouldThrow = false

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
})

// scanner stub
injectCache('../src/main/scanner', {
  getAmplifierHome: () => '/fake-amplifier-home',
})

// db stub — includes all workspace model functions
injectCache('../src/main/db', {
  getSessionById: () => null,
  getRegisteredProjects: () => [],
  setProjectRegistered(slug: string, registered: number) {
    mockSetProjectRegisteredCalls.push([slug, registered])
  },
  setSessionHidden(id: string, hidden: number) {
    mockSetSessionHiddenCalls.push([id, hidden])
  },
  upsertProject(slug: string, projPath: string, name: string) {
    if (mockUpsertShouldThrow) throw new Error('db error')
    mockUpsertProjectCalls.push([slug, projPath, name])
  },
  getRegisteredProjectCount() {
    return mockRegisteredProjectCount
  },
})

// workspace stub
injectCache('../src/main/workspace', {
  getWorkspaceState() {
    if (mockGetWorkspaceStateShouldThrow) throw new Error('workspace error')
    return mockWorkspaceState
  },
  saveWorkspaceState(state: unknown) {
    if (mockSaveWorkspaceStateShouldThrow) throw new Error('save error')
    mockSaveWorkspaceStateCalls.push(state)
  },
})

// discovery stub
injectCache('../src/main/discovery', {
  discoverProjects(_amplifierHome: string) {
    if (mockDiscoverShouldThrow) throw new Error('discover error')
    return mockDiscoveredProjects
  },
})

// analysisService stub (needed by existing ipc.ts imports)
injectCache('../src/main/analysisService', {
  getAnalysis: () => null,
  triggerAnalysis: async () => null,
})

// --------------------------------------------------------------------------
// Load module-under-test AFTER stubs are in place
// --------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ipcModule = require('../src/main/ipc.ts') as {
  registerIpcHandlers: (win: unknown) => void
  pushWorkspaceState: (win: unknown, state: unknown) => void
  pushRunningSessionsToast: (win: unknown, count: number) => void
}
const { registerIpcHandlers } = ipcModule

// --------------------------------------------------------------------------
// IPC channel name constants (mirrors src/shared/types.ts)
// --------------------------------------------------------------------------

const CH = {
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
// Reset helpers
// --------------------------------------------------------------------------

function reset() {
  registeredHandlers.clear()
  removedHandlers.length = 0
  sentMessages.length = 0
  mockDiscoveredProjects = []
  mockUpsertProjectCalls = []
  mockSetProjectRegisteredCalls = []
  mockSetSessionHiddenCalls = []
  mockSaveWorkspaceStateCalls = []
  mockWorkspaceState = {
    selectedProjectSlug: null,
    expandedProjectSlugs: [],
    selectedSessionId: null,
    sidebarCollapsed: false,
  }
  mockRegisteredProjectCount = 0
  mockDiscoverShouldThrow = false
  mockUpsertShouldThrow = false
  mockSaveWorkspaceStateShouldThrow = false
  mockGetWorkspaceStateShouldThrow = false
}

// Cleanup cache entries after all tests
after(() => {
  delete require.cache[require.resolve('electron')]
  delete require.cache[ipcTsPath]
})

// --------------------------------------------------------------------------
// Test suite
// --------------------------------------------------------------------------

describe('registerIpcHandlers — workspace model channels', () => {
  beforeEach(() => reset())

  // ---- AC: All 7 handlers registered ----

  test('registers PROJECT_DISCOVER handler', () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)
    assert.ok(registeredHandlers.has(CH.PROJECT_DISCOVER), 'PROJECT_DISCOVER must be registered')
  })

  test('registers PROJECT_REGISTER handler', () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)
    assert.ok(registeredHandlers.has(CH.PROJECT_REGISTER), 'PROJECT_REGISTER must be registered')
  })

  test('registers PROJECT_UNREGISTER handler', () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)
    assert.ok(registeredHandlers.has(CH.PROJECT_UNREGISTER), 'PROJECT_UNREGISTER must be registered')
  })

  test('registers SESSION_HIDE handler', () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)
    assert.ok(registeredHandlers.has(CH.SESSION_HIDE), 'SESSION_HIDE must be registered')
  })

  test('registers SESSION_STOP handler', () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)
    assert.ok(registeredHandlers.has(CH.SESSION_STOP), 'SESSION_STOP must be registered')
  })

  test('registers WORKSPACE_SAVE handler', () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)
    assert.ok(registeredHandlers.has(CH.WORKSPACE_SAVE), 'WORKSPACE_SAVE must be registered')
  })

  test('registers WORKSPACE_GET handler', () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)
    assert.ok(registeredHandlers.has(CH.WORKSPACE_GET), 'WORKSPACE_GET must be registered')
  })

  // ---- AC: PROJECT_DISCOVER behavior ----

  test('PROJECT_DISCOVER calls discoverProjects with amplifierHome and returns results', async () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)

    const fakeProjects = [
      { slug: 'my-project', name: 'My Project', path: '/fake-amplifier-home/projects/my-project' },
    ]
    mockDiscoveredProjects = fakeProjects

    const handler = registeredHandlers.get(CH.PROJECT_DISCOVER)!
    const result = await handler({}, {})

    assert.deepEqual(result, fakeProjects)
  })

  test('PROJECT_DISCOVER returns [] on error', async () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)

    mockDiscoverShouldThrow = true

    const handler = registeredHandlers.get(CH.PROJECT_DISCOVER)!
    const result = await handler({}, {})

    assert.deepEqual(result, [], 'must return [] when discoverProjects throws')
  })

  // ---- AC: PROJECT_REGISTER behavior ----

  test('PROJECT_REGISTER calls upsertProject then setProjectRegistered(slug, 1)', async () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)

    const handler = registeredHandlers.get(CH.PROJECT_REGISTER)!
    const result = await handler({}, { slug: 'my-proj', path: '/home/my-proj', name: 'My Proj' })

    assert.deepEqual(result, { success: true })
    assert.deepEqual(mockUpsertProjectCalls, [['my-proj', '/home/my-proj', 'My Proj']])
    assert.deepEqual(mockSetProjectRegisteredCalls, [['my-proj', 1]])
  })

  test('PROJECT_REGISTER returns {success: false} on error', async () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)

    mockUpsertShouldThrow = true

    const handler = registeredHandlers.get(CH.PROJECT_REGISTER)!
    const result = await handler({}, { slug: 'fail', path: '/p', name: 'Fail' }) as { success: boolean; error?: string }

    assert.equal(result.success, false)
    assert.ok(typeof result.error === 'string', 'error message must be a string')
  })

  // ---- AC: PROJECT_UNREGISTER behavior ----

  test('PROJECT_UNREGISTER calls setProjectRegistered(slug, 0)', async () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)

    const handler = registeredHandlers.get(CH.PROJECT_UNREGISTER)!
    const result = await handler({}, { slug: 'my-proj' })

    assert.deepEqual(result, { success: true })
    assert.deepEqual(mockSetProjectRegisteredCalls, [['my-proj', 0]])
  })

  // ---- AC: SESSION_HIDE behavior ----

  test('SESSION_HIDE calls setSessionHidden(sessionId, 1)', async () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)

    const handler = registeredHandlers.get(CH.SESSION_HIDE)!
    const result = await handler({}, { sessionId: 'sess-abc' })

    assert.deepEqual(result, { success: true })
    assert.deepEqual(mockSetSessionHiddenCalls, [['sess-abc', 1]])
  })

  // ---- AC: SESSION_STOP behavior ----

  test('SESSION_STOP is a placeholder returning {success: false, error}', async () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)

    const handler = registeredHandlers.get(CH.SESSION_STOP)!
    const result = await handler({}, { sessionId: 'any-session' }) as { success: boolean; error: string }

    assert.equal(result.success, false)
    assert.ok(typeof result.error === 'string', 'SESSION_STOP must include an error message')
    assert.ok(result.error.length > 0, 'error message must be non-empty')
  })

  // ---- AC: WORKSPACE_SAVE behavior ----

  test('WORKSPACE_SAVE calls saveWorkspaceState and returns {success: true}', async () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)

    const fakeState = {
      selectedProjectSlug: 'proj-a',
      expandedProjectSlugs: ['proj-a'],
      selectedSessionId: null,
      sidebarCollapsed: false,
    }

    const handler = registeredHandlers.get(CH.WORKSPACE_SAVE)!
    const result = await handler({}, { state: fakeState })

    assert.deepEqual(result, { success: true })
    assert.equal(mockSaveWorkspaceStateCalls.length, 1)
    assert.deepEqual(mockSaveWorkspaceStateCalls[0], fakeState)
  })

  test('WORKSPACE_SAVE returns {success: false} on error', async () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)

    mockSaveWorkspaceStateShouldThrow = true

    const handler = registeredHandlers.get(CH.WORKSPACE_SAVE)!
    const result = await handler({}, { state: {} }) as { success: boolean; error?: string }

    assert.equal(result.success, false)
    assert.ok(typeof result.error === 'string')
  })

  // ---- AC: WORKSPACE_GET behavior ----

  test('WORKSPACE_GET returns {state, isFirstTime: true} when no registered projects', async () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)

    mockRegisteredProjectCount = 0
    const fakeState = {
      selectedProjectSlug: null,
      expandedProjectSlugs: [],
      selectedSessionId: null,
      sidebarCollapsed: false,
    }
    mockWorkspaceState = fakeState

    const handler = registeredHandlers.get(CH.WORKSPACE_GET)!
    const result = await handler({}, {}) as { state: unknown; isFirstTime: boolean }

    assert.deepEqual(result.state, fakeState)
    assert.equal(result.isFirstTime, true)
  })

  test('WORKSPACE_GET returns {state, isFirstTime: false} when projects are registered', async () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)

    mockRegisteredProjectCount = 2

    const handler = registeredHandlers.get(CH.WORKSPACE_GET)!
    const result = await handler({}, {}) as { state: unknown; isFirstTime: boolean }

    assert.equal(result.isFirstTime, false)
  })

  // ---- AC: All 7 removeHandler calls on window close ----

  test('removes all 7 workspace handlers on window closed', () => {
    const win = makeMockWindow()
    registerIpcHandlers(win)

    win._emit('closed')

    const expectedChannels = [
      CH.PROJECT_DISCOVER,
      CH.PROJECT_REGISTER,
      CH.PROJECT_UNREGISTER,
      CH.SESSION_HIDE,
      CH.SESSION_STOP,
      CH.WORKSPACE_SAVE,
      CH.WORKSPACE_GET,
    ]

    for (const channel of expectedChannels) {
      assert.ok(
        removedHandlers.includes(channel),
        `${channel} must be removed via ipcMain.removeHandler() on window closed`,
      )
    }
  })
})

// --------------------------------------------------------------------------
// Push functions test
// --------------------------------------------------------------------------

describe('push functions — workspace model', () => {
  test('pushWorkspaceState is exported', () => {
    assert.equal(typeof ipcModule.pushWorkspaceState, 'function', 'pushWorkspaceState must be exported')
  })

  test('pushWorkspaceState sends WORKSPACE_STATE to renderer', () => {
    const win = makeMockWindow()
    const fakeState = {
      selectedProjectSlug: 'proj-x',
      expandedProjectSlugs: [],
      selectedSessionId: null,
      sidebarCollapsed: false,
    }

    sentMessages.length = 0
    ipcModule.pushWorkspaceState(win, fakeState)

    const msg = sentMessages.find((m) => m.channel === CH.WORKSPACE_STATE)
    assert.ok(msg !== undefined, 'pushWorkspaceState must send WORKSPACE_STATE')
    assert.deepEqual(msg!.data, fakeState)
  })

  test('pushRunningSessionsToast is exported', () => {
    assert.equal(typeof ipcModule.pushRunningSessionsToast, 'function', 'pushRunningSessionsToast must be exported')
  })

  test('pushRunningSessionsToast sends RUNNING_SESSIONS_TOAST to renderer', () => {
    const win = makeMockWindow()

    sentMessages.length = 0
    ipcModule.pushRunningSessionsToast(win, 3)

    const msg = sentMessages.find((m) => m.channel === CH.RUNNING_SESSIONS_TOAST)
    assert.ok(msg !== undefined, 'pushRunningSessionsToast must send RUNNING_SESSIONS_TOAST')
    assert.equal(msg!.data, 3)
  })
})
