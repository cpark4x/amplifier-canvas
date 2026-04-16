/**
 * Generate a project assessment and key outcomes from session data.
 * Pure function — no LLM needed. Derives everything from session titles,
 * statuses, date ranges, and stats already in the DB.
 */

interface SessionSummary {
  title: string | null
  status: string
  startedAt: string
  promptCount: number
  toolCallCount: number
  firstPrompt: string | null
}

interface ProjectAssessment {
  assessment: string
  outcomes: string[]
  recentTopics: string[]
}

export function generateProjectAssessment(
  sessions: SessionSummary[],
  totalSessionCount: number,
): ProjectAssessment {
  if (sessions.length === 0) {
    return {
      assessment: 'No sessions recorded yet.',
      outcomes: [],
      recentTopics: [],
    }
  }

  // --- Date range ---
  const dates = sessions.map((s) => new Date(s.startedAt)).sort((a, b) => a.getTime() - b.getTime())
  const oldest = dates[0]
  const newest = dates[dates.length - 1]
  const daySpan = Math.max(1, Math.ceil((newest.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24)))

  // --- Status distribution ---
  const statusCounts: Record<string, number> = {}
  for (const s of sessions) {
    statusCounts[s.status] = (statusCounts[s.status] || 0) + 1
  }
  const failedCount = statusCounts['failed'] || 0
  const doneCount = statusCounts['done'] || 0
  const activeCount = (statusCounts['active'] || 0) + (statusCounts['needs_input'] || 0)

  // --- Totals ---
  const totalPrompts = sessions.reduce((sum, s) => sum + (s.promptCount || 0), 0)
  const totalTools = sessions.reduce((sum, s) => sum + (s.toolCallCount || 0), 0)

  // --- Extract meaningful topics from titles ---
  const meaningfulSessions = sessions.filter(
    (s) => s.title && s.title.length > 10 && !s.title.startsWith('load_skill') && !s.title.startsWith('Execute recipe'),
  )

  // --- Build assessment ---
  const parts: string[] = []

  // Activity summary
  const timeDesc = daySpan <= 1 ? 'today' : daySpan <= 7 ? `over the past week` : `over ${daySpan} days`
  parts.push(
    `${totalSessionCount} sessions ${timeDesc} with ${totalPrompts} prompts and ${totalTools} tool calls.`,
  )

  // Health signal
  if (failedCount > doneCount && failedCount > 3) {
    const failRate = Math.round((failedCount / sessions.length) * 100)
    parts.push(
      `${failRate}% of recent sessions failed — there may be a recurring issue worth investigating.`,
    )
  } else if (activeCount > 0) {
    parts.push(`${activeCount} session${activeCount > 1 ? 's' : ''} still in progress.`)
  }

  // Recent work description from top meaningful titles
  if (meaningfulSessions.length > 0) {
    const topTopics = meaningfulSessions
      .slice(0, 3)
      .map((s) => summarizeTitle(s.title!))
      .filter(Boolean)
    if (topTopics.length > 0) {
      parts.push(`Recent work: ${topTopics.join(', ')}.`)
    }
  }

  // --- Build outcomes (completed meaningful sessions) ---
  const outcomes: string[] = []
  for (const s of meaningfulSessions) {
    if (s.status === 'done' && s.title) {
      outcomes.push(summarizeTitle(s.title))
    }
    if (outcomes.length >= 5) break
  }

  // If no done sessions, show what's in progress
  if (outcomes.length === 0) {
    for (const s of meaningfulSessions) {
      if (s.status === 'needs_input' && s.title) {
        outcomes.push(`In progress: ${summarizeTitle(s.title)}`)
      }
      if (outcomes.length >= 3) break
    }
  }

  const recentTopics = meaningfulSessions
    .slice(0, 5)
    .map((s) => summarizeTitle(s.title!))
    .filter(Boolean)

  return {
    assessment: parts.join(' '),
    outcomes,
    recentTopics,
  }
}

/** Trim a session title to a readable summary */
function summarizeTitle(title: string): string {
  // Truncate long titles
  const cleaned = title
    .replace(/^(I want to |Can you |Please |Let's |Let me )/i, '')
    .replace(/\.\.\.$/, '')
    .trim()

  if (cleaned.length > 80) {
    return cleaned.slice(0, 77) + '...'
  }
  return cleaned
}