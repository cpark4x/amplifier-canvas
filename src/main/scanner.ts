import { readdirSync, existsSync, statSync } from 'fs'
import { join, basename } from 'path'
import os from 'os'
import { upsertProject, upsertSession } from './db'
import { tailReadEvents, deriveSessionStatus, extractFileActivity, extractWorkDir } from './events-parser'
import type { SessionState, FileActivity } from '../shared/types'

// Only scan the N most recent sessions per project.
// User has 29K+ sessions — scanning all of them blocks the UI for minutes.
const MAX_SESSIONS_PER_PROJECT = 30

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

  const projectDirs = readdirSync(projectsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())

  for (const projectDir of projectDirs) {
    const projectSlug = projectDir.name
    const projectPath = join(projectsDir, projectSlug)
    const projectName = slugToName(projectSlug)

    upsertProject(projectSlug, projectPath, projectName)
    projectCount++

    const sessionsDir = join(projectPath, 'sessions')
    if (!existsSync(sessionsDir)) continue

    // Get all session directories, then sort by mtime (most recent first)
    // and take only the top N to avoid scanning thousands of old sessions
    const sessionDirs = readdirSync(sessionsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const eventsPath = join(sessionsDir, entry.name, 'events.jsonl')
        let mtime = 0
        try {
          mtime = statSync(eventsPath).mtimeMs
        } catch {
          // No events.jsonl or can't stat — will be filtered below
        }
        return { name: entry.name, mtime }
      })
      .filter((entry) => entry.mtime > 0)
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, MAX_SESSIONS_PER_PROJECT)

    for (const sessionEntry of sessionDirs) {
      const sessionId = sessionEntry.name
      const eventsPath = join(sessionsDir, sessionId, 'events.jsonl')

      try {
        const { events, newByteOffset } = tailReadEvents(eventsPath, 0)
        const status = deriveSessionStatus(events)
        const recentFiles = extractFileActivity(events)
        const sessionPath = join(sessionsDir, sessionId)
        const workDir = extractWorkDir(events, sessionPath)

        // Extract startedAt from first event, or fall back to file mtime
        let startedAt: string
        const startEvent = events.find((e) => e.type === 'session:start')
        if (startEvent) {
          startedAt = startEvent.timestamp
        } else {
          startedAt = new Date(sessionEntry.mtime).toISOString()
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
