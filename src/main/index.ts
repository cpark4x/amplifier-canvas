import { app, BrowserWindow, Menu, shell, net, protocol } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { APP_NAME, WINDOW_CONFIG } from '../shared/constants'
import { registerIpcHandlers } from './ipc'
import { existsSync } from 'fs'
import { initDatabase, closeDatabase, upsertProject, upsertSession, updateSessionStatus, updateByteOffset, finalizeSession } from './db'
import { scanProjects, getAmplifierHome } from './scanner'
import { startWatching, stopWatching } from './watcher'
import { pushSessionsChanged, pushFilesChanged, setAllowedDirs, isPathAllowed } from './ipc'
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
  })

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

  // Scan existing sessions on startup and push to renderer once ready
  mainWindow.webContents.once('did-finish-load', () => {
    try {
      const scanResult = scanProjects(amplifierHome)

      // Set allowed directories: projects dir + any known workDirs
      if (existsSync(projectsDir)) {
        const workDirs = scanResult.sessions
          .map((s) => s.workDir)
          .filter((dir): dir is string => !!dir && existsSync(dir))
        setAllowedDirs([projectsDir, ...workDirs])
      }

      // Seed liveSessions so watcher updates merge with historical sessions
      for (const session of scanResult.sessions) {
        liveSessions.set(session.id, session)
      }

      pushSessionsChanged(mainWindow, scanResult.sessions)
    } catch (err) {
      console.error('[startup] Scan failed:', err instanceof Error ? err.message : String(err))
      // Fall back to allowed dirs only, push empty state so UI still works
      if (existsSync(projectsDir)) {
        setAllowedDirs([projectsDir])
      }
      pushSessionsChanged(mainWindow, [])
    }
  })

  // Watcher picks up NEW activity and pushes it to the renderer
  startWatching(amplifierHome, (event, data) => {
    try {
      if (event === 'session-updated' && data.sessionId) {
        const eventsPath = join(amplifierHome, 'projects', data.projectSlug, 'sessions', data.sessionId, 'events.jsonl')
        const { events, newByteOffset } = tailReadEvents(eventsPath, 0)
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
}).catch((err) => {
  console.error('[startup] Fatal error:', err)
})

app.on('before-quit', () => {
  stopWatching()
  closeDatabase()
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
