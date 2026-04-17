import { ipcMain } from 'electron'
import { mkdirSync, existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { execSync } from 'child_process'
import { IPC_CHANNELS } from '../shared/types'
import type { SessionState, ProjectStatsData, ProjectHistorySession, ProjectContext } from '../shared/types'
import { getAmplifierHome, scanSingleProject, countProjectSessionsOnDisk, countAgentSessionsOnDisk, getAgentUsageBreakdown } from './scanner'
import {
  getRegisteredProjects,
  setProjectRegistered,
  upsertProject,
  getProjectBySlug,
  getProjectOverviewStats,
  getAllProjectSessions,
  getDailySessionCounts,
  updateLastVisited,
  getLastVisitedAt,
  getStalledSessions,
} from './db'
import { discoverProjects } from './discovery'
import type { DiscoveredProject } from './discovery'
import { addProjectWatch } from './watcher'

/* --- Helper functions --- */

export function classifySession(session: { title: string | null; status: string; promptCount: number; firstPrompt: string | null }): { classification: import('../shared/types').SessionClassification; label: string } {
  const title = session.title ?? ''
  const isAutoTitle = title.startsWith('load_skill') || title.startsWith('Execute recipe') || title.startsWith('amplifier tool')

  // Ghost sessions: no title AND 0 prompts — empty/broken sessions
  if (!title && session.promptCount === 0) {
    return { classification: 'failed-auto', label: 'Ghost' }
  }
  if (isAutoTitle && session.status === 'failed') {
    return { classification: 'failed-auto', label: 'Failed Auto' }
  }
  if (isAutoTitle) {
    return { classification: 'automated', label: 'Automated' }
  }
  if (session.promptCount >= 8) {
    return { classification: 'deep-work', label: 'Deep Work' }
  }
  return { classification: 'quick-task', label: 'Quick Task' }
}

function getGitRepoMetadata(projectPath: string): { repoUrl?: string; repoVisibility?: 'public' | 'private' | 'unknown'; repoContributorCount?: number } {
  try {
    // Get remote URL
    const rawUrl = execSync(`git -C "${projectPath}" remote get-url origin 2>/dev/null`, { encoding: 'utf-8', timeout: 3000 }).trim()
    if (!rawUrl) return {}

    // Normalize SSH URLs to HTTPS for display
    let repoUrl = rawUrl
    const sshMatch = rawUrl.match(/^git@([^:]+):(.+?)(?:\.git)?$/)
    if (sshMatch) {
      repoUrl = `https://${sshMatch[1]}/${sshMatch[2]}`
    } else if (rawUrl.endsWith('.git')) {
      repoUrl = rawUrl.replace(/\.git$/, '')
    }

    // Try to get visibility and contributor count from GitHub API (requires gh CLI)
    let repoVisibility: 'public' | 'private' | 'unknown' = 'unknown'
    let repoContributorCount: number | undefined
    try {
      // Extract owner/repo from URL
      const ghMatch = repoUrl.match(/github\.com\/([^/]+\/[^/]+)/)
      if (ghMatch) {
        const nwo = ghMatch[1]
        const repoJson = execSync(`gh api repos/${nwo} --jq '{"visibility": .visibility, "private": .private}' 2>/dev/null`, { encoding: 'utf-8', timeout: 5000 }).trim()
        if (repoJson) {
          const data = JSON.parse(repoJson)
          repoVisibility = data.private ? 'private' : 'public'
        }
        // Get contributor count (unique authors in last 100 commits as fast approximation)
        const authors = execSync(`git -C "${projectPath}" log --format="%ae" -100 2>/dev/null | sort -u | wc -l`, { encoding: 'utf-8', timeout: 3000 }).trim()
        const count = parseInt(authors, 10)
        if (!isNaN(count) && count > 0) {
          repoContributorCount = count
        }
      }
    } catch {
      // gh not available or API failed — visibility stays 'unknown'
    }

    return { repoUrl, repoVisibility, repoContributorCount }
  } catch {
    return {}
  }
}

export function getGitCommits(projectPath: string, since?: string | null, limit = 20): { hash: string; message: string; date: string; author: string }[] {
  try {
    const sinceArg = since ? `--since="${since}"` : ''
    const cmd = `git -C "${projectPath}" log --format="%H|||%s|||%ai|||%an" ${sinceArg} -${limit} 2>/dev/null`
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim()
    if (!output) return []
    return output.split('\n').map(line => {
      const [hash, message, date, author] = line.split('|||')
      return { hash: hash.substring(0, 7), message, date, author }
    })
  } catch {
    return []
  }
}

/* --- IPC Handler Registration --- */

export function registerProjectHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.PROJECT_DISCOVER, async (): Promise<DiscoveredProject[]> => {
    try {
      return discoverProjects(getAmplifierHome())
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[ipc] PROJECT_DISCOVER failed:', message)
      return []
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_REGISTER,
    async (
      _event,
      { slug, path: projPath, name }: { slug: string; path: string; name: string },
    ): Promise<{ success: boolean; sessions?: SessionState[]; error?: string }> => {
      try {
        if (!existsSync(projPath)) {
          mkdirSync(projPath, { recursive: true })
        }
        const sessionsDir = join(projPath, 'sessions')
        if (!existsSync(sessionsDir)) {
          mkdirSync(sessionsDir, { recursive: true })
        }

        upsertProject(slug, projPath, name)
        setProjectRegistered(slug, 1)

        const amplifierHome = getAmplifierHome()
        const sessions = scanSingleProject(amplifierHome, slug, name)

        addProjectWatch(slug)

        return { success: true, sessions }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[ipc] PROJECT_REGISTER failed:', message)
        return { success: false, error: message }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_UNREGISTER,
    async (
      _event,
      { slug }: { slug: string },
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        setProjectRegistered(slug, 0)
        return { success: true }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[ipc] PROJECT_UNREGISTER failed:', message)
        return { success: false, error: message }
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_LIST_REGISTERED,
    async (): Promise<Array<{ slug: string; name: string; path: string }>> => {
      try {
        return getRegisteredProjects().map((p) => ({
          slug: p.slug,
          name: p.name,
          path: p.path,
        }))
      } catch (err) {
        console.error('[ipc] PROJECT_LIST_REGISTERED failed:', err instanceof Error ? err.message : String(err))
        return []
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_OVERVIEW,
    async (
      _event,
      { slug }: { slug: string },
    ): Promise<import('../shared/types').ProjectOverview | null> => {
      try {
        const project = getProjectBySlug(slug)
        if (!project) return null
        const stats = getProjectOverviewStats(slug)
        const diskSessionCount = countProjectSessionsOnDisk(getAmplifierHome(), slug)
        const totalSessions = Math.max(diskSessionCount, stats.sessionCount)

        const allSessions = getAllProjectSessions(slug)

        // --- Classify sessions: split interactive from automated noise ---
        const classified = allSessions.map(s => ({
          ...s,
          cls: classifySession(s).classification,
        }))
        const interactiveSessions = classified.filter(s =>
          s.cls !== 'automated' && s.cls !== 'failed-auto')
        const interactiveCount = interactiveSessions.length

        // --- Scale & dates ---
        const sortedByDate = [...allSessions].sort((a, b) =>
          new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
        const firstSessionAt = sortedByDate.length > 0 ? sortedByDate[0].startedAt : undefined
        const lastActivityAt = stats.lastActivityAt ?? new Date().toISOString()

        // --- Activity pulse: interactive sessions only (no automated noise) ---
        const now = Date.now()
        const weekMs = 7 * 24 * 60 * 60 * 1000
        const sessionsThisWeek = interactiveSessions.filter(s =>
          now - new Date(s.startedAt).getTime() < weekMs).length
        const sessionsLastWeek = interactiveSessions.filter(s => {
          const age = now - new Date(s.startedAt).getTime()
          return age >= weekMs && age < weekMs * 2
        }).length

        // Trend detection (based on interactive sessions)
        const daysSinceLastActivity = (now - new Date(lastActivityAt).getTime()) / (24 * 60 * 60 * 1000)
        let trend: 'accelerating' | 'steady' | 'slowing' | 'dormant' | 'new'
        if (interactiveCount <= 3) {
          trend = 'new'
        } else if (daysSinceLastActivity > 14) {
          trend = 'dormant'
        } else if (sessionsThisWeek > sessionsLastWeek * 1.5) {
          trend = 'accelerating'
        } else if (sessionsLastWeek > sessionsThisWeek * 1.5) {
          trend = 'slowing'
        } else {
          trend = 'steady'
        }

        // --- Health ---
        const healthRatio = { done: 0, failed: 0, active: 0, total: allSessions.length }
        let stalledSessionCount = 0
        for (const s of allSessions) {
          if (s.status === 'done') healthRatio.done++
          else if (s.status === 'failed') healthRatio.failed++
          else if (['active', 'running', 'needs_input'].includes(s.status)) healthRatio.active++
          if (s.status === 'needs_input') stalledSessionCount++
        }

        const nonAutoSessions = allSessions.filter(s => {
          const c = classifySession(s)
          return c.classification !== 'automated' && c.classification !== 'failed-auto'
        })
        const nonAutoDone = nonAutoSessions.filter(s => s.status === 'done').length
        const nonAutoCompleted = nonAutoSessions.filter(s => s.status === 'done' || s.status === 'failed').length
        const meaningfulSuccessRate = nonAutoCompleted > 0 ? Math.round((nonAutoDone / nonAutoCompleted) * 100) : 0

        const recentFailureCount = allSessions.filter(s =>
          s.status === 'failed' && (now - new Date(s.startedAt).getTime()) < weekMs).length

        // --- Lifecycle (based on interactive sessions, not automated noise) ---
        let lifecycle: 'new' | 'active' | 'mature' | 'dormant'
        if (interactiveCount <= 3) {
          lifecycle = 'new'
        } else if (daysSinceLastActivity > 30) {
          lifecycle = 'dormant'
        } else if (interactiveCount > 50) {
          lifecycle = 'mature'
        } else {
          lifecycle = 'active'
        }

        // --- Recent work topics ---
        const meaningfulTitles = allSessions
          .filter(s => s.title && s.title.length > 10
            && !s.title.startsWith('load_skill')
            && !s.title.startsWith('Execute recipe')
            && (now - new Date(s.startedAt).getTime()) < weekMs * 2)
          .map(s => s.title!.replace(/^(I want to |Can you |Please |Let's |Let me )/i, '').trim())
          .slice(0, 10)
        const seenTopics = new Set<string>()
        const recentWorkTopics: string[] = []
        for (const title of meaningfulTitles) {
          const topic = title.split(/\s+/).slice(0, 6).join(' ')
          const key = topic.toLowerCase()
          if (!seenTopics.has(key) && recentWorkTopics.length < 5) {
            seenTopics.add(key)
            recentWorkTopics.push(topic)
          }
        }

        // --- Last commit ---
        let lastCommitMessage: string | undefined
        let lastCommitAt: string | undefined
        try {
          const commits = getGitCommits(project.path, null, 1)
          if (commits.length > 0) {
            lastCommitMessage = commits[0].message
            lastCommitAt = commits[0].date
          }
        } catch { /* no git */ }

        // --- README description ---
        let description: string | undefined
        try {
          const readmePath = join(project.path, 'README.md')
          const readmeContent = await readFile(readmePath, 'utf-8')
          const lines = readmeContent.split('\n')
          let foundTitle = false
          const paragraphLines: string[] = []
          for (const line of lines) {
            if (!foundTitle && line.startsWith('#')) {
              foundTitle = true
              continue
            }
            if (foundTitle) {
              const trimmed = line.trim()
              if (trimmed === '' && paragraphLines.length > 0) break
              if (trimmed === '') continue
              if (trimmed.startsWith('#')) break
              paragraphLines.push(trimmed)
            }
          }
          if (paragraphLines.length > 0) {
            description = paragraphLines.join(' ')
          }
        } catch { /* no README */ }

        // --- Repository metadata ---
        const repoMeta = getGitRepoMetadata(project.path)

        const result: import('../shared/types').ProjectOverview = {
          slug: project.slug,
          name: project.name,
          path: project.path,
          description,
          repoUrl: repoMeta.repoUrl,
          repoVisibility: repoMeta.repoVisibility,
          repoContributorCount: repoMeta.repoContributorCount,
          sessionCount: interactiveCount,
          totalPrompts: interactiveSessions.reduce((sum, s) => sum + s.promptCount, 0),
          totalToolCalls: interactiveSessions.reduce((sum, s) => sum + s.toolCallCount, 0),
          totalFilesChanged: stats.totalFilesChanged,  // NOTE: currently always 0 — scanner doesn't populate this yet
          firstSessionAt,
          lastActivityAt,
          sessionsThisWeek,
          sessionsLastWeek,
          trend,
          meaningfulSuccessRate,
          healthRatio,
          activeSessionCount: stats.activeSessionCount,
          lifecycle,
          stalledSessionCount,
          recentFailureCount,
          recentWorkTopics,
          lastCommitMessage,
          lastCommitAt,
        }
        return result
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[ipc] PROJECT_OVERVIEW failed:', message)
        return null
      }
    },
  )

  // --- Project History handler ---
  ipcMain.handle(
    IPC_CHANNELS.PROJECT_HISTORY,
    async (
      _event,
      { slug }: { slug: string },
    ): Promise<ProjectHistorySession[]> => {
      try {
        const sessions = getAllProjectSessions(slug)
        return sessions.map((s) => ({
          id: s.id,
          title: s.title,
          status: s.status,
          startedAt: s.startedAt,
          endedAt: s.endedAt,
          promptCount: s.promptCount,
          toolCallCount: s.toolCallCount,
          filesChangedCount: (s as any).filesChangedCount ?? 0,
          classification: classifySession(s).classification,
          firstPrompt: s.firstPrompt,
        }))
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[ipc] PROJECT_HISTORY failed:', message)
        return []
      }
    },
  )

  // --- Project Stats handler ---
  ipcMain.handle(
    IPC_CHANNELS.PROJECT_STATS,
    async (
      _event,
      { slug }: { slug: string },
    ): Promise<ProjectStatsData | null> => {
      try {
        const overviewStats = getProjectOverviewStats(slug)
        const dailyActivity = getDailySessionCounts(slug)
        const allSessions = getAllProjectSessions(slug)

        const statusDistribution = { done: 0, failed: 0, active: 0, other: 0 }
        for (const s of allSessions) {
          if (s.status === 'done') statusDistribution.done++
          else if (s.status === 'failed') statusDistribution.failed++
          else if (['active', 'running', 'needs_input'].includes(s.status)) statusDistribution.active++
          else statusDistribution.other++
        }

        const completedTotal = statusDistribution.done + statusDistribution.failed
        const successRate = completedTotal > 0
          ? Math.round((statusDistribution.done / completedTotal) * 100)
          : 0

        const sessionCount = allSessions.length || 1
        const avgPromptsPerSession = Math.round((overviewStats.totalPrompts / sessionCount) * 10) / 10
        const avgToolsPerSession = Math.round((overviewStats.totalToolCalls / sessionCount) * 10) / 10

        let totalDurationMs = 0
        let durationCount = 0
        for (const s of allSessions) {
          if (s.endedAt) {
            const dur = new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()
            if (dur > 0) {
              totalDurationMs += dur
              durationCount++
            }
          }
        }
        const avgDurationMinutes = durationCount > 0
          ? Math.round(totalDurationMs / durationCount / 60000)
          : 0

        const ampHome = getAmplifierHome()
        const agentSessionCount = countAgentSessionsOnDisk(ampHome, slug)
        const rootSessionCount = allSessions.length
        const delegationRatio = rootSessionCount > 0 ? Math.round((agentSessionCount / rootSessionCount) * 10) / 10 : 0

        const classificationBreakdown = { deepWork: 0, quickTask: 0, automated: 0, failedAuto: 0 }
        for (const s of allSessions) {
          const c = classifySession(s)
          if (c.classification === 'deep-work') classificationBreakdown.deepWork++
          else if (c.classification === 'quick-task') classificationBreakdown.quickTask++
          else if (c.classification === 'automated') classificationBreakdown.automated++
          else if (c.classification === 'failed-auto') classificationBreakdown.failedAuto++
        }

        const meaningfulSessions = allSessions.filter(s => {
          const c = classifySession(s)
          return c.classification !== 'automated' && c.classification !== 'failed-auto'
        })
        const meaningfulDone = meaningfulSessions.filter(s => s.status === 'done').length
        const meaningfulCompleted = meaningfulSessions.filter(s => s.status === 'done' || s.status === 'failed').length
        const meaningfulSuccessRate = meaningfulCompleted > 0 ? Math.round((meaningfulDone / meaningfulCompleted) * 100) : 0
        const meaningfulSessionCount = meaningfulSessions.length

        return {
          totalSessions: allSessions.length,
          totalPrompts: overviewStats.totalPrompts,
          totalToolCalls: overviewStats.totalToolCalls,
          totalFilesChanged: overviewStats.totalFilesChanged,
          successRate,
          avgPromptsPerSession,
          avgToolsPerSession,
          avgDurationMinutes,
          dailyActivity,
          statusDistribution,
          rootSessionCount,
          agentSessionCount,
          delegationRatio,
          classificationBreakdown,
          meaningfulSuccessRate,
          meaningfulSessionCount,
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[ipc] PROJECT_STATS failed:', message)
        return null
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_CONTEXT,
    async (_event, { slug }: { slug: string }): Promise<ProjectContext | null> => {
      try {
        const project = getProjectBySlug(slug)
        if (!project) return null

        const lastVisitedAt = getLastVisitedAt(slug)
        const allCommits = getGitCommits(project.path, null, 20)
        const commitsSinceLastVisit = lastVisitedAt
          ? getGitCommits(project.path, lastVisitedAt)
          : []

        const stalledSessions = getStalledSessions(slug)
        const ampHome = getAmplifierHome()
        const agentUsage = getAgentUsageBreakdown(ampHome, slug)
        const totalAgentSessions = countAgentSessionsOnDisk(ampHome, slug)

        updateLastVisited(slug)

        return {
          lastVisitedAt,
          recentCommits: allCommits,
          commitsSinceLastVisit,
          stalledSessions,
          agentUsage,
          totalAgentSessions,
        }
      } catch (err) {
        console.error('[ipc] PROJECT_CONTEXT failed:', err)
        return null
      }
    },
  )
}