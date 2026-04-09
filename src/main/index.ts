import { app, BrowserWindow, Menu, shell, net, protocol } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { APP_NAME, WINDOW_CONFIG } from '../shared/constants'
import { registerIpcHandlers } from './ipc'
import { existsSync } from 'fs'
import { initDatabase, closeDatabase, upsertProject, upsertSession, updateSessionStatus, updateByteOffset } from './db'
import { scanProjects, getAmplifierHome } from './scanner'
import { startWatching, stopWatching } from './watcher'
import { pushSessionsChanged, pushFilesChanged, setAllowedDirs, isPathAllowed } from './ipc'
import { tailReadEvents, deriveSessionStatus, extractFileActivity } from './events-parser'
import type { SessionState } from '../shared/types'

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

  // Scan projects AFTER window is visible — deferred so the app opens fast
  const amplifierHome = getAmplifierHome()

  const doScan = (): void => {
    try {
      const scanResult = scanProjects(amplifierHome)

      // Set allowed directories for file access security
      const projectsDir = join(amplifierHome, 'projects')
      if (existsSync(projectsDir)) {
        const workDirs = scanResult.sessions
          .map((s) => s.workDir)
          .filter((dir): dir is string => !!dir && existsSync(dir))
        const allowedDirs = [projectsDir, ...workDirs]
        setAllowedDirs(allowedDirs)
      }

      pushSessionsChanged(mainWindow, scanResult.sessions)
    } catch (err) {
      console.error('[startup] Scan failed:', err instanceof Error ? err.message : String(err))
      // Push empty state so the UI still works
      pushSessionsChanged(mainWindow, [])
    }
  }

  // Push initial sessions once window renderer is ready
  mainWindow.webContents.once('did-finish-load', doScan)

  // Start file watching
  startWatching(amplifierHome, (event, data) => {
    try {
      if (event === 'session-updated' && data.sessionId) {
        const eventsPath = join(amplifierHome, 'projects', data.projectSlug, 'sessions', data.sessionId, 'events.jsonl')
        const { events, newByteOffset } = tailReadEvents(eventsPath, 0)
        const status = deriveSessionStatus(events)
        const recentFiles = extractFileActivity(events)

        updateSessionStatus(data.sessionId, status)
        updateByteOffset(data.sessionId, newByteOffset)

        const freshScan = scanProjects(amplifierHome)
        pushSessionsChanged(mainWindow, freshScan.sessions)
        pushFilesChanged(mainWindow, data.sessionId, recentFiles)
      }

      if (event === 'project-added') {
        const freshScan = scanProjects(amplifierHome)
        pushSessionsChanged(mainWindow, freshScan.sessions)
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
