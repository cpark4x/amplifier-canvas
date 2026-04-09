import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/types'
import type { SessionState, FileActivity, FileEntry } from '../shared/types'

// Expose protected APIs to the renderer process via contextBridge
const api = {
  // Terminal: send input to PTY
  sendTerminalInput: (data: string): void => {
    ipcRenderer.send(IPC_CHANNELS.TERMINAL_INPUT, data)
  },

  // Terminal: resize PTY
  sendTerminalResize: (cols: number, rows: number): void => {
    ipcRenderer.send(IPC_CHANNELS.TERMINAL_RESIZE, { cols, rows })
  },

  // Terminal: receive data from PTY
  onTerminalData: (callback: (data: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: string): void => {
      callback(data)
    }
    ipcRenderer.on(IPC_CHANNELS.TERMINAL_DATA, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.TERMINAL_DATA, handler)
    }
  },

  // Terminal: PTY process exited
  onTerminalExit: (callback: (info: { exitCode: number; signal?: number }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: { exitCode: number; signal?: number }): void => {
      callback(info)
    }
    ipcRenderer.on(IPC_CHANNELS.TERMINAL_EXIT, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.TERMINAL_EXIT, handler)
    }
  },

  // Sessions: receive updated session list
  onSessionsChanged: (callback: (sessions: SessionState[]) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, sessions: SessionState[]): void => {
      callback(sessions)
    }
    ipcRenderer.on(IPC_CHANNELS.SESSIONS_CHANGED, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.SESSIONS_CHANGED, handler)
    }
  },

  // Files: receive updated file activity for a session
  onFilesChanged: (callback: (data: { sessionId: string; files: FileActivity[] }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string; files: FileActivity[] }): void => {
      callback(data)
    }
    ipcRenderer.on(IPC_CHANNELS.FILES_CHANGED, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.FILES_CHANGED, handler)
    }
  },

  // Files: list directory contents
  listDir: (path: string): Promise<FileEntry[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.LIST_DIR, { path })
  },

  // Files: read text file contents
  readTextFile: (path: string): Promise<string> => {
    return ipcRenderer.invoke(IPC_CHANNELS.READ_TEXT, { path })
  },

  // Sessions: resume a completed session
  resumeSession: (sessionId: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SESSION_RESUME, { sessionId })
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)

// Type declaration for the renderer
export type ElectronAPI = typeof api
