import { ipcMain, BrowserWindow } from 'electron'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, resolve, normalize } from 'path'
import { IPC_CHANNELS } from '../shared/types'
import type { SessionState, FileActivity, FileEntry } from '../shared/types'
import { spawnPty, writeToPty, resizePty, killPty } from './pty'
import { getAmplifierHome } from './scanner'
import {
  getSessionById,
  getRegisteredProjects,
  setProjectRegistered,
  setSessionHidden,
  upsertProject,
  getRegisteredProjectCount,
} from './db'
import { getWorkspaceState, saveWorkspaceState } from './workspace'
import type { WorkspaceState } from './workspace'
import { discoverProjects } from './discovery'
import type { DiscoveredProject } from './discovery'
import { getAnalysis, triggerAnalysis } from './analysisService'
import type { SessionAnalysisData } from '../shared/analysisTypes'

// Track allowed directories for file access security
let allowedDirs: string[] = []

export function setAllowedDirs(dirs: string[]): void {
  allowedDirs = dirs.map((d) => resolve(normalize(d)))
}

export function isPathAllowed(requestedPath: string): boolean {
  const resolved = resolve(normalize(requestedPath))
  return allowedDirs.some((dir) => resolved.startsWith(dir))
}

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  // Defer PTY spawn until actually needed (lazy init).
  // Eager spawn blocks the main process event loop during startup.
  let ptyProcess: ReturnType<typeof spawnPty> | null = null

  function ensurePty(): ReturnType<typeof spawnPty> {
    if (!ptyProcess) {
      ptyProcess = spawnPty(80, 24)
      ptyProcess.onData((data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(IPC_CHANNELS.TERMINAL_DATA, data)
        }
      })
      ptyProcess.onExit(({ exitCode, signal }) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(IPC_CHANNELS.TERMINAL_EXIT, { exitCode, signal })
        }
      })
    }
    return ptyProcess
  }

  const onInput = (_event: Electron.IpcMainEvent, data: string): void => {
    ensurePty()
    writeToPty(data)
  }

  const onResize = (_event: Electron.IpcMainEvent, { cols, rows }: { cols: number; rows: number }): void => {
    ensurePty()
    resizePty(cols, rows)
  }

  ipcMain.on(IPC_CHANNELS.TERMINAL_INPUT, onInput)
  ipcMain.on(IPC_CHANNELS.TERMINAL_RESIZE, onResize)

  // --- New IPC handlers for Phase 1C ---

  ipcMain.handle(IPC_CHANNELS.LIST_DIR, (_event, { path }: { path: string }): FileEntry[] => {
    if (!isPathAllowed(path)) {
      console.error('[ipc] Blocked file access to disallowed path:', path)
      return []
    }

    try {
      const entries = readdirSync(path, { withFileTypes: true })
      return entries.map((entry): FileEntry => {
        const fullPath = join(path, entry.name)
        let size = 0
        let modifiedAt = new Date().toISOString()

        try {
          const stat = statSync(fullPath)
          size = stat.size
          modifiedAt = stat.mtime.toISOString()
        } catch {
          // stat failed — return defaults
        }

        return {
          name: entry.name,
          path: fullPath,
          isDirectory: entry.isDirectory(),
          size,
          modifiedAt,
        }
      })
    } catch {
      console.error('[ipc] Failed to list directory:', path)
      return []
    }
  })

  ipcMain.handle(IPC_CHANNELS.READ_TEXT, (_event, { path }: { path: string }): string => {
    if (!isPathAllowed(path)) {
      console.error('[ipc] Blocked file access to disallowed path:', path)
      return ''
    }

    try {
      return readFileSync(path, 'utf-8')
    } catch {
      console.error('[ipc] Failed to read file:', path)
      return ''
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.SESSION_RESUME,
    (_event, { sessionId }: { sessionId: string }): { success: boolean; error?: string } => {
      try {
        const session = getSessionById(sessionId)
        if (!session) {
          return { success: false, error: `Session not found: ${sessionId}` }
        }
        writeToPty(`amplifier session resume ${sessionId}\n`)
        return { success: true }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[ipc] SESSION_RESUME failed:', message)
        return { success: false, error: message }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.GET_ANALYSIS,
    (_event, { sessionId }: { sessionId: string }): SessionAnalysisData | null => {
      try {
        return getAnalysis(sessionId)
      } catch (err) {
        console.error('[ipc] GET_ANALYSIS failed:', err)
        return null
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.TRIGGER_ANALYSIS,
    async (_event, { sessionId }: { sessionId: string }): Promise<SessionAnalysisData | null> => {
      try {
        const result = await triggerAnalysis(sessionId)
        if (mainWindow && !mainWindow.isDestroyed() && result) {
          mainWindow.webContents.send(IPC_CHANNELS.ANALYSIS_READY, result)
        }
        return result
      } catch (err) {
        console.error('[ipc] TRIGGER_ANALYSIS failed:', err)
        return null
      }
    },
  )

  // --- Workspace model IPC handlers ---

  ipcMain.handle(IPC_CHANNELS.PROJECT_DISCOVER, async (): Promise<DiscoveredProject[]> => {
    try {
      return discoverProjects(getAmplifierHome())
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[ipc] PROJECT_DISCOVER failed:', message)
      return []
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_REGISTER,
    async (
      _event,
      { slug, path: projPath, name }: { slug: string; path: string; name: string },
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        upsertProject(slug, projPath, name)
        setProjectRegistered(slug, 1)
        return { success: true }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[ipc] PROJECT_REGISTER failed:', message)
        return { success: false, error: message }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_UNREGISTER,
    async (
      _event,
      { slug }: { slug: string },
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        setProjectRegistered(slug, 0)
        return { success: true }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[ipc] PROJECT_UNREGISTER failed:', message)
        return { success: false, error: message }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.SESSION_HIDE,
    async (
      _event,
      { sessionId }: { sessionId: string },
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        setSessionHidden(sessionId, 1)
        return { success: true }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[ipc] SESSION_HIDE failed:', message)
        return { success: false, error: message }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.SESSION_STOP,
    async (): Promise<{ success: boolean; error: string }> => {
      return { success: false, error: 'Not yet wired' }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_SAVE,
    async (
      _event,
      { state }: { state: WorkspaceState },
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        saveWorkspaceState(state)
        return { success: true }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[ipc] WORKSPACE_SAVE failed:', message)
        return { success: false, error: message }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_GET,
    async (): Promise<{
      state: WorkspaceState
      isFirstTime: boolean
      error?: string
    }> => {
      try {
        const state = getWorkspaceState()
        const isFirstTime = getRegisteredProjectCount() === 0
        return { state, isFirstTime }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[ipc] WORKSPACE_GET failed:', message)
        return { state: {} as WorkspaceState, isFirstTime: true, error: message }
      }
    },
  )

  mainWindow.on('closed', () => {
    ipcMain.removeListener(IPC_CHANNELS.TERMINAL_INPUT, onInput)
    ipcMain.removeListener(IPC_CHANNELS.TERMINAL_RESIZE, onResize)
    ipcMain.removeHandler(IPC_CHANNELS.LIST_DIR)
    ipcMain.removeHandler(IPC_CHANNELS.READ_TEXT)
    ipcMain.removeHandler(IPC_CHANNELS.SESSION_RESUME)
    ipcMain.removeHandler(IPC_CHANNELS.GET_ANALYSIS)
    ipcMain.removeHandler(IPC_CHANNELS.TRIGGER_ANALYSIS)
    ipcMain.removeHandler(IPC_CHANNELS.PROJECT_DISCOVER)
    ipcMain.removeHandler(IPC_CHANNELS.PROJECT_REGISTER)
    ipcMain.removeHandler(IPC_CHANNELS.PROJECT_UNREGISTER)
    ipcMain.removeHandler(IPC_CHANNELS.SESSION_HIDE)
    ipcMain.removeHandler(IPC_CHANNELS.SESSION_STOP)
    ipcMain.removeHandler(IPC_CHANNELS.WORKSPACE_SAVE)
    ipcMain.removeHandler(IPC_CHANNELS.WORKSPACE_GET)
    killPty()
  })
}

// --- Push functions (Main → Renderer) ---

export function pushSessionsChanged(mainWindow: BrowserWindow, sessions: SessionState[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.SESSIONS_CHANGED, sessions)
  }
}

export function pushFilesChanged(
  mainWindow: BrowserWindow,
  sessionId: string,
  files: FileActivity[]
): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.FILES_CHANGED, { sessionId, files })
  }
}

export function pushWorkspaceState(mainWindow: BrowserWindow, state: WorkspaceState): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.WORKSPACE_STATE, state)
  }
}

export function pushRunningSessionsToast(mainWindow: BrowserWindow, count: number): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.RUNNING_SESSIONS_TOAST, count)
  }
}
