import { readdirSync, existsSync, statSync } from 'fs'
import { join } from 'path'
import os from 'os'
import { upsertProject, upsertSession } from './db'
import { tailReadEvents, deriveSessionStatus, extractFileActivity, extractWorkDir } from './events-parser'
import type { SessionState } from '../shared/types'

// Only show projects with activity in the last N days
const RECENCY_DAYS = 14

// Only deep-scan this many sessions per project (from tail of directory listing)
const MAX_SESSIONS_PER_PROJECT = 20

export function getAmplifierHome(): string {
  return process.env['AMPLIFIER_HOME'] || join(os.homedir(), '.amplifier')
}

export interface ScanResult {
  projectCount: number
  sessionCount: number
  sessions: SessionState[]
}

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

  // Stat the ~96 project dirs — cheap. Filter to recently modified only.
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

    // List directory names — take the last N (roughly chronological).
    // Do NOT stat individual sessions (13K+ stat calls kills startup).
    const allSessionNames = readdirSync(sessionsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)

    const recentNames = allSessionNames.slice(-MAX_SESSIONS_PER_PROJECT).reverse()

    for (const sessionId of recentNames) {
      const eventsPath = join(sessionsDir, sessionId, 'events.jsonl')

      if (!existsSync(eventsPath)) continue

      try {
        const { events, newByteOffset } = tailReadEvents(eventsPath, 0)
        const status = deriveSessionStatus(events)
        const recentFiles = extractFileActivity(events)
        const sessionPath = join(sessionsDir, sessionId)
        const workDir = extractWorkDir(events, sessionPath)

        let startedAt: string
        const startEvent = events.find((e) => e.type === 'session:start')
        if (startEvent) {
          startedAt = startEvent.timestamp
        } else {
          startedAt = statSync(eventsPath).mtime.toISOString()
        }

        upsertSession({
          id: sessionId,
          projectSlug,
          startedBy: 'external',
          startedAt,
          status,
          byteOffset: newByteOffset,
        })

        allSessions.push({
          id: sessionId,
          projectSlug,
          projectName,
          status,
          startedAt,
          startedBy: 'external',
          byteOffset: newByteOffset,
          recentFiles,
          workDir,
        })
      } catch (err) {
        console.warn(`[scanner] Skipping session ${sessionId}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  console.log(`[scanner] Found ${projectCount} projects, ${allSessions.length} sessions`)
  return { projectCount, sessionCount: allSessions.length, sessions: allSessions }
}

function slugToName(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
