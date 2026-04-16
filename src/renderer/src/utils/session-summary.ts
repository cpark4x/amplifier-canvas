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
 * Returns null if the session is ongoing or lacks enough info.
 * Max ~60 chars.
 */
export function generateSessionOneLiner(
  session: SessionForSummary,
  overlappingCommits: CommitInfo[],
): string | null {
  // Don't summarize ongoing work
  if (session.status === 'active' || session.status === 'needs_input' || session.status === 'running') {
    return null
  }

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

  // 3. Deep work session
  if (session.toolCallCount > 20) {
    return `Deep work session \u2014 ${session.toolCallCount} tool calls`
  }

  // 4. Quick task
  if (session.promptCount <= 2 && session.status === 'done') {
    return 'Quick task'
  }

  // 5. Failed
  if (session.status === 'failed') {
    return 'Session ended with errors'
  }

  // 6–7. Not enough info
  return null
}

/**
 * Find commits whose date falls within a session's time window.
 * If the session has no endedAt, we use startedAt + 2 hours as the window.
 */
export function correlateCommitsToSession(
  session: { startedAt: string; endedAt: string | null },
  allCommits: CommitInfo[],
): CommitInfo[] {
  const start = new Date(session.startedAt).getTime()
  const end = session.endedAt
    ? new Date(session.endedAt).getTime()
    : start + 2 * 60 * 60 * 1000 // +2 hours

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
