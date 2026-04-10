import { app, BrowserWindow, Menu, shell, net, protocol } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { APP_NAME, WINDOW_CONFIG } from '../shared/constants'
import { registerIpcHandlers } from './ipc'
import { initDatabase, closeDatabase, getRegisteredProjects, getRegisteredProjectCount, getVisibleProjectSessions, upsertSession, updateSessionStatus, updateByteOffset, finalizeSession } from './db'
import { getAmplifierHome, scanSessionsAsync } from './scanner'
import { initWatcher, addProjectWatch, stopWatching } from './watcher'
import { pushSessionsChanged, pushFilesChanged, pushRunningSessionsToast, setAllowedDirs, isPathAllowed } from './ipc'
import { getWorkspaceState } from './workspace'
import { tailReadEvents, deriveSessionStatus, extractFileActivity, extractWorkDir, extractFirstPrompt, extractSessionStats, deriveSessionTitle } from './events-parser'
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
    show: false,
    backgroundColor: '#F0EBE3',
    ...(isMac
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 12, y: 12 } }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    clearTimeout(showFallback)
  })

  // Safety net: if ready-to-show never fires within 4s, show anyway.
  // Prevents "invisible frozen app" when main-process I/O blocks the event loop.
  const showFallback = setTimeout(() => {
    if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      console.warn('[window] ready-to-show did not fire within 4s — forcing show')
      mainWindow.show()
    }
  }, 4000)

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url)
    return { action: 'deny' }
  })

  loadRenderer(mainWindow)

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

  // Initialize database
  initDatabase()

  // Create window FIRST so it appears immediately
  const mainWindow = createWindow()
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
      // (1) Set allowed dirs from projectsDir
      setAllowedDirs([projectsDir])

      // (2) Load only registered projects via getRegisteredProjects()
      const registeredProjects = getRegisteredProjects()

      // (3) If no registered projects, push empty sessions and return (first-time user)
      if (registeredProjects.length === 0) {
        pushSessionsChanged(mainWindow, [])
        return
      }

      // (4) For returning users, build lightweight SessionState stubs from DB
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
            workDir: undefined,
            title: row.title ?? undefined,
            endedAt: row.endedAt ?? undefined,
            exitCode: row.exitCode ?? undefined,
            promptCount: row.promptCount ?? undefined,
            toolCallCount: row.toolCallCount ?? undefined,
            filesChangedCount: row.filesChangedCount ?? undefined,
          })
        }

        // (5) Start watchers only for registered projects
        addProjectWatch(project.slug)
      }

      // Seed liveSessions map and push stubs to renderer
      for (const session of sessions) {
        liveSessions.set(session.id, session)
      }
      pushSessionsChanged(mainWindow, sessions)

      // (7) Log project and session counts
      console.log(`[startup] Loaded ${registeredProjects.length} projects, ${sessions.length} sessions from DB`)

      // (6) Async hydration via scanSessionsAsync
      void scanSessionsAsync(amplifierHome, sessions, (hydrated) => {
        for (const session of hydrated) {
          liveSessions.set(session.id, session)
        }
        pushSessionsChanged(mainWindow, Array.from(liveSessions.values()))
      })

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
      if (event === 'session-updated' && data.sessionId) {
        const eventsPath = join(amplifierHome, 'projects', data.projectSlug, 'sessions', data.sessionId, 'events.jsonl')
        const knownOffset = liveSessions.get(data.sessionId)?.byteOffset ?? 0
        const { events, newByteOffset } = tailReadEvents(eventsPath, knownOffset)
        const status = deriveSessionStatus(events)
        const recentFiles = extractFileActivity(events)

        updateSessionStatus(data.sessionId, status)
        updateByteOffset(data.sessionId, newByteOffset)

        const sessionPath = join(projectsDir, data.projectSlug, 'sessions', data.sessionId)
        const workDir = extractWorkDir(events, sessionPath)

        let startedAt: string
        const startEvent = events.find((e: { type: string; timestamp: string }) => e.type === 'session:start')
        if (startEvent) {
          startedAt = startEvent.timestamp
        } else {
          startedAt = new Date().toISOString()
        }

        const firstPrompt = extractFirstPrompt(events)
        const title = firstPrompt ? deriveSessionTitle(firstPrompt) : undefined
        const stats = extractSessionStats(events)
        const endEvent = events.find((e: { type: string; timestamp: string; data: Record<string, unknown> }) => e.type === 'session:end')
        const endedAt = endEvent?.timestamp
        const exitCode =
          endEvent !== undefined
            ? ((endEvent.data as Record<string, unknown>).exitCode as number)
            : undefined

        if ((status === 'done' || status === 'failed') && endedAt) {
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
        }

        liveSessions.set(data.sessionId, session)
        pushSessionsChanged(mainWindow, Array.from(liveSessions.values()))
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


