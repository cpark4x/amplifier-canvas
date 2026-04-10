import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/types'
import type { SessionState, FileActivity, FileEntry } from '../shared/types'
import type { SessionAnalysisData } from '../shared/analysisTypes'

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

  // Analysis: get cached analysis data for a session
  getAnalysis: (sessionId: string): Promise<SessionAnalysisData | null> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_ANALYSIS, { sessionId })
  },

  // Analysis: trigger analysis for a session
  triggerAnalysis: (sessionId: string): Promise<SessionAnalysisData | null> => {
    return ipcRenderer.invoke(IPC_CHANNELS.TRIGGER_ANALYSIS, { sessionId })
  },

  // Analysis: subscribe to analysis-ready push events
  onAnalysisReady: (callback: (data: SessionAnalysisData) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: SessionAnalysisData): void => {
      callback(data)
    }
    ipcRenderer.on(IPC_CHANNELS.ANALYSIS_READY, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.ANALYSIS_READY, handler)
    }
  },

  // Workspace: discover available Amplifier projects
  discoverProjects: (amplifierHome: string): Promise<Array<{ slug: string; name: string; path: string }>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.PROJECT_DISCOVER, { amplifierHome })
  },

  // Workspace: register a project (add to Canvas)
  registerProject: (slug: string, path: string, name: string): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.PROJECT_REGISTER, { slug, path, name })
  },

  // Workspace: unregister a project (remove from Canvas)
  unregisterProject: (slug: string): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.PROJECT_UNREGISTER, { slug })
  },

  // Sessions: hide a session from view
  hideSession: (sessionId: string): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SESSION_HIDE, { sessionId })
  },

  // Sessions: stop a running session
  stopSession: (sessionId: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SESSION_STOP, { sessionId })
  },

  // Workspace state: save current state
  saveWorkspaceState: (state: {
    selectedProjectSlug: string | null
    expandedProjectSlugs: string[]
    selectedSessionId: string | null
    sidebarCollapsed: boolean
  }): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_SAVE, state)
  },

  // Workspace state: get saved state
  getWorkspaceState: (): Promise<{
    state: {
      selectedProjectSlug: string | null
      expandedProjectSlugs: string[]
      selectedSessionId: string | null
      sidebarCollapsed: boolean
    }
    isFirstTime: boolean
  }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_GET)
  },

  // Workspace state: subscribe to workspace state push events
  onWorkspaceState: (callback: (state: {
    selectedProjectSlug: string | null
    expandedProjectSlugs: string[]
    selectedSessionId: string | null
    sidebarCollapsed: boolean
  }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: {
      selectedProjectSlug: string | null
      expandedProjectSlugs: string[]
      selectedSessionId: string | null
      sidebarCollapsed: boolean
    }): void => {
      callback(state)
    }
    ipcRenderer.on(IPC_CHANNELS.WORKSPACE_STATE, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.WORKSPACE_STATE, handler)
    }
  },

  // App: subscribe to running sessions toast on quit
  onRunningSessionsToast: (callback: (data: { count: number }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { count: number }): void => {
      callback(data)
    }
    ipcRenderer.on(IPC_CHANNELS.RUNNING_SESSIONS_TOAST, handler)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.RUNNING_SESSIONS_TOAST, handler)
    }
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)

// Type declaration for the renderer
export type ElectronAPI = typeof api
