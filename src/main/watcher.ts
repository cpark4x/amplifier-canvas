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

// Per-session debounce timers (max 2Hz = 500ms)
const debounceTimers = new Map<string, NodeJS.Timeout>()

export function startWatching(amplifierHome: string, onChange: WatchCallback): void {
  const projectsDir = join(amplifierHome, 'projects')

  if (!existsSync(projectsDir)) {
    console.log('[watcher] Projects directory does not exist, skipping watch:', projectsDir)
    return
  }

  // Watch ONLY for events.jsonl files — not the entire directory tree.
  // Using a glob pattern so chokidar doesn't enumerate every subdirectory
  // at startup (which hangs for minutes with 29K+ sessions).
  watcher = chokidar.watch(join(projectsDir, '*/sessions/*/events.jsonl'), {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 200,
    },
  })

  watcher.on('change', (filePath: string) => {
    const parsed = parseEventPath(projectsDir, filePath)
    if (!parsed) return

    // Debounce: max 2Hz per session
    const key = `${parsed.projectSlug}/${parsed.sessionId}`
    const existing = debounceTimers.get(key)
    if (existing) clearTimeout(existing)

    debounceTimers.set(
      key,
      setTimeout(() => {
        debounceTimers.delete(key)
        onChange('session-updated', parsed)
      }, 500)
    )
  })

  // Also detect new events.jsonl files (new sessions starting)
  watcher.on('add', (filePath: string) => {
    const parsed = parseEventPath(projectsDir, filePath)
    if (!parsed) return

    const key = `${parsed.projectSlug}/${parsed.sessionId}`
    const existing = debounceTimers.get(key)
    if (existing) clearTimeout(existing)

    debounceTimers.set(
      key,
      setTimeout(() => {
        debounceTimers.delete(key)
        onChange('session-updated', parsed)
      }, 500)
    )
  })

  console.log('[watcher] Watching for events.jsonl changes in', projectsDir)
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
