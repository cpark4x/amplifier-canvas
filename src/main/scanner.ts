import { readdirSync, existsSync, statSync } from 'fs'
import { join } from 'path'
import os from 'os'
import {
  upsertProject,
  upsertSession,
  finalizeSession,
  getKnownSessionIds,
  getActiveSessionIds,
  getSessionsNeedingBackfill,
  updateSessionStats,
} from './db'
import {
  tailReadEvents,
  headReadEvents,
  streamSessionStats,
  deriveSessionStatus,
  extractFileActivity,
  extractWorkDir,
  extractFirstPrompt,
  extractSessionStats,
  extractBestTitle,
  deriveSessionTitle,
} from './events-parser'
import type { SessionState } from '../shared/types'

/**
 * Sub-agent sessions have IDs like `{parentId}_{agent-name}` (e.g.
 * `ffc75aa008924448-0e164ec774014da7_foundation-git-ops`).
 * Real user sessions are plain UUIDs with only hyphens.
 */
export function isSubSession(sessionId: string): boolean {
  return sessionId.includes('_')
}

// Only show projects with activity in the last N days
const RECENCY_DAYS = 14

export function getAmplifierHome(): string {
  return process.env['AMPLIFIER_HOME'] || join(os.homedir(), '.amplifier')
}

/**
 * Fast count of user sessions on disk for a project (no deep-scan).
 * Used for project overview stats where we want the real total,
 * not the DB-capped MAX_SESSIONS_PER_PROJECT.
 */
export function countProjectSessionsOnDisk(amplifierHome: string, slug: string): number {
  const sessionsDir = join(amplifierHome, 'projects', slug, 'sessions')
  if (!existsSync(sessionsDir)) return 0
  try {
    return readdirSync(sessionsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !isSubSession(entry.name))
      .length
  } catch {
    return 0
  }
}

/**
 * Count sub-agent sessions on disk for a project.
 * Agent sessions have IDs containing underscores (e.g. `0000000000000000-xxx_foundation-explorer`).
 */
export function countAgentSessionsOnDisk(amplifierHome: string, slug: string): number {
  const sessionsDir = join(amplifierHome, 'projects', slug, 'sessions')
  if (!existsSync(sessionsDir)) return 0
  try {
    return readdirSync(sessionsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && isSubSession(entry.name))
      .length
  } catch {
    return 0
  }
}

/**
 * Get agent usage breakdown for a project — which agents were used and how often.
 * Returns sorted array of { agent, count } pairs.
 */
export function getAgentUsageBreakdown(amplifierHome: string, slug: string): { agent: string; count: number }[] {
  const sessionsDir = join(amplifierHome, 'projects', slug, 'sessions')
  if (!existsSync(sessionsDir)) return []
  try {
    const counts = new Map<string, number>()
    const entries = readdirSync(sessionsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory() || !isSubSession(entry.name)) continue
      // Agent name is the part after the last underscore
      const underscoreIdx = entry.name.lastIndexOf('_')
      if (underscoreIdx < 0) continue
      const agentName = entry.name.substring(underscoreIdx + 1)
      if (agentName) {
        counts.set(agentName, (counts.get(agentName) ?? 0) + 1)
      }
    }
    return [...counts.entries()]
      .map(([agent, count]) => ({ agent, count }))
      .sort((a, b) => b.count - a.count)
  } catch {
    return []
  }
}

/**
 * Scan sessions for a single project. Returns lightweight SessionState stubs
 * with data loaded from events.jsonl (title, status, timestamps, stats).
 * Used when a user adds an existing project to Canvas.
 */
export function scanSingleProject(
  amplifierHome: string,
  slug: string,
  projectName: string,
): SessionState[] {
  const projectsDir = join(amplifierHome, 'projects')
  const sessionsDir = join(projectsDir, slug, 'sessions')

  if (!existsSync(sessionsDir)) return []

  // Sort by mtime (newest first) — no cap. Discover ALL sessions.
  const sessionDirs = readdirSync(sessionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !isSubSession(entry.name))
    .map((entry) => {
      let mtime = 0
      try {
        mtime = statSync(join(sessionsDir, entry.name)).mtimeMs
      } catch {
        /* skip */
      }
      return { name: entry.name, mtime }
    })
    .sort((a, b) => b.mtime - a.mtime)

  const sessions: SessionState[] = []

  for (const { name: sessionId, mtime } of sessionDirs) {
    const eventsPath = join(sessionsDir, sessionId, 'events.jsonl')
    if (!existsSync(eventsPath)) continue

    try {
      // Use headReadEvents for title (reads first 1MB — fast, gets session:start + first prompts)
      const headEvents = headReadEvents(eventsPath)
      const status = deriveSessionStatus(headEvents)

      let startedAt: string
      const startEvent = headEvents.find((e: { type: string }) => e.type === 'session:start')
      if (startEvent) {
        startedAt = (startEvent as { timestamp: string }).timestamp
      } else {
        startedAt = new Date(mtime).toISOString()
      }

      const title = extractBestTitle(headEvents)
      const firstPrompt = extractFirstPrompt(headEvents)
      const endEvent = headEvents.find((e: { type: string }) => e.type === 'session:end')
      const endedAt = endEvent ? (endEvent as { timestamp: string }).timestamp : undefined
      const exitCode = endEvent
        ? ((endEvent as { data: Record<string, unknown> }).data.exitCode as number)
        : undefined

      // For stats: headReadEvents only covers first 1MB, so stats will be
      // partial for large sessions. The initial scan uses headEvents for a
      // quick estimate; the async scan (scanSessionsAsync) uses
      // streamSessionStats for accurate full-file counts.
      const headStats = extractSessionStats(headEvents)

      upsertSession({
        id: sessionId,
        projectSlug: slug,
        startedBy: 'external',
        startedAt,
        status,
        byteOffset: 0, // Will be updated by async scan or watcher
        hidden: true,
        title: title ?? null,
        promptCount: headStats.promptCount,
        toolCallCount: headStats.toolCallCount,
        filesChangedCount: headStats.filesChanged.size,
      })
      if (endedAt) {
        finalizeSession(sessionId, {
          status,
          endedAt: endedAt ?? null,
          exitCode: exitCode ?? null,
          title: title ?? null,
          firstPrompt: firstPrompt ?? null,
          promptCount: headStats.promptCount,
          toolCallCount: headStats.toolCallCount,
          filesChangedCount: headStats.filesChanged.size,
        })
      }

      sessions.push({
        id: sessionId,
        projectSlug: slug,
        projectName,
        status,
        startedAt,
        startedBy: 'external',
        byteOffset: 0,
        recentFiles: [],
        workDir: undefined,
        title,
        endedAt,
        exitCode,
        promptCount: headStats.promptCount,
        toolCallCount: headStats.toolCallCount,
        filesChangedCount: headStats.filesChanged.size,
      })
    } catch {
      // Skip sessions with unreadable events.jsonl
    }
  }

  return sessions
}

export interface ScanResult {
  projectCount: number
  sessionCount: number
  sessions: SessionState[]
}

/** Synchronous scan — only discovers project/session directory structure.
 *  Does NOT read events.jsonl files. Returns lightweight stubs. */
export function scanProjects(amplifierHome?: string): ScanResult {
  const home = amplifierHome || getAmplifierHome()
  const projectsDir = join(home, 'projects')

  if (!existsSync(projectsDir)) {
    console.log('[scanner] No projects directory found at', projectsDir)
    return { projectCount: 0, sessionCount: 0, sessions: [] }
  }

  const allSessions: SessionState[] = []
  let projectCount = 0
  const cutoff = Date.now() - RECENCY_DAYS * 24 * 60 * 60 * 1000

  const projectDirs = readdirSync(projectsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const projectPath = join(projectsDir, entry.name)
      let mtime = 0
      try {
        mtime = statSync(projectPath).mtimeMs
      } catch {
        // skip
      }
      return { name: entry.name, mtime }
    })
    .filter((entry) => entry.mtime > cutoff)
    .sort((a, b) => b.mtime - a.mtime)

  for (const projectDir of projectDirs) {
    const projectSlug = projectDir.name
    const projectPath = join(projectsDir, projectSlug)
    const projectName = slugToName(projectSlug)

    upsertProject(projectSlug, projectPath, projectName)
    projectCount++

    const sessionsDir = join(projectPath, 'sessions')
    if (!existsSync(sessionsDir)) continue

    // Discover ALL sessions, sort by mtime (newest first).
    // No cap — every session on disk should eventually be indexed.
    const allSessionEntries = readdirSync(sessionsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !isSubSession(entry.name))
      .map((entry) => {
        let mtime = 0
        try {
          mtime = statSync(join(sessionsDir, entry.name)).mtimeMs
        } catch {
          /* skip */
        }
        return { name: entry.name, mtime }
      })
      .sort((a, b) => b.mtime - a.mtime)

    for (const { name: sessionId, mtime } of allSessionEntries) {
      const eventsPath = join(sessionsDir, sessionId, 'events.jsonl')
      if (!existsSync(eventsPath)) continue

      // Lightweight stub — only uses directory stat, no events.jsonl I/O
      allSessions.push({
        id: sessionId,
        projectSlug,
        projectName,
        status: 'loading',
        startedAt: new Date(mtime).toISOString(),
        startedBy: 'external',
        byteOffset: 0,
        recentFiles: [],
        workDir: undefined,
      })
    }
  }

  console.log(`[scanner] Found ${projectCount} projects, ${allSessions.length} sessions`)
  return { projectCount, sessionCount: allSessions.length, sessions: allSessions }
}

/** Async incremental scan — only processes sessions NOT already in the DB,
 *  plus active sessions that need stats refresh. Uses streamSessionStats()
 *  for accurate full-file counts on new sessions, and tailReadEvents() for
 *  incremental updates on active sessions.
 *
 *  This is the key architectural change: the DB is the persistent index.
 *  On subsequent launches, most sessions are already indexed and skipped.
 *  Only truly new sessions (and active ones) get file I/O. */
export async function scanSessionsAsync(
  amplifierHome: string,
  stubs: SessionState[],
  onProgress: (sessions: SessionState[]) => void,
): Promise<SessionState[]> {
  const projectsDir = join(amplifierHome, 'projects')
  const results: SessionState[] = []

  // Group stubs by project so we can batch DB lookups
  const stubsByProject = new Map<string, SessionState[]>()
  for (const stub of stubs) {
    const list = stubsByProject.get(stub.projectSlug) ?? []
    list.push(stub)
    stubsByProject.set(stub.projectSlug, list)
  }

  for (const [projectSlug, projectStubs] of stubsByProject) {
    // One DB query per project — get sessions already indexed
    const knownIds = getKnownSessionIds(projectSlug)
    const activeIds = getActiveSessionIds(projectSlug)

    // Split into: new (not in DB) vs active (in DB but running)
    const newStubs = projectStubs.filter((s) => !knownIds.has(s.id))
    const activeStubs = projectStubs.filter((s) => knownIds.has(s.id) && activeIds.has(s.id))
    const skipped = projectStubs.length - newStubs.length - activeStubs.length

    console.log(
      `[scanner] ${projectSlug}: ${newStubs.length} new, ${activeStubs.length} active, ${skipped} already indexed (skipped)`,
    )

    // Process NEW sessions — full indexing with accurate stats
    for (const stub of newStubs) {
      await new Promise<void>((resolve) => setImmediate(resolve))

      const sessionsDir = join(projectsDir, stub.projectSlug, 'sessions')
      const eventsPath = join(sessionsDir, stub.id, 'events.jsonl')

      try {
        // headReadEvents reads first 1MB — gets session:start, first prompts, title
        const headEvents = headReadEvents(eventsPath)
        const status = deriveSessionStatus(headEvents)

        let startedAt = stub.startedAt
        const startEvent = headEvents.find((e) => e.type === 'session:start')
        if (startEvent) {
          startedAt = startEvent.timestamp
        }

        const title = extractBestTitle(headEvents)
        const firstPrompt = extractFirstPrompt(headEvents)

        // streamSessionStats reads the FULL file line-by-line — accurate counts
        // even for 430MB files. This is async and non-blocking.
        const stats = await streamSessionStats(eventsPath)

        const endEvent = headEvents.find((e) => e.type === 'session:end')
        const endedAt = endEvent?.timestamp
        const exitCode =
          endEvent !== undefined
            ? ((endEvent.data as Record<string, unknown>).exitCode as number)
            : undefined

        const fileSize = statSync(eventsPath).size

        upsertSession({
          id: stub.id,
          projectSlug: stub.projectSlug,
          startedBy: 'external',
          startedAt,
          status,
          byteOffset: fileSize,
          hidden: true,
          title: title ?? null,
          promptCount: stats.promptCount,
          toolCallCount: stats.toolCallCount,
        })

        if (endedAt) {
          finalizeSession(stub.id, {
            status,
            endedAt: endedAt ?? null,
            exitCode: exitCode ?? null,
            title: title ?? null,
            firstPrompt: firstPrompt ?? null,
            promptCount: stats.promptCount,
            toolCallCount: stats.toolCallCount,
            filesChangedCount: 0, // streamSessionStats doesn't track files (fast path)
          })
        }

        results.push({
          id: stub.id,
          projectSlug: stub.projectSlug,
          projectName: stub.projectName,
          status,
          startedAt,
          startedBy: 'external',
          byteOffset: fileSize,
          recentFiles: [],
          workDir: undefined,
          title,
          endedAt,
          exitCode,
          promptCount: stats.promptCount,
          toolCallCount: stats.toolCallCount,
          filesChangedCount: 0,
        })
      } catch (err) {
        console.warn(
          `[scanner] Skipping new session ${stub.id}: ${err instanceof Error ? err.message : String(err)}`,
        )
      }

      if (results.length % 5 === 0) {
        onProgress(results)
      }
    }

    // Refresh ACTIVE sessions — incremental read from last byteOffset
    for (const stub of activeStubs) {
      await new Promise<void>((resolve) => setImmediate(resolve))

      const sessionsDir = join(projectsDir, stub.projectSlug, 'sessions')
      const eventsPath = join(sessionsDir, stub.id, 'events.jsonl')

      try {
        const { events, newByteOffset } = tailReadEvents(eventsPath, stub.byteOffset)
        if (events.length === 0) continue

        const status = deriveSessionStatus(events)
        const stats = extractSessionStats(events)

        upsertSession({
          id: stub.id,
          projectSlug: stub.projectSlug,
          startedBy: 'external',
          startedAt: stub.startedAt,
          status,
          byteOffset: newByteOffset,
          hidden: true,
          promptCount: stats.promptCount,
          toolCallCount: stats.toolCallCount,
          filesChangedCount: stats.filesChanged.size,
        })
      } catch {
        // Skip
      }
    }

    // Backfill: fix sessions with wrong stats from the old broken scanner.
    // These have promptCount <= 1 but large files (byteOffset > 100KB).
    const backfillList = getSessionsNeedingBackfill(projectSlug)
    if (backfillList.length > 0) {
      console.log(`[scanner] Backfilling ${backfillList.length} sessions with wrong stats`)
      for (const session of backfillList) {
        await new Promise<void>((resolve) => setImmediate(resolve))
        const sessionsDir = join(projectsDir, projectSlug, 'sessions')
        const eventsPath = join(sessionsDir, session.id, 'events.jsonl')
        if (!existsSync(eventsPath)) continue
        try {
          const stats = await streamSessionStats(eventsPath)
          updateSessionStats(session.id, stats.promptCount, stats.toolCallCount)
        } catch {
          // Skip
        }
      }
    }
  }

  // Final push with all results
  onProgress(results)
  console.log(`[scanner] Async scan complete: ${results.length} new sessions indexed`)
  return results
}

function slugToName(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
