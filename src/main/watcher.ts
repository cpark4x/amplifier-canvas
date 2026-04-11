import chokidar from 'chokidar'
import type { FSWatcher } from 'chokidar'
import { join, relative, sep } from 'path'
import { existsSync } from 'fs'

export type WatchEventType = 'session-updated' | 'project-added'

export interface WatchEventData {
  projectSlug: string
  sessionId?: string
}

export type WatchCallback = (event: WatchEventType, data: WatchEventData) => void

let watcher: FSWatcher | null = null
let watchCallback: WatchCallback | null = null
let amplifierProjectsDir: string | null = null

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
 * Start watching a specific project's sessions directory.
 * Only watches {projectsDir}/{slug}/sessions/ — not the entire tree.
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

  // Only watch events.jsonl files inside session directories — NOT the
  // entire sessions tree. A project can have thousands of session dirs.
  // Watching the full tree makes chokidar stat every entry at startup,
  // blocking the main thread for seconds.
  const globPattern = join(sessionsDir, '*', 'events.jsonl')

  if (!watcher) {
    watcher = chokidar.watch(globPattern, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 200,
      },
      // Disable recursive directory walking — glob handles the depth
      depth: 0,
    })
    attachListeners(watcher)
    console.log(`[watcher] Watching project: ${slug}`)
  } else {
    watcher.add(globPattern)
    console.log(`[watcher] Added project to watch: ${slug}`)
  }
}

/**
 * Stop watching a specific project's sessions directory.
 * Called when a project is unregistered (removed from Canvas).
 */
export function removeProjectWatch(slug: string): void {
  if (!amplifierProjectsDir || !watcher) {
    return
  }

  const sessionsDir = join(amplifierProjectsDir, slug, 'sessions')
  watcher.unwatch(sessionsDir)
  console.log(`[watcher] Removed project from watch: ${slug}`)
}

function attachListeners(w: FSWatcher): void {
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
  if (watcher) {
    void watcher.close()
    watcher = null
  }
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
