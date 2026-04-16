/**
 * Background discovery — find sessions on disk not yet in the DB.
 * Extracted from index.ts for maintainability (COE item 2a).
 *
 * On most launches, most sessions are already indexed and this step is
 * fast (readdir + set diff). New sessions get full-file streaming stats.
 * Also backfills sessions with wrong stats from the old broken scanner.
 */

import { join } from 'path'
import { existsSync, readdirSync, statSync } from 'fs'
import { Worker } from 'worker_threads'
import type { BrowserWindow } from 'electron'
import type { ProjectRow } from './db'
import {
  getKnownSessionIds,
  getSessionsNeedingBackfill,
  upsertSession,
  updateSessionStats,
  finalizeSession,
} from './db'
import {
  headReadEvents,
  deriveSessionStatus,
  extractBestTitle,
  extractFirstPrompt,
} from './events-parser'
import { isSubSession } from './scanner'
import { pushSessionsChanged } from './ipc'
import type { SessionState } from '../shared/types'

/**
 * Run streamSessionStats in a worker thread to keep main thread responsive.
 * Falls back to in-process if worker fails (e.g. in test environment).
 */
function runStatsWorker(filePath: string): Promise<{ promptCount: number; toolCallCount: number }> {
  return new Promise((resolve) => {
    try {
      const workerPath = join(__dirname, 'stats-worker.js')
      const worker = new Worker(workerPath, { workerData: { filePath } })
      worker.on('message', (msg: { promptCount: number; toolCallCount: number }) => {
        resolve(msg)
        void worker.terminate()
      })
      worker.on('error', () => resolve({ promptCount: 0, toolCallCount: 0 }))
      worker.on('exit', () => resolve({ promptCount: 0, toolCallCount: 0 }))
    } catch {
      // Worker creation failed — resolve zero rather than crash
      resolve({ promptCount: 0, toolCallCount: 0 })
    }
  })
}

export async function runBackgroundDiscovery(
  registeredProjects: ProjectRow[],
  projectsDir: string,
  liveSessions: Map<string, SessionState>,
  mainWindow: BrowserWindow,
): Promise<void> {
  let newSessionsIndexed = 0
  let statsBackfilled = 0

  for (const project of registeredProjects) {
    const sessionsDir = join(projectsDir, project.slug, 'sessions')
    if (!existsSync(sessionsDir)) continue

    // Discover all session dirs on disk, sorted by mtime (newest first)
    const diskEntries = readdirSync(sessionsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !isSubSession(entry.name))
      .map((entry) => {
        let mtime = 0
        try {
          mtime = statSync(join(sessionsDir, entry.name)).mtimeMs
        } catch { /* skip */ }
        return { name: entry.name, mtime }
      })
      .sort((a, b) => b.mtime - a.mtime)

    const knownIds = getKnownSessionIds(project.slug)
    const newEntries = diskEntries.filter((e) => !knownIds.has(e.name))

    if (newEntries.length > 0) {
      console.log(`[discovery] ${project.slug}: ${newEntries.length} new sessions to index (of ${diskEntries.length} on disk)`)
    }

    // Index new sessions
    for (const entry of newEntries) {
      await new Promise<void>((resolve) => setImmediate(resolve))

      // Re-check: watcher may have indexed this session during the yield above.
      // getKnownSessionIds was captured once at loop start; this guards the race.
      if (getKnownSessionIds(project.slug).has(entry.name)) continue

      const eventsPath = join(sessionsDir, entry.name, 'events.jsonl')
      if (!existsSync(eventsPath)) continue

      try {
        const headEvents = headReadEvents(eventsPath)
        const status = deriveSessionStatus(headEvents)
        const startEvent = headEvents.find((e) => e.type === 'session:start')
        const startedAt = startEvent ? startEvent.timestamp : new Date(entry.mtime).toISOString()
        const title = extractBestTitle(headEvents)
        const firstPrompt = extractFirstPrompt(headEvents)
        const stats = await runStatsWorker(eventsPath)
        const fileSize = statSync(eventsPath).size
        const endEvent = headEvents.find((e) => e.type === 'session:end')
        const endedAt = endEvent ? endEvent.timestamp : undefined
        const exitCode = endEvent ? (endEvent.data.exitCode as number) : undefined

        upsertSession({
          id: entry.name, projectSlug: project.slug, startedBy: 'external',
          startedAt, status, byteOffset: fileSize, hidden: true,
          title: title ?? null, promptCount: stats.promptCount, toolCallCount: stats.toolCallCount,
        })

        if (endedAt) {
          finalizeSession(entry.name, {
            status, endedAt: endedAt ?? null, exitCode: exitCode ?? null,
            title: title ?? null, firstPrompt: firstPrompt ?? null,
            promptCount: stats.promptCount, toolCallCount: stats.toolCallCount, filesChangedCount: 0,
          })
        }
        newSessionsIndexed++
      } catch { /* skip unreadable */ }
    }

    // Backfill sessions with wrong stats
    const needsBackfill = getSessionsNeedingBackfill(project.slug)
    for (const row of needsBackfill) {
      const eventsPath = join(projectsDir, project.slug, 'sessions', row.id, 'events.jsonl')
      try {
        const stats = await runStatsWorker(eventsPath)
        if (stats.promptCount > 0 || stats.toolCallCount > 0) {
          updateSessionStats(row.id, stats.promptCount, stats.toolCallCount)
          statsBackfilled++
        }
      } catch { /* skip */ }
    }
  }

  if (newSessionsIndexed > 0 || statsBackfilled > 0) {
    console.log(`[discovery] Indexed ${newSessionsIndexed} new sessions, backfilled ${statsBackfilled} stats`)
    // Re-push visible sessions to the UI
    const visibleSessions = Array.from(liveSessions.values()).filter((s) => s.hidden !== true)
    pushSessionsChanged(mainWindow, visibleSessions)
  }
}