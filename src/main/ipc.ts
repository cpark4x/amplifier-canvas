import { ipcMain, BrowserWindow, shell } from 'electron'
import { IPC_CHANNELS } from '../shared/types'
import type { SessionState, FileActivity } from '../shared/types'
import { spawnPty, writeToPty, resizePty, killPty, killAllPtys, getPty, hasPty, appendToBuffer, getBuffer, setPtyProject, getPtyProject, renamePty } from './pty'
import {
  getSessionById,
  setSessionHidden,
  batchHideSessions,
  getRegisteredProjects,
  getRegisteredProjectCount,
  getVisibleProjectSessions,
  upsertSession,
} from './db'
import { getWorkspaceState, saveWorkspaceState } from './workspace'
import type { WorkspaceState } from './workspace'
import { getAnalysis, triggerAnalysis } from './analysisService'
import type { SessionAnalysisData } from '../shared/analysisTypes'
import { getSettings, saveSettings, getDefaultSettings } from './settings'
import type { CanvasSettings } from '../shared/types'

// Domain-grouped handlers
import { registerFileHandlers, setAllowedDirs, addAllowedDir, isPathAllowed } from './ipc-files'
import { registerProjectHandlers } from './ipc-project'

// Re-export for index.ts and other consumers
export { setAllowedDirs, addAllowedDir, isPathAllowed }

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  // --- Domain-grouped handler modules ---
  registerFileHandlers()
  registerProjectHandlers()

  // --- Per-session PTY management ---

  // Captures Amplifier session ID from PTY output. One-shot per PTY — once captured,
  // the scanner stops. Amplifier prints: "Session ID: <ansi codes><uuid>"
  const SESSION_ID_PATTERN = /Session ID:[\s│]*(?:\x1b\[[0-9;]*m)*\s*(?:\x1b\[[0-9;]*m)*([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i
  // Track which PTYs have already captured their session ID (one-shot)
  const capturedSessions = new Set<string>()

  // Helper to attach PTY output/exit listeners that tag data with sessionId.
  // currentId is mutable — when the PTY is renamed (synthetic → real session ID),
  // the closure picks up the new ID so output is tagged correctly.
  function attachPtyListeners(sessionId: string, pty: ReturnType<typeof spawnPty>): void {
    let currentId = sessionId
    let scanBuffer = ''

    pty.onData((data) => {
      appendToBuffer(currentId, data)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.TERMINAL_DATA, { sessionId: currentId, data })
      }

      // One-shot session ID capture from PTY output.
      // Only scan synthetic PTYs (terminal-*) that haven't captured yet.
      if (sessionId.startsWith('terminal-') && !capturedSessions.has(sessionId)) {
        const cleaned = data.replace(/\r\x1b\[2K/g, '').replace(/\r(?!\n)/g, '')
        scanBuffer += cleaned
        const match = scanBuffer.match(SESSION_ID_PATTERN)
        if (match) {
          const realSessionId = match[1]
          capturedSessions.add(sessionId)
          console.log(`[pty-capture] Captured session ID: ${sessionId} → ${realSessionId}`)
          scanBuffer = ''

          // Re-key PTY in all maps
          renamePty(sessionId, realSessionId)
          // Update the mutable closure so subsequent onData/onExit use the real ID
          currentId = realSessionId

          // Write DB row immediately — the session exists now, don't wait for the
          // file watcher to discover it on disk. The watcher will UPDATE this row
          // later with stats and status changes from events.jsonl.
          const projectSlug = getPtyProject(realSessionId) // renamed, so lookup with new ID
            || getPtyProject(sessionId) // fallback to old ID just in case
          console.log(`[pty-capture] Project lookup: getPtyProject('${realSessionId}')=${getPtyProject(realSessionId)}, getPtyProject('${sessionId}')=${getPtyProject(sessionId)}`)
          if (projectSlug) {
            upsertSession({
              id: realSessionId,
              projectSlug,
              startedBy: 'canvas',
              startedAt: new Date().toISOString(),
              status: 'active',
              byteOffset: 0,
              hidden: false,
            })
            console.log(`[pty-capture] DB row created for ${realSessionId} (project: ${projectSlug})`)
          }

          // Tell the renderer
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(IPC_CHANNELS.PTY_SESSION_CAPTURED, { ptyId: sessionId, sessionId: realSessionId })
          }
        }
        if (scanBuffer.length > 100_000) {
          console.log(`[pty-capture] Gave up scanning ${sessionId} (buffer exceeded 100KB)`)
          capturedSessions.add(sessionId)
          scanBuffer = ''
        }
      }
    })
    pty.onExit(({ exitCode, signal }) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.TERMINAL_EXIT, { sessionId: currentId, exitCode, signal })
      }
    })
  }

  // PTY_SPAWN: Create a new PTY for a session (or reuse if already exists)
  ipcMain.handle(
    IPC_CHANNELS.PTY_SPAWN,
    (
      _event,
      { sessionId, cwd, cols, rows, projectSlug }: { sessionId: string; cwd?: string; cols: number; rows: number; projectSlug?: string },
    ): { success: boolean; alreadyExists?: boolean; error?: string } => {
      try {
        if (hasPty(sessionId)) {
          return { success: true, alreadyExists: true }
        }
        const pty = spawnPty(sessionId, cols, rows, cwd)
        attachPtyListeners(sessionId, pty)

        // Track which project this Canvas-spawned PTY belongs to
        if (projectSlug) {
          setPtyProject(sessionId, projectSlug)
        }

        return { success: true }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[ipc] PTY_SPAWN failed:', message)
        return { success: false, error: message }
      }
    },
  )

  // PTY_KILL: Kill a specific session's PTY
  ipcMain.handle(
    IPC_CHANNELS.PTY_KILL,
    (_event, { sessionId }: { sessionId: string }): { success: boolean } => {
      killPty(sessionId)
      return { success: true }
    },
  )

  // PTY_RENAME: Re-key a PTY from a synthetic ID to the real session ID.
  // The underlying process is untouched — only the map entries move.
  ipcMain.handle(
    IPC_CHANNELS.PTY_RENAME,
    (_event, { oldId, newId }: { oldId: string; newId: string }): { success: boolean } => {
      const renamed = renamePty(oldId, newId)
      return { success: renamed }
    },
  )

  // PTY_GET_BUFFER: Get buffered output for terminal replay on session switch
  ipcMain.handle(
    IPC_CHANNELS.PTY_GET_BUFFER,
    (_event, { sessionId }: { sessionId: string }): string => {
      return getBuffer(sessionId)
    },
  )

  // TERMINAL_INPUT: Route keystrokes to the correct session's PTY
  const onInput = (
    _event: Electron.IpcMainEvent,
    { sessionId, data }: { sessionId: string; data: string },
  ): void => {
    writeToPty(sessionId, data)
  }

  // TERMINAL_RESIZE: Resize the correct session's PTY
  const onResize = (
    _event: Electron.IpcMainEvent,
    { sessionId, cols, rows }: { sessionId: string; cols: number; rows: number },
  ): void => {
    resizePty(sessionId, cols, rows)
  }

  ipcMain.on(IPC_CHANNELS.TERMINAL_INPUT, onInput)
  ipcMain.on(IPC_CHANNELS.TERMINAL_RESIZE, onResize)

  // --- Session management ---

  ipcMain.handle(
    IPC_CHANNELS.SESSION_RESUME,
    (_event, { sessionId }: { sessionId: string }): { success: boolean; error?: string } => {
      try {
        const session = getSessionById(sessionId)
        if (!session) {
          return { success: false, error: `Session not found: ${sessionId}` }
        }
        // Write the resume command to the session's own PTY
        writeToPty(sessionId, `amplifier session resume ${sessionId}\n`)
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

  ipcMain.handle(
    IPC_CHANNELS.SESSION_LIST_INITIAL,
    async (): Promise<SessionState[]> => {
      try {
        const projects = getRegisteredProjects()
        const sessions: SessionState[] = []
        for (const project of projects) {
          const dbSessions = getVisibleProjectSessions(project.slug)
          for (const row of dbSessions) {
            sessions.push({
              id: row.id,
              projectSlug: row.projectSlug,
              projectName: project.name,
              status: (row.status as SessionState['status']) || 'active',
              startedAt: row.startedAt,
              startedBy: 'external',
              byteOffset: row.byteOffset || 0,
              recentFiles: [],
              workDir: project.path,
              title: row.title ?? undefined,
              endedAt: row.endedAt ?? undefined,
              exitCode: row.exitCode ?? undefined,
              promptCount: row.promptCount ?? undefined,
              toolCallCount: row.toolCallCount ?? undefined,
              filesChangedCount: row.filesChangedCount ?? undefined,
            })
          }
        }
        return sessions
      } catch (err) {
        console.error('[ipc] SESSION_LIST_INITIAL failed:', err instanceof Error ? err.message : String(err))
        return []
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
    IPC_CHANNELS.SESSION_BATCH_HIDE,
    async (
      _event,
      { sessionIds }: { sessionIds: string[] },
    ): Promise<{ success: boolean; hiddenCount: number; error?: string }> => {
      try {
        const hiddenCount = batchHideSessions(sessionIds)
        return { success: true, hiddenCount }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[ipc] SESSION_BATCH_HIDE failed:', message)
        return { success: false, hiddenCount: 0, error: message }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.SESSION_STOP,
    async (
      _event,
      { sessionId }: { sessionId: string },
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        // Send Ctrl+C (SIGINT) to the session's PTY
        const pty = getPty(sessionId)
        if (pty) {
          pty.write('\x03')  // ETX = Ctrl+C
          return { success: true }
        }
        return { success: false, error: `No active PTY for session ${sessionId}` }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[ipc] SESSION_STOP failed:', message)
        return { success: false, error: message }
      }
    },
  )

  // --- Workspace & settings ---

  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_SAVE,
    async (
      _event,
      state: WorkspaceState,
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

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET,
    async (): Promise<CanvasSettings> => {
      try {
        return getSettings()
      } catch (err) {
        console.error('[ipc] SETTINGS_GET failed:', err)
        return getDefaultSettings()
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SAVE,
    async (_event, settings: CanvasSettings): Promise<{ success: boolean }> => {
      try {
        return saveSettings(settings)
      } catch (err) {
        console.error('[ipc] SETTINGS_SAVE failed:', err)
        return { success: false }
      }
    },
  )

  // --- Open external URL handler ---
  const ALLOWED_PROTOCOLS = new Set(['https:', 'http:'])
  ipcMain.handle(
    IPC_CHANNELS.OPEN_EXTERNAL,
    async (_event, { url }: { url: string }): Promise<void> => {
      try {
        const parsed = new URL(url)
        if (ALLOWED_PROTOCOLS.has(parsed.protocol)) {
          await shell.openExternal(parsed.toString())
        }
      } catch {
        console.error('[ipc] OPEN_EXTERNAL blocked:', url)
      }
    },
  )

  mainWindow.on('closed', () => {
    ipcMain.removeListener(IPC_CHANNELS.TERMINAL_INPUT, onInput)
    ipcMain.removeListener(IPC_CHANNELS.TERMINAL_RESIZE, onResize)
    ipcMain.removeHandler(IPC_CHANNELS.PTY_SPAWN)
    ipcMain.removeHandler(IPC_CHANNELS.PTY_KILL)
    ipcMain.removeHandler(IPC_CHANNELS.PTY_RENAME)
    ipcMain.removeHandler(IPC_CHANNELS.PTY_GET_BUFFER)
    ipcMain.removeHandler(IPC_CHANNELS.LIST_DIR)
    ipcMain.removeHandler(IPC_CHANNELS.READ_TEXT)
    ipcMain.removeHandler(IPC_CHANNELS.SESSION_RESUME)
    ipcMain.removeHandler(IPC_CHANNELS.GET_ANALYSIS)
    ipcMain.removeHandler(IPC_CHANNELS.TRIGGER_ANALYSIS)
    ipcMain.removeHandler(IPC_CHANNELS.PROJECT_DISCOVER)
    ipcMain.removeHandler(IPC_CHANNELS.PROJECT_REGISTER)
    ipcMain.removeHandler(IPC_CHANNELS.PROJECT_UNREGISTER)
    ipcMain.removeHandler(IPC_CHANNELS.PROJECT_LIST_REGISTERED)
    ipcMain.removeHandler(IPC_CHANNELS.OPEN_EXTERNAL)
    ipcMain.removeHandler(IPC_CHANNELS.SESSION_LIST_INITIAL)
    ipcMain.removeHandler(IPC_CHANNELS.SESSION_HIDE)
    ipcMain.removeHandler(IPC_CHANNELS.SESSION_BATCH_HIDE)
    ipcMain.removeHandler(IPC_CHANNELS.PROJECT_OVERVIEW)
    ipcMain.removeHandler(IPC_CHANNELS.PROJECT_HISTORY)
    ipcMain.removeHandler(IPC_CHANNELS.PROJECT_STATS)
    ipcMain.removeHandler(IPC_CHANNELS.PROJECT_CONTEXT)
    ipcMain.removeHandler(IPC_CHANNELS.SESSION_STOP)
    ipcMain.removeHandler(IPC_CHANNELS.WORKSPACE_SAVE)
    ipcMain.removeHandler(IPC_CHANNELS.WORKSPACE_GET)
    ipcMain.removeHandler(IPC_CHANNELS.SETTINGS_GET)
    ipcMain.removeHandler(IPC_CHANNELS.SETTINGS_SAVE)
    killAllPtys()
  })
}

// --- Push functions (Main → Renderer) ---

export function pushSessionsChanged(mainWindow: BrowserWindow, sessions: SessionState[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.SESSIONS_CHANGED, sessions)
  }
}

export function pushProjectsChanged(
  mainWindow: BrowserWindow,
  projects: Array<{ slug: string; name: string; path: string }>
): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.PROJECTS_CHANGED, projects)
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
    mainWindow.webContents.send(IPC_CHANNELS.RUNNING_SESSIONS_TOAST, { count })
  }
}
