import chokidar from 'chokidar'
import type { FSWatcher } from 'chokidar'
import { join, relative, sep, basename, dirname } from 'path'
import { existsSync, readdirSync } from 'fs'

export type WatchEventType = 'session-updated' | 'project-added'

export interface WatchEventData {
  projectSlug: string
  sessionId?: string
}

export type WatchCallback = (event: WatchEventType, data: WatchEventData) => void

// Two watchers:
// 1. dirWatcher: watches sessions/ directories at depth 0 to detect NEW session dirs
// 2. fileWatcher: watches specific events.jsonl files for content changes
let dirWatcher: FSWatcher | null = null
let fileWatcher: FSWatcher | null = null
let watchCallback: WatchCallback | null = null
let amplifierProjectsDir: string | null = null

// Track which session files we're already watching (prevent duplicates)
const watchedFiles = new Set<string>()

// Per-session debounce timers (max 2Hz = 500ms)
const debounceTimers = new Map<string, NodeJS.Timeout>()

/**
 * Initialize the watcher system. Does NOT start watching anything yet.
 * Call addProjectWatch() for each user-added project to begin watching.
 */
export function initWatcher(amplifierHome: string, onChange: WatchCallback): void {
  amplifierProjectsDir = join(amplifierHome, 'projects')
  watchCallback = onChange

  if (!existsSync(amplifierProjectsDir)) {
    console.log('[watcher] Projects directory does not exist:', amplifierProjectsDir)
    return
  }

  console.log('[watcher] Initialized. Waiting for projects to watch.')
}

/**
 * Start watching a specific project.
 * - Watches sessions/ dir (depth 0) for new session directories
 * - Does NOT watch individual events.jsonl files yet (call watchSessionFile for those)
 */
export function addProjectWatch(slug: string): void {
  if (!amplifierProjectsDir || !watchCallback) {
    console.warn('[watcher] Cannot watch project — watcher not initialized')
    return
  }

  const sessionsDir = join(amplifierProjectsDir, slug, 'sessions')
  if (!existsSync(sessionsDir)) {
    console.log(`[watcher] Sessions dir does not exist for ${slug}, skipping watch`)
    return
  }

  // Dir watcher: only watches the sessions/ directory itself (depth 0)
  // to detect when Amplifier creates a new session subdirectory.
  // This uses minimal file handles — just 1 per project.
  if (!dirWatcher) {
    dirWatcher = chokidar.watch(sessionsDir, {
      ignoreInitial: true,
      depth: 0,        // Only the sessions/ dir — not subdirs
      ignorePermissionErrors: true,
    })
    dirWatcher.on('addDir', (dirPath: string) => {
      // A new session directory was created. Watch its events.jsonl.
      // Derive slug from path (not closure) — path is: .../projects/{slug}/sessions/{sessionId}
      const sessionId = basename(dirPath)
      const sessionsParent = dirname(dirPath)      // .../sessions
      const projectDir = dirname(sessionsParent)    // .../{slug}
      const derivedSlug = basename(projectDir)      // {slug}

      const eventsFile = join(dirPath, 'events.jsonl')
      // Poll briefly for events.jsonl to appear (Amplifier creates dir first, file second)
      const pollInterval = setInterval(() => {
        if (existsSync(eventsFile)) {
          clearInterval(pollInterval)
          watchSessionFile(derivedSlug, sessionId)
        }
      }, 200)
      // Give up after 10s
      setTimeout(() => clearInterval(pollInterval), 10000)
    })
    console.log(`[watcher] Watching project dir: ${slug}`)
  } else {
    dirWatcher.add(sessionsDir)
    console.log(`[watcher] Added project dir to watch: ${slug}`)
  }
}

/**
 * Watch a specific session's events.jsonl file.
 * Called when:
 * - dirWatcher detects a new session directory
 * - On startup, for sessions already visible in the sidebar
 */
export function watchSessionFile(projectSlug: string, sessionId: string): void {
  if (!amplifierProjectsDir) return

  const eventsFile = join(amplifierProjectsDir, projectSlug, 'sessions', sessionId, 'events.jsonl')
  if (watchedFiles.has(eventsFile)) return // Already watching
  if (!existsSync(eventsFile)) return

  watchedFiles.add(eventsFile)

  if (!fileWatcher) {
    fileWatcher = chokidar.watch(eventsFile, {
      ignoreInitial: false, // Fire immediately for existing files to get initial state
      awaitWriteFinish: {
        stabilityThreshold: 200,
      },
    })
    attachFileListeners(fileWatcher)
  } else {
    fileWatcher.add(eventsFile)
  }

  console.log(`[watcher] Watching session file: ${projectSlug}/${sessionId}`)
}

/**
 * Stop watching a specific project's sessions directory.
 * Called when a project is unregistered (removed from Canvas).
 */
export function removeProjectWatch(slug: string): void {
  if (!amplifierProjectsDir) return

  const sessionsDir = join(amplifierProjectsDir, slug, 'sessions')
  dirWatcher?.unwatch(sessionsDir)

  // Unwatch all session files for this project
  for (const file of watchedFiles) {
    if (file.includes(join(slug, 'sessions'))) {
      fileWatcher?.unwatch(file)
      watchedFiles.delete(file)
    }
  }

  console.log(`[watcher] Removed project from watch: ${slug}`)
}

function attachFileListeners(w: FSWatcher): void {
  const handler = (filePath: string): void => {
    if (!amplifierProjectsDir || !watchCallback) return
    const parsed = parseEventPath(amplifierProjectsDir, filePath)
    if (!parsed) return

    const key = `${parsed.projectSlug}/${parsed.sessionId}`
    const existing = debounceTimers.get(key)
    if (existing) clearTimeout(existing)

    debounceTimers.set(
      key,
      setTimeout(() => {
        debounceTimers.delete(key)
        watchCallback!('session-updated', parsed)
      }, 500)
    )
  }

  w.on('change', handler)
  w.on('add', handler)
}

// Keep the old API for backward compat — just delegates to initWatcher
export function startWatching(amplifierHome: string, onChange: WatchCallback): void {
  initWatcher(amplifierHome, onChange)
}

export function stopWatching(): void {
  if (dirWatcher) {
    void dirWatcher.close()
    dirWatcher = null
  }
  if (fileWatcher) {
    void fileWatcher.close()
    fileWatcher = null
  }
  watchedFiles.clear()
  for (const timer of debounceTimers.values()) {
    clearTimeout(timer)
  }
  debounceTimers.clear()
  watchCallback = null
  amplifierProjectsDir = null
}

function parseEventPath(
  projectsDir: string,
  filePath: string
): { projectSlug: string; sessionId: string } | null {
  const rel = relative(projectsDir, filePath)
  // Expected: {projectSlug}/sessions/{sessionId}/events.jsonl
  const parts = rel.split(sep)
  if (parts.length === 4 && parts[1] === 'sessions' && parts[3] === 'events.jsonl') {
    return { projectSlug: parts[0], sessionId: parts[2] }
  }
  return null
}
