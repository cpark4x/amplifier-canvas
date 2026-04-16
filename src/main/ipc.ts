import { ipcMain, BrowserWindow } from 'electron'
import { mkdirSync, existsSync } from 'fs'
import { readdir, stat, readFile } from 'fs/promises'
import { join, resolve, normalize } from 'path'
import { execSync } from 'child_process'
import { IPC_CHANNELS } from '../shared/types'
import type { SessionState, FileActivity, FileEntry, ProjectStatsData, ProjectHistorySession, ProjectContext } from '../shared/types'
import { spawnPty, writeToPty, resizePty, killPty, killAllPtys, getPty, hasPty, appendToBuffer, getBuffer, setPtyProject } from './pty'
import { getAmplifierHome, scanSingleProject, countProjectSessionsOnDisk, countAgentSessionsOnDisk } from './scanner'
import {
  getSessionById,
  getRegisteredProjects,
  setProjectRegistered,
  setSessionHidden,
  batchHideSessions,
  upsertProject,
  getRegisteredProjectCount,
  getProjectBySlug,
  getProjectOverviewStats,
  getRecentSessionSummaries,
  getAllProjectSessions,
  getDailySessionCounts,
  updateLastVisited,
  getLastVisitedAt,
  getStalledSessions,
} from './db'
import { generateProjectAssessment } from './project-assessment'
import { getWorkspaceState, saveWorkspaceState } from './workspace'
import type { WorkspaceState } from './workspace'
import { discoverProjects } from './discovery'
import type { DiscoveredProject } from './discovery'
import { getAnalysis, triggerAnalysis } from './analysisService'
import type { SessionAnalysisData } from '../shared/analysisTypes'
import { addProjectWatch } from './watcher'
import { getSettings, saveSettings, getDefaultSettings } from './settings'
import type { CanvasSettings } from '../shared/types'

// Track allowed directories for file access security
let allowedDirs: string[] = []

export function setAllowedDirs(dirs: string[]): void {
  allowedDirs = dirs.map((d) => resolve(normalize(d)))
}

export function addAllowedDir(dir: string): void {
  const resolved = resolve(normalize(dir))
  if (!allowedDirs.includes(resolved)) {
    allowedDirs.push(resolved)
  }
}

export function isPathAllowed(requestedPath: string): boolean {
  const resolved = resolve(normalize(requestedPath))
  return allowedDirs.some((dir) => resolved.startsWith(dir))
}

function classifySession(session: { title: string | null; status: string; promptCount: number; firstPrompt: string | null }): { classification: import('../shared/types').SessionClassification; label: string } {
  const title = session.title ?? ''
  const isAutoTitle = title.startsWith('load_skill') || title.startsWith('Execute recipe') || title.startsWith('amplifier tool')

  // Ghost sessions: no title AND 0 prompts — empty/broken sessions
  if (!title && session.promptCount === 0) {
    return { classification: 'failed-auto', label: 'Ghost' }
  }
  if (isAutoTitle && session.status === 'failed') {
    return { classification: 'failed-auto', label: 'Failed Auto' }
  }
  if (isAutoTitle) {
    return { classification: 'automated', label: 'Automated' }
  }
  if (session.promptCount >= 8) {
    return { classification: 'deep-work', label: 'Deep Work' }
  }
  return { classification: 'quick-task', label: 'Quick Task' }
}

function getGitCommits(projectPath: string, since?: string | null, limit = 20): { hash: string; message: string; date: string; author: string }[] {
  try {
    const sinceArg = since ? `--since="${since}"` : ''
    const cmd = `git -C "${projectPath}" log --format="%H|||%s|||%ai|||%an" ${sinceArg} -${limit} 2>/dev/null`
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim()
    if (!output) return []
    return output.split('\n').map(line => {
      const [hash, message, date, author] = line.split('|||')
      return { hash: hash.substring(0, 7), message, date, author }
    })
  } catch {
    return []
  }
}

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  // --- Per-session PTY management ---
  // Helper to attach PTY output/exit listeners that tag data with sessionId
  function attachPtyListeners(sessionId: string, pty: ReturnType<typeof spawnPty>): void {
    pty.onData((data) => {
      // Buffer output for replay when switching terminals
      appendToBuffer(sessionId, data)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.TERMINAL_DATA, { sessionId, data })
      }
    })
    pty.onExit(({ exitCode, signal }) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.TERMINAL_EXIT, { sessionId, exitCode, signal })
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

  // --- New IPC handlers for Phase 1C ---

  ipcMain.handle(IPC_CHANNELS.LIST_DIR, async (_event, { path: dirPath }: { path: string }): Promise<FileEntry[]> => {
    if (!isPathAllowed(dirPath)) {
      console.error('[ipc] Blocked file access to disallowed path:', dirPath)
      return []
    }

    try {
      const entries = await readdir(dirPath, { withFileTypes: true })
      const results: FileEntry[] = []
      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name)
        let size = 0
        let modifiedAt = new Date().toISOString()

        try {
          const s = await stat(fullPath)
          size = s.size
          modifiedAt = s.mtime.toISOString()
        } catch {
          // stat failed — return defaults
        }

        results.push({
          name: entry.name,
          path: fullPath,
          isDirectory: entry.isDirectory(),
          size,
          modifiedAt,
        })
      }
      return results
    } catch {
      console.error('[ipc] Failed to list directory:', dirPath)
      return []
    }
  })

  ipcMain.handle(IPC_CHANNELS.READ_TEXT, async (_event, { path: filePath }: { path: string }): Promise<string> => {
    if (!isPathAllowed(filePath)) {
      console.error('[ipc] Blocked file access to disallowed path:', filePath)
      return ''
    }

    try {
      return await readFile(filePath, 'utf-8')
    } catch {
      console.error('[ipc] Failed to read file:', filePath)
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
    ): Promise<{ success: boolean; sessions?: SessionState[]; error?: string }> => {
      try {
        // (1) Create project directory and sessions/ subdirectory if they don't exist.
        // Creating sessions/ here ensures addProjectWatch() can set up the chokidar watcher
        // immediately, so Amplifier-created sessions show up in the sidebar without a restart.
        if (!existsSync(projPath)) {
          mkdirSync(projPath, { recursive: true })
        }
        const sessionsDir = join(projPath, 'sessions')
        if (!existsSync(sessionsDir)) {
          mkdirSync(sessionsDir, { recursive: true })
        }

        // (2) Register in DB
        upsertProject(slug, projPath, name)
        setProjectRegistered(slug, 1)

        // (3) Scan sessions from disk and persist to DB
        const amplifierHome = getAmplifierHome()
        const sessions = scanSingleProject(amplifierHome, slug, name)

        // (4) Start watching this project for live updates.
        // The sessions/ dir now exists so addProjectWatch() won't bail early.
        addProjectWatch(slug)

        // (4) Return sessions to the renderer — it will merge into its store
        return { success: true, sessions }
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
    IPC_CHANNELS.PROJECT_OVERVIEW,
    async (
      _event,
      { slug }: { slug: string },
    ): Promise<import('../shared/types').ProjectOverview | null> => {
      try {
        const project = getProjectBySlug(slug)
        if (!project) return null
        // NOTE: do NOT call updateLastVisited here — PROJECT_CONTEXT handles it
        // after reading the old value. Calling it here causes a race condition
        // where CONTEXT reads the just-updated timestamp and finds zero new commits.
        const stats = getProjectOverviewStats(slug)
        // Use on-disk count for real total (DB is capped at 20 most recent)
        const diskSessionCount = countProjectSessionsOnDisk(getAmplifierHome(), slug)
        const totalSessions = Math.max(diskSessionCount, stats.sessionCount)

        const agentSessionCount = countAgentSessionsOnDisk(getAmplifierHome(), slug)
        const rootSessionCount = totalSessions
        const delegationRatio = rootSessionCount > 0 ? Math.round((agentSessionCount / rootSessionCount) * 10) / 10 : 0
        
        // Meaningful success rate: exclude automated sessions
        const allSessionsForRate = getAllProjectSessions(slug)
        const nonAutoSessions = allSessionsForRate.filter(s => {
          const c = classifySession(s)
          return c.classification !== 'automated' && c.classification !== 'failed-auto'
        })
        const nonAutoDone = nonAutoSessions.filter(s => s.status === 'done').length
        const nonAutoCompleted = nonAutoSessions.filter(s => s.status === 'done' || s.status === 'failed').length
        const meaningfulSuccessRate = nonAutoCompleted > 0 ? Math.round((nonAutoDone / nonAutoCompleted) * 100) : 0

        // Generate assessment from session data
        const recentSessions = getRecentSessionSummaries(slug)
        const { assessment, outcomes } = generateProjectAssessment(recentSessions, totalSessions)

        // Read project README.md for description
        let description: string | undefined
        try {
          const readmePath = join(project.path, 'README.md')
          const readmeContent = await readFile(readmePath, 'utf-8')
          // Extract first paragraph after the # title line
          const lines = readmeContent.split('\n')
          let foundTitle = false
          const paragraphLines: string[] = []
          for (const line of lines) {
            if (!foundTitle && line.startsWith('#')) {
              foundTitle = true
              continue
            }
            if (foundTitle) {
              const trimmed = line.trim()
              if (trimmed === '' && paragraphLines.length > 0) break
              if (trimmed === '') continue
              if (trimmed.startsWith('#')) break // next heading
              paragraphLines.push(trimmed)
            }
          }
          if (paragraphLines.length > 0) {
            description = paragraphLines.join(' ')
          }
        } catch {
          // No README or unreadable — description stays undefined
        }

        // Compute health ratio from all sessions
        const allSessions = getAllProjectSessions(slug)
        const healthRatio = { done: 0, failed: 0, active: 0, total: allSessions.length }
        for (const s of allSessions) {
          if (s.status === 'done') healthRatio.done++
          else if (s.status === 'failed') healthRatio.failed++
          else if (['active', 'running', 'needs_input'].includes(s.status)) healthRatio.active++
        }

        // Top 5 recent meaningful sessions (filter out automated junk)
        const meaningfulSessions = allSessions
          .filter((s) => s.title && s.title.length > 10
            && !s.title.startsWith('load_skill')
            && !s.title.startsWith('Execute recipe'))
          .slice(0, 5)
          .map((s) => ({
            title: s.title!,
            status: s.status,
            startedAt: s.startedAt,
            promptCount: s.promptCount,
          }))

        const result = {
          slug: project.slug,
          name: project.name,
          path: project.path,
          sessionCount: totalSessions,
          totalPrompts: stats.totalPrompts,
          totalToolCalls: stats.totalToolCalls,
          totalFilesChanged: stats.totalFilesChanged,
          activeSessionCount: stats.activeSessionCount,
          lastActivityAt: stats.lastActivityAt ?? new Date().toISOString(),
          assessment,
          outcomes,
          description,
          healthRatio,
          recentSessions: meaningfulSessions,
          rootSessionCount,
          agentSessionCount,
          delegationRatio,
          meaningfulSuccessRate,
        }
        return result
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[ipc] PROJECT_OVERVIEW failed:', message)
        return null
      }
    },
  )

  // --- Project History handler ---
  ipcMain.handle(
    IPC_CHANNELS.PROJECT_HISTORY,
    async (
      _event,
      { slug }: { slug: string },
    ): Promise<ProjectHistorySession[]> => {
      try {
        const sessions = getAllProjectSessions(slug)
        const ampHome = getAmplifierHome()
        return sessions.map((s) => ({
          id: s.id,
          title: s.title,
          status: s.status,
          startedAt: s.startedAt,
          endedAt: s.endedAt,
          promptCount: s.promptCount,
          toolCallCount: s.toolCallCount,
          filesChangedCount: (s as any).filesChangedCount ?? 0,
          classification: classifySession(s).classification,
          firstPrompt: s.firstPrompt,
        }))
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[ipc] PROJECT_HISTORY failed:', message)
        return []
      }
    },
  )

  // --- Project Stats handler ---
  ipcMain.handle(
    IPC_CHANNELS.PROJECT_STATS,
    async (
      _event,
      { slug }: { slug: string },
    ): Promise<ProjectStatsData | null> => {
      try {
        const overviewStats = getProjectOverviewStats(slug)
        const dailyActivity = getDailySessionCounts(slug)
        const allSessions = getAllProjectSessions(slug)

        // Status distribution
        const statusDistribution = { done: 0, failed: 0, active: 0, other: 0 }
        for (const s of allSessions) {
          if (s.status === 'done') statusDistribution.done++
          else if (s.status === 'failed') statusDistribution.failed++
          else if (['active', 'running', 'needs_input'].includes(s.status)) statusDistribution.active++
          else statusDistribution.other++
        }

        // Success rate (done / (done + failed), ignore active/other)
        const completedTotal = statusDistribution.done + statusDistribution.failed
        const successRate = completedTotal > 0
          ? Math.round((statusDistribution.done / completedTotal) * 100)
          : 0

        // Averages
        const sessionCount = allSessions.length || 1
        const avgPromptsPerSession = Math.round((overviewStats.totalPrompts / sessionCount) * 10) / 10
        const avgToolsPerSession = Math.round((overviewStats.totalToolCalls / sessionCount) * 10) / 10

        // Average duration in minutes (only for sessions with endedAt)
        let totalDurationMs = 0
        let durationCount = 0
        for (const s of allSessions) {
          if (s.endedAt) {
            const dur = new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()
            if (dur > 0) {
              totalDurationMs += dur
              durationCount++
            }
          }
        }
        const avgDurationMinutes = durationCount > 0
          ? Math.round(totalDurationMs / durationCount / 60000)
          : 0

        // Root vs agent counts
        const ampHome = getAmplifierHome()
        const agentSessionCount = countAgentSessionsOnDisk(ampHome, slug)
        const rootSessionCount = allSessions.length
        const delegationRatio = rootSessionCount > 0 ? Math.round((agentSessionCount / rootSessionCount) * 10) / 10 : 0
        
        // Classification breakdown
        const classificationBreakdown = { deepWork: 0, quickTask: 0, automated: 0, failedAuto: 0 }
        for (const s of allSessions) {
          const c = classifySession(s)
          if (c.classification === 'deep-work') classificationBreakdown.deepWork++
          else if (c.classification === 'quick-task') classificationBreakdown.quickTask++
          else if (c.classification === 'automated') classificationBreakdown.automated++
          else if (c.classification === 'failed-auto') classificationBreakdown.failedAuto++
        }
        
        // Meaningful success rate (excludes automated noise)
        const meaningfulSessions = allSessions.filter(s => {
          const c = classifySession(s)
          return c.classification !== 'automated' && c.classification !== 'failed-auto'
        })
        const meaningfulDone = meaningfulSessions.filter(s => s.status === 'done').length
        const meaningfulCompleted = meaningfulSessions.filter(s => s.status === 'done' || s.status === 'failed').length
        const meaningfulSuccessRate = meaningfulCompleted > 0 ? Math.round((meaningfulDone / meaningfulCompleted) * 100) : 0
        const meaningfulSessionCount = meaningfulSessions.length

        return {
          totalSessions: allSessions.length,
          totalPrompts: overviewStats.totalPrompts,
          totalToolCalls: overviewStats.totalToolCalls,
          totalFilesChanged: overviewStats.totalFilesChanged,
          successRate,
          avgPromptsPerSession,
          avgToolsPerSession,
          avgDurationMinutes,
          dailyActivity,
          statusDistribution,
          rootSessionCount,
          agentSessionCount,
          delegationRatio,
          classificationBreakdown,
          meaningfulSuccessRate,
          meaningfulSessionCount,
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[ipc] PROJECT_STATS failed:', message)
        return null
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_CONTEXT,
    async (_event, { slug }: { slug: string }): Promise<ProjectContext | null> => {
      try {
        const project = getProjectBySlug(slug)
        if (!project) return null

        const lastVisitedAt = getLastVisitedAt(slug)
        const allCommits = getGitCommits(project.path, null, 20)
        const commitsSinceLastVisit = lastVisitedAt
          ? getGitCommits(project.path, lastVisitedAt)
          : []

        // Get stalled sessions (needs_input/running, older than 1 day)
        const stalledSessions = getStalledSessions(slug)

        // Update last visited timestamp
        updateLastVisited(slug)

        return {
          lastVisitedAt,
          recentCommits: allCommits,
          commitsSinceLastVisit,
          stalledSessions,
        }
      } catch (err) {
        console.error('[ipc] PROJECT_CONTEXT failed:', err)
        return null
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

  mainWindow.on('closed', () => {
    ipcMain.removeListener(IPC_CHANNELS.TERMINAL_INPUT, onInput)
    ipcMain.removeListener(IPC_CHANNELS.TERMINAL_RESIZE, onResize)
    ipcMain.removeHandler(IPC_CHANNELS.PTY_SPAWN)
    ipcMain.removeHandler(IPC_CHANNELS.PTY_KILL)
    ipcMain.removeHandler(IPC_CHANNELS.PTY_GET_BUFFER)
    ipcMain.removeHandler(IPC_CHANNELS.LIST_DIR)
    ipcMain.removeHandler(IPC_CHANNELS.READ_TEXT)
    ipcMain.removeHandler(IPC_CHANNELS.SESSION_RESUME)
    ipcMain.removeHandler(IPC_CHANNELS.GET_ANALYSIS)
    ipcMain.removeHandler(IPC_CHANNELS.TRIGGER_ANALYSIS)
    ipcMain.removeHandler(IPC_CHANNELS.PROJECT_DISCOVER)
    ipcMain.removeHandler(IPC_CHANNELS.PROJECT_REGISTER)
    ipcMain.removeHandler(IPC_CHANNELS.PROJECT_UNREGISTER)
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
