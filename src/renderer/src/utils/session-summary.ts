/**
 * Session one-liner generation and commit correlation utilities.
 *
 * These are pure frontend functions that take session data + git commits
 * and produce human-readable summaries for the dashboard.
 */

export interface SessionForSummary {
  title: string | null
  firstPrompt: string | null
  status: string
  startedAt: string
  endedAt: string | null
  promptCount: number
  toolCallCount: number
  filesChangedCount?: number
}

export interface CommitInfo {
  hash: string
  message: string
  date: string
}

/**
 * Generate a short one-liner summary for a session.
 * Returns null only if the session truly has no useful info.
 * Max ~60 chars.
 */
export function generateSessionOneLiner(
  session: SessionForSummary,
  overlappingCommits: CommitInfo[],
): string | null {
  // 1. Has overlapping commits → "Shipped: [message]"
  if (overlappingCommits.length > 0) {
    const first = truncateMessage(overlappingCommits[0].message, 40)
    if (overlappingCommits.length === 1) {
      return `Shipped: ${first}`
    }
    return `Shipped: ${first} +${overlappingCommits.length - 1} more`
  }

  // 2. Changed files
  if (session.filesChangedCount && session.filesChangedCount > 0) {
    return `Changed ${session.filesChangedCount} file${session.filesChangedCount !== 1 ? 's' : ''}`
  }

  // 3. Still in progress — show what kind of work it is
  if (session.status === 'active' || session.status === 'needs_input' || session.status === 'running') {
    if (session.toolCallCount > 100) {
      return `In progress — ${session.promptCount} prompts, ${session.toolCallCount} tool calls`
    }
    if (session.toolCallCount > 20) {
      return `In progress — deep work session`
    }
    if (session.promptCount > 5) {
      return `In progress — ${session.promptCount} prompts so far`
    }
    return null
  }

  // 4. Deep work session (completed)
  if (session.toolCallCount > 20) {
    return `${session.promptCount} prompts, ${session.toolCallCount} tool calls`
  }

  // 5. Quick task
  if (session.promptCount <= 2 && session.status === 'done') {
    return 'Quick task'
  }

  // 6. Failed
  if (session.status === 'failed') {
    return 'Session ended with errors'
  }

  // 7. Has some prompts — show count
  if (session.promptCount > 2) {
    return `${session.promptCount} prompts`
  }

  // 8. Not enough info
  return null
}

/**
 * Find commits whose date falls within a session's time window.
 *
 * Window logic:
 * - If session has endedAt → use [startedAt, endedAt]
 * - If session is still active (no endedAt) → use [startedAt, now]
 *   (the session is still running, so commits up to now are relevant)
 * - Buffer: add 5 minutes before start to catch commits made just before
 *   session began (common when you commit then start a new session)
 */
export function correlateCommitsToSession(
  session: { startedAt: string; endedAt: string | null; status?: string },
  allCommits: CommitInfo[],
): CommitInfo[] {
  const BUFFER_MS = 5 * 60 * 1000 // 5 minutes before session start
  const start = new Date(session.startedAt).getTime() - BUFFER_MS

  let end: number
  if (session.endedAt) {
    end = new Date(session.endedAt).getTime()
  } else {
    // Session still running — commits up to now are relevant
    end = Date.now()
  }

  return allCommits.filter((c) => {
    const commitTime = new Date(c.date).getTime()
    return commitTime >= start && commitTime <= end
  })
}

/* --- internal helpers --- */

function truncateMessage(msg: string, maxLen: number): string {
  const clean = msg.trim()
  if (clean.length <= maxLen) return clean
  return clean.substring(0, maxLen).trimEnd() + '\u2026'
}
