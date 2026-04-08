import { ipcMain, BrowserWindow } from 'electron'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, resolve, normalize } from 'path'
import { IPC_CHANNELS } from '../shared/types'
import type { SessionState, FileActivity, FileEntry } from '../shared/types'
import { spawnPty, writeToPty, resizePty, killPty } from './pty'
import { getAmplifierHome } from './scanner'

// Track allowed directories for file access security
let allowedDirs: string[] = []

export function setAllowedDirs(dirs: string[]): void {
  allowedDirs = dirs.map((d) => resolve(normalize(d)))
}

function isPathAllowed(requestedPath: string): boolean {
  const resolved = resolve(normalize(requestedPath))
  return allowedDirs.some((dir) => resolved.startsWith(dir))
}

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  const ptyProcess = spawnPty(80, 24)

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

  const onInput = (_event: Electron.IpcMainEvent, data: string): void => {
    writeToPty(data)
  }

  const onResize = (_event: Electron.IpcMainEvent, { cols, rows }: { cols: number; rows: number }): void => {
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

  mainWindow.on('closed', () => {
    ipcMain.removeListener(IPC_CHANNELS.TERMINAL_INPUT, onInput)
    ipcMain.removeListener(IPC_CHANNELS.TERMINAL_RESIZE, onResize)
    ipcMain.removeHandler(IPC_CHANNELS.LIST_DIR)
    ipcMain.removeHandler(IPC_CHANNELS.READ_TEXT)
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
