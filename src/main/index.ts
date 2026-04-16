import { app, BrowserWindow, Menu, shell, net, protocol } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { APP_NAME, WINDOW_CONFIG } from '../shared/constants'
import { registerIpcHandlers } from './ipc'
import { initDatabase, closeDatabase, getRegisteredProjects, getRegisteredProjectCount, getVisibleProjectSessions, upsertSession, updateSessionStatus, updateByteOffset, finalizeSession, reconcileStaleActiveSessions, setSessionHidden, updateSessionTitle, getSessionsWithoutTitles, incrementSessionStats } from './db'
import { getAmplifierHome } from './scanner'
import { initWatcher, addProjectWatch, stopWatching } from './watcher'
import { pushSessionsChanged, pushProjectsChanged, pushFilesChanged, pushRunningSessionsToast, setAllowedDirs, addAllowedDir, isPathAllowed } from './ipc'
import { isSubSession } from './scanner'
import { unhideSession } from './db'
import { hasPty, hasCanvasPtyForProject } from './pty'
import { getWorkspaceState } from './workspace'
import { tailReadEvents, headReadEvents, deriveSessionStatus, extractFileActivity, extractWorkDir, extractFirstPrompt, extractSessionStats, deriveSessionTitle, extractBestTitle } from './events-parser'
import { runBackgroundDiscovery } from './background-discovery'
import type { SessionState } from '../shared/types'

// Main-process session registry — watcher pushes new sessions here
const liveSessions = new Map<string, SessionState>()

const isMac = process.platform === 'darwin'
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:'])

// Prevent EIO errors from crashing Electron.
// EIO happens when PTY shell exits OR when the dev server pipe breaks.
// Cannot use console.log/warn/error here — if stderr IS the broken pipe,
// logging would throw another EIO and loop.
process.on('uncaughtException', (err) => {
  if (err.message?.includes('EIO')) return // silently swallow
  // For non-EIO errors, try to log but don't crash if that fails too
  try { process.stderr.write(`[fatal] ${err.stack || err.message}\n`) } catch { /* nothing */ }
})

function openExternalUrl(url: string): void {
  try {
    const parsedUrl = new URL(url)

    if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsedUrl.protocol)) {
      console.error('Blocked unsupported external URL protocol:', parsedUrl.protocol, url)
      return
    }

    void shell.openExternal(parsedUrl.toString()).catch(error => {
      console.error('Failed to open external URL:', url, error)
    })
  } catch (error) {
    console.error('Blocked invalid external URL:', url, error)
  }
}

function loadRenderer(mainWindow: BrowserWindow): void {
  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  const loadPromise =
    is.dev && rendererUrl
      ? mainWindow.loadURL(rendererUrl)
      : mainWindow.loadFile(join(__dirname, '../renderer/index.html'))

  void loadPromise.catch(error => {
    console.error('Failed to load renderer:', error)
  })
}

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: WINDOW_CONFIG.width,
    height: WINDOW_CONFIG.height,
    minWidth: WINDOW_CONFIG.minWidth,
    minHeight: WINDOW_CONFIG.minHeight,
    show: true,   // Show immediately — no waiting for ready-to-show
    backgroundColor: '#F0EBE3',
    ...(isMac
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 12, y: 12 } }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url)
    return { action: 'deny' }
  })

  loadRenderer(mainWindow)

  // Open DevTools to diagnose renderer issues
  

  return mainWindow
}

function buildAppMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [
              { type: 'separator' as const },
              { role: 'front' as const }
            ]
          : [{ role: 'close' as const }])
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

// Register canvas:// as a privileged scheme before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'canvas',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
    },
  },
])

app.whenReady().then(() => {
  buildAppMenu()

  // Create and SHOW window immediately — before any sync I/O
  const mainWindow = createWindow()

  // DB + IPC init — window is already visible so user sees something
  initDatabase()
  registerIpcHandlers(mainWindow)

  // Register canvas:// protocol handler for secure image serving
  protocol.handle('canvas', (request) => {
    const url = new URL(request.url)
    const filePath = decodeURIComponent(url.pathname)

    if (!isPathAllowed(filePath)) {
      console.error('[protocol] Blocked canvas:// access to disallowed path:', filePath)
      return new Response('Forbidden', { status: 403 })
    }

    return net.fetch(`file://${filePath}`)
  })

  const amplifierHome = getAmplifierHome()
  const projectsDir = join(amplifierHome, 'projects')

  // Load only user-registered projects from the DB. NO filesystem scan.
  // Projects appear here only when the user explicitly registers them via the UI.
  mainWindow.webContents.once('did-finish-load', () => {
    try {
      // (1) Set allowed dirs from projectsDir + all registered project paths
      const allProjects = getRegisteredProjects()
      const projectPaths = allProjects.map((p) => p.path).filter(Boolean)
      setAllowedDirs([projectsDir, ...projectPaths])

      // (2) Load only registered projects via getRegisteredProjects()
      const registeredProjects = getRegisteredProjects()

      // (2b) Always push registered projects to renderer so they appear in the
      // sidebar even when they have no visible sessions yet.
      pushProjectsChanged(mainWindow, registeredProjects)

      // (3) If no registered projects, push empty sessions and return (first-time user)
      if (registeredProjects.length === 0) {
        pushSessionsChanged(mainWindow, [])
        return
      }

      // (4) Reconcile stale sessions: any session still marked 'active' from a
      // previous app run is not actually running. Mark it 'done' so it doesn't
      // show a misleading green "running" dot in the sidebar.
      // Skip in test mode — test fixtures intentionally seed active sessions.
      if (process.env.NODE_ENV !== 'test') {
        reconcileStaleActiveSessions()
      }

      // (4b) Restore warm-return state: if the user had a session selected when
      // they last closed the app, ensure that session is visible (hidden=0).
      // This preserves the "exactly how you left it" experience on restart.
      const savedState = getWorkspaceState()
      if (savedState.selectedSessionId) {
        setSessionHidden(savedState.selectedSessionId, 0)
      }

      // (4c) Back-fill titles for sessions that have null titles.
      // This happens when sessions were created before the title persistence fix,
      // or when a session ended while the app wasn't running.
      let titlesBackfilled = 0
      for (const project of registeredProjects) {
        const untitled = getSessionsWithoutTitles(project.slug)
        if (untitled.length > 0) {
          console.log(`[startup] Back-filling titles for ${untitled.length} sessions in ${project.slug}`)
        }
        for (const row of untitled) {
          const eventsPath = join(projectsDir, project.slug, 'sessions', row.id, 'events.jsonl')
          try {
            // Use headReadEvents (reads from byte 0) — the first prompt is near the
            // start of the file. tailReadEvents would miss it on large sessions.
            const events = headReadEvents(eventsPath)
            const firstPrompt = extractFirstPrompt(events)
            if (firstPrompt) {
              const title = deriveSessionTitle(firstPrompt)
              if (title) {
                updateSessionTitle(row.id, title)
                titlesBackfilled++
              }
            }
          } catch {
            // Skip sessions whose events.jsonl is missing or unreadable
          }
        }
      }
      if (titlesBackfilled > 0) {
        console.log(`[startup] Back-filled ${titlesBackfilled} session titles`)
      }

      // (5) For returning users, build lightweight SessionState stubs from DB
      const sessions: SessionState[] = []

      for (const project of registeredProjects) {
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

      // Seed liveSessions map and push stubs to renderer
      for (const session of sessions) {
        liveSessions.set(session.id, session)
      }
      pushSessionsChanged(mainWindow, sessions)

      console.log(`[startup] Loaded ${registeredProjects.length} projects, ${sessions.length} sessions from DB`)

      // DEFERRED: Start watchers AFTER the UI has data and can paint.
      // chokidar's initial scan of 1000+ session dirs blocks the main thread.
      // setTimeout(0) yields to the event loop so the renderer can render first.
      setTimeout(() => {
        for (const project of registeredProjects) {
          addProjectWatch(project.slug)
        }
        console.log(`[startup] Watchers started for ${registeredProjects.length} projects`)
      }, 0)

      // (6) Background discovery — deferred to keep startup fast.
      // Finds sessions on disk not yet in DB, indexes them with streaming stats,
      // and backfills sessions with wrong stats from the old scanner.
      setTimeout(() => {
        void runBackgroundDiscovery(registeredProjects, projectsDir, liveSessions, mainWindow)
      }, 100)
    } catch (err) {
      console.error('[startup] Load failed:', err instanceof Error ? err.message : String(err))
      setAllowedDirs([projectsDir])
      pushSessionsChanged(mainWindow, [])
    }
  })

  // Initialize watcher but don't watch anything yet.
  // Only projects the user explicitly adds get watched via addProjectWatch().
  initWatcher(amplifierHome, (event, data) => {
    try {
      if (event === 'session-updated' && data.sessionId && !isSubSession(data.sessionId)) {
        const eventsPath = join(amplifierHome, 'projects', data.projectSlug, 'sessions', data.sessionId, 'events.jsonl')
        const knownOffset = liveSessions.get(data.sessionId)?.byteOffset ?? 0
        const { events, newByteOffset } = tailReadEvents(eventsPath, knownOffset)
        const status = deriveSessionStatus(events)
        const recentFiles = extractFileActivity(events)

        // Ensure session exists in DB. For brand-new sessions (not from scan),
        // this INSERT creates the row. For known sessions, it updates status/offset.
        // Only unhide sessions that Canvas owns (has an active PTY for).
        // Other sessions (delegate/child sessions Amplifier spawns) stay hidden.
        const sessionPath = join(projectsDir, data.projectSlug, 'sessions', data.sessionId)
        const existingWorkDir = liveSessions.get(data.sessionId)?.workDir
        const workDir = extractWorkDir(events, sessionPath) ?? existingWorkDir

        // Widen file-access allowlist so the Viewer's file browser works
        if (workDir) {
          addAllowedDir(workDir)
        }

        let startedAt: string
        const startEvent = events.find((e: { type: string; timestamp: string }) => e.type === 'session:start')
        if (startEvent) {
          startedAt = startEvent.timestamp
        } else {
          startedAt = new Date().toISOString()
        }

        const existingTitle = liveSessions.get(data.sessionId)?.title
        // Use extractBestTitle to skip automated prefixes (load_skill, Execute recipe)
        // and find the first substantive human prompt for the title.
        const title = extractBestTitle(events) ?? existingTitle

        // Only unhide sessions that Canvas started (has an active PTY for).
        // Amplifier may spawn delegate/child sessions as side effects — those stay hidden.
        const canvasOwnsSession = hasPty(data.sessionId) || hasCanvasPtyForProject(data.projectSlug)

        // Stats from extractSessionStats only cover the NEW chunk (byteOffset to EOF).
        // We use incrementSessionStats (additive) instead of passing stats to upsertSession
        // (which uses MAX and would never increase beyond the initial scan value).
        const stats = extractSessionStats(events)
        upsertSession({
          id: data.sessionId,
          projectSlug: data.projectSlug,
          startedBy: canvasOwnsSession ? 'canvas' : 'external',
          startedAt,
          status,
          byteOffset: newByteOffset,
          hidden: !canvasOwnsSession,
          title: title ?? null,
          // Don't pass stats here — upsertSession uses MAX(old, new) which
          // doesn't accumulate. Use incrementSessionStats below instead.
        })
        // Additive: add this chunk's counts to the running DB totals.
        // Safe because byteOffset tracking ensures no double-counting.
        incrementSessionStats(
          data.sessionId,
          stats.promptCount,
          stats.toolCallCount,
          stats.filesChanged.size,
        )
        if (canvasOwnsSession) {
          unhideSession(data.sessionId)
        }
        const endEvent = events.find((e: { type: string; timestamp: string; data: Record<string, unknown> }) => e.type === 'session:end')
        const endedAt = endEvent?.timestamp
        const exitCode =
          endEvent !== undefined
            ? ((endEvent.data as Record<string, unknown>).exitCode as number)
            : undefined

        if ((status === 'done' || status === 'failed') && endedAt) {
          const firstPrompt = extractFirstPrompt(events)
          finalizeSession(data.sessionId, {
            status,
            endedAt,
            exitCode: exitCode ?? null,
            title: title ?? null,
            firstPrompt: firstPrompt ?? null,
            promptCount: stats.promptCount,
            toolCallCount: stats.toolCallCount,
            filesChangedCount: stats.filesChanged.size,
          })
        }

        const session: SessionState = {
          id: data.sessionId,
          projectSlug: data.projectSlug,
          projectName: slugToName(data.projectSlug),
          status,
          startedAt,
          startedBy: 'external',
          byteOffset: newByteOffset,
          recentFiles,
          workDir,
          endedAt,
          exitCode,
          title,
          promptCount: stats.promptCount,
          toolCallCount: stats.toolCallCount,
          filesChangedCount: stats.filesChanged.size,
          hidden: !canvasOwnsSession,
        }

        liveSessions.set(data.sessionId, session)
        // Only push visible sessions to the renderer — hidden sessions (delegate/child
        // sessions, failed sessions) should never leak into the sidebar.
        const visibleSessions = Array.from(liveSessions.values()).filter(s => s.hidden !== true)
        pushSessionsChanged(mainWindow, visibleSessions)
        pushFilesChanged(mainWindow, data.sessionId, recentFiles)
      }
    } catch (err) {
      console.warn('[watcher] Error handling event:', err instanceof Error ? err.message : String(err))
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const newWindow = createWindow()
      registerIpcHandlers(newWindow)
    }
  })

  // Check for running sessions before quit and notify the user
  app.on('before-quit', () => {
    const runningSessions = Array.from(liveSessions.values()).filter(s => s.status === 'running')
    if (runningSessions.length > 0) {
      pushRunningSessionsToast(mainWindow, runningSessions.length)
    }
    stopWatching()
    closeDatabase()
  })
}).catch((err) => {
  console.error('[startup] Fatal error:', err)
})

app.on('window-all-closed', () => {
  if (!isMac) {
    app.quit()
  }
})

function slugToName(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}


