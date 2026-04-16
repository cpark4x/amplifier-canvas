import { useState, useEffect, useMemo } from 'react'
import { useCanvasStore } from '../store'
import type { ProjectHistorySession } from '../../../shared/types'

interface ProjectHistoryTabProps {
  projectSlug: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatDuration(startedAt: string, endedAt?: string | null): string {
  const end = endedAt ? new Date(endedAt).getTime() : Date.now()
  const ms = end - new Date(startedAt).getTime()
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return '<1m'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`
}

type DateGroup = 'Today' | 'Yesterday' | 'This Week' | 'This Month' | 'Older'
const GROUP_ORDER: DateGroup[] = ['Today', 'Yesterday', 'This Week', 'This Month', 'Older']

function classifyDate(isoString: string): DateGroup {
  const now = new Date()
  const date = new Date(isoString)

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000)
  const sevenDaysAgo = new Date(startOfToday.getTime() - 6 * 86_400_000)
  const thirtyDaysAgo = new Date(startOfToday.getTime() - 29 * 86_400_000)

  if (date >= startOfToday) return 'Today'
  if (date >= startOfYesterday) return 'Yesterday'
  if (date >= sevenDaysAgo) return 'This Week'
  if (date >= thirtyDaysAgo) return 'This Month'
  return 'Older'
}

const ACTIVE_STATUSES = new Set(['running', 'active', 'needs_input'])

function statusColor(status: string): string {
  if (status === 'done') return 'var(--green)'
  if (status === 'failed') return 'var(--red)'
  if (ACTIVE_STATUSES.has(status)) return 'var(--amber)'
  return 'var(--text-very-muted)'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ProjectHistoryTab({ projectSlug }: ProjectHistoryTabProps): React.ReactElement {
  const [sessions, setSessions] = useState<ProjectHistorySession[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  const selectSession = useCanvasStore((s) => s.selectSession)
  const setViewMode = useCanvasStore((s) => s.setViewMode)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    window.electronAPI
      .getProjectHistory(projectSlug)
      .then((data: ProjectHistorySession[]) => {
        if (!cancelled) setSessions(data)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectSlug])

  // Filtered list
  const filtered = useMemo(() => {
    if (!query.trim()) return sessions
    const q = query.toLowerCase()
    return sessions.filter((s) => (s.title ?? '').toLowerCase().includes(q))
  }, [sessions, query])

  // Counts (from filtered)
  const completedCount = filtered.filter((s) => s.status === 'done').length
  const failedCount = filtered.filter((s) => s.status === 'failed').length

  // Group by date, sorted most-recent-first within each group
  const grouped = useMemo(() => {
    const sorted = [...filtered].sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    )
    const map = new Map<DateGroup, ProjectHistorySession[]>()
    for (const s of sorted) {
      const g = classifyDate(s.startedAt)
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(s)
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({
      label: g,
      sessions: map.get(g)!,
    }))
  }, [filtered])

  // Handlers
  function handleClick(id: string): void {
    selectSession(id)
    setViewMode('session')
  }

  // --- Render ---

  if (loading) {
    return (
      <div data-testid="project-history-tab">
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading history...</div>
      </div>
    )
  }

  return (
    <div data-testid="project-history-tab">
      {/* Search bar */}
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search sessions..."
        style={{
          width: '100%',
          boxSizing: 'border-box',
          fontSize: 13,
          padding: '8px 12px',
          background: 'var(--bg-modal)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-ui)',
          outline: 'none',
          marginBottom: 16,
        }}
      />

      {/* Summary line */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        {filtered.length} session{filtered.length !== 1 ? 's' : ''} &middot;{' '}
        {completedCount} completed &middot; {failedCount} failed
      </div>

      {/* Empty states */}
      {sessions.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No sessions found.</div>
      )}
      {sessions.length > 0 && filtered.length === 0 && query.trim() && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          No sessions matching &lsquo;{query.trim()}&rsquo;.
        </div>
      )}

      {/* Grouped sessions */}
      {grouped.map((group, groupIdx) => (
        <div key={group.label}>
          {/* Group heading */}
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--text-muted)',
              marginTop: groupIdx === 0 ? 0 : 16,
              marginBottom: 6,
            }}
          >
            {group.label}
          </div>

          {/* Session rows */}
          {group.sessions.map((session, i) => {
            const isLast = i === group.sessions.length - 1
            const duration = formatDuration(session.startedAt, session.endedAt)
            const relTime = formatRelativeTime(session.startedAt)
            const hasTitle = session.title != null && session.title.length > 0

            return (
              <div
                key={session.id}
                onClick={() => handleClick(session.id)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  padding: '8px 4px',
                  borderBottom: isLast ? 'none' : '1px solid var(--border)',
                  cursor: 'pointer',
                  gap: 10,
                }}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLDivElement).style.background = 'rgba(0,0,0,0.03)'
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLDivElement).style.background = 'transparent'
                }}
              >
                {/* Status dot */}
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: statusColor(session.status),
                    flexShrink: 0,
                    marginTop: 5,
                  }}
                />

                {/* Title + metadata */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      color: hasTitle ? 'var(--text-primary)' : 'var(--text-very-muted)',
                      fontStyle: hasTitle ? 'normal' : 'italic',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {hasTitle ? session.title : '(no title)'}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--text-very-muted)',
                      marginTop: 2,
                    }}
                  >
                    {duration} &middot; {session.promptCount} prompt
                    {session.promptCount !== 1 ? 's' : ''} &middot; {session.toolCallCount} tool
                    call{session.toolCallCount !== 1 ? 's' : ''}
                  </div>
                </div>

                {/* Relative time */}
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--text-muted)',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                    textAlign: 'right',
                    marginTop: 1,
                  }}
                >
                  {relTime}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

export default ProjectHistoryTab
