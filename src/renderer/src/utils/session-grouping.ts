/**
 * Related session grouping for the History tab.
 *
 * Groups sessions that started on the same calendar day and share
 * significant title words, so the timeline isn't a flat list of 20 items.
 */

export interface GroupableSession {
  id: string
  title: string | null
  startedAt: string
  classification: string
}

export interface SessionGroup {
  label: string        // "Auth feature work" or "3 related sessions"
  sessions: string[]   // session IDs in the group
  startedAt: string    // earliest session startedAt in group
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'to', 'for', 'in', 'on', 'is', 'my', 'me',
  'help', 'with', 'of', 'it', 'this', 'that', 'be', 'do', 'i', 'we',
  'add', 'fix', 'update', 'change', 'make', 'get', 'set', 'use',
])

/**
 * Group related sessions by same-day + shared significant title words.
 * Returns groups (≥2 sessions) and leaves singles ungrouped (not returned).
 * If ≤3 sessions total, skip grouping entirely (not useful at small scale).
 */
export function groupRelatedSessions(sessions: GroupableSession[]): SessionGroup[] {
  if (sessions.length <= 3) return []

  // Bucket sessions by calendar date (YYYY-MM-DD)
  const byDate = new Map<string, GroupableSession[]>()
  for (const s of sessions) {
    const dateKey = s.startedAt.substring(0, 10) // YYYY-MM-DD
    if (!byDate.has(dateKey)) byDate.set(dateKey, [])
    byDate.get(dateKey)!.push(s)
  }

  const groups: SessionGroup[] = []

  for (const daySessions of byDate.values()) {
    if (daySessions.length < 2) continue

    // Extract significant words per session
    const sessionWords = new Map<string, Set<string>>()
    for (const s of daySessions) {
      sessionWords.set(s.id, extractSignificantWords(s.title))
    }

    // Find groups: union-find style — sessions sharing ≥2 words are related
    const grouped = new Set<string>()
    const clusters: GroupableSession[][] = []

    for (let i = 0; i < daySessions.length; i++) {
      if (grouped.has(daySessions[i].id)) continue

      const cluster: GroupableSession[] = [daySessions[i]]
      const clusterWords = new Set(sessionWords.get(daySessions[i].id))

      for (let j = i + 1; j < daySessions.length; j++) {
        if (grouped.has(daySessions[j].id)) continue

        const words = sessionWords.get(daySessions[j].id)!
        const shared = countSharedWords(clusterWords, words)

        if (shared >= 2) {
          cluster.push(daySessions[j])
          // Expand cluster words for transitive grouping
          for (const w of words) clusterWords.add(w)
        }
      }

      if (cluster.length >= 2) {
        clusters.push(cluster)
        for (const s of cluster) grouped.add(s.id)
      }
    }

    // Build SessionGroup objects from clusters
    for (const cluster of clusters) {
      const allWords = cluster.flatMap((s) => [...sessionWords.get(s.id)!])
      const label = buildGroupLabel(allWords)
      const earliest = cluster.reduce(
        (min, s) => (s.startedAt < min ? s.startedAt : min),
        cluster[0].startedAt,
      )

      groups.push({
        label,
        sessions: cluster.map((s) => s.id),
        startedAt: earliest,
      })
    }
  }

  return groups
}

/* --- internal helpers --- */

function extractSignificantWords(title: string | null): Set<string> {
  if (!title) return new Set()
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  )
}

function countSharedWords(a: Set<string>, b: Set<string>): number {
  let count = 0
  for (const word of b) {
    if (a.has(word)) count++
  }
  return count
}

function buildGroupLabel(allWords: string[]): string {
  // Count word frequencies and pick the top 2–3
  const freq = new Map<string, number>()
  for (const w of allWords) {
    freq.set(w, (freq.get(w) || 0) + 1)
  }

  const sorted = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([word]) => word)

  if (sorted.length === 0) return 'Related sessions'

  // Capitalize and join
  const capitalized = sorted.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
  return capitalized.join(' ') + ' work'
}
