import { useState, useEffect, useMemo } from 'react'
import { useCanvasStore } from '../store'
import type { ProjectHistorySession, SessionClassification } from '../../../shared/types'

interface ProjectHistoryTabProps {
  projectSlug: string
}

// ---------------------------------------------------------------------------
// Filter types
// ---------------------------------------------------------------------------

type ClassificationFilter = 'all' | 'deep-work' | 'quick-task' | 'auto'

const FILTER_CHIPS: { key: ClassificationFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'deep-work', label: 'Deep Work' },
  { key: 'quick-task', label: 'Quick' },
  { key: 'auto', label: 'Auto' },
]

function matchesFilter(
  classification: SessionClassification,
  filter: ClassificationFilter,
): boolean {
  if (filter === 'all') return true
  if (filter === 'auto') return classification === 'automated' || classification === 'failed-auto'
  return classification === filter
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

// Classification badge config
const CLASSIFICATION_BADGE: Record<
  SessionClassification,
  { icon: string; bg: string; color: string }
> = {
  'deep-work': { icon: '⚡', bg: 'rgba(76,175,116,0.1)', color: 'var(--green)' },
  'quick-task': { icon: '→', bg: 'rgba(221,213,200,0.3)', color: 'var(--text-muted)' },
  automated: { icon: '⚙', bg: 'rgba(160,152,136,0.15)', color: 'var(--text-very-muted)' },
  'failed-auto': { icon: '⚙', bg: 'rgba(239,68,68,0.1)', color: 'var(--red)' },
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ProjectHistoryTab({ projectSlug }: ProjectHistoryTabProps): React.ReactElement {
  const [sessions, setSessions] = useState<ProjectHistorySession[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [classFilter, setClassFilter] = useState<ClassificationFilter>('all')

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

  // Filtered list — search (on title) AND classification filter
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sessions.filter((s) => {
      if (q && !(s.title ?? '').toLowerCase().includes(q)) return false
      if (!matchesFilter(s.classification, classFilter)) return false
      return true
    })
  }, [sessions, query, classFilter])

  // Classification counts (from filtered results)
  const counts = useMemo(() => {
    const deepWork = filtered.filter((s) => s.classification === 'deep-work').length
    const quick = filtered.filter((s) => s.classification === 'quick-task').length
    const auto = filtered.filter(
      (s) => s.classification === 'automated' || s.classification === 'failed-auto',
    ).length
    return { deepWork, quick, auto }
  }, [filtered])

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

  const hasActiveFilters = query.trim() !== '' || classFilter !== 'all'

  function clearFilters(): void {
    setQuery('')
    setClassFilter('all')
  }

  function handleClick(id: string): void {
    selectSession(id)
    setViewMode('session')
  }

  // --- Render ---

  if (loading) {
    return (
      <div data-testid="project-history-tab">
        <div
          style={{
            fontSize: 13,
            color: 'var(--text-muted)',
            textAlign: 'center',
            padding: '24px 0',
          }}
        >
          Loading history...
        </div>
      </div>
    )
  }

  return (
    <div data-testid="project-history-tab">
      {/* 1. Search + filter row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sessions..."
          style={{
            flex: 1,
            boxSizing: 'border-box',
            fontSize: 13,
            padding: '7px 12px',
            background: 'var(--bg-modal)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-ui)',
            outline: 'none',
          }}
        />
        {FILTER_CHIPS.map((chip) => {
          const isActive = classFilter === chip.key
          return (
            <button
              key={chip.key}
              onClick={() => setClassFilter(chip.key)}
              style={{
                fontSize: 11,
                padding: '4px 10px',
                borderRadius: 12,
                cursor: 'pointer',
                fontFamily: 'var(--font-ui)',
                fontWeight: isActive ? 600 : 400,
                background: isActive ? 'var(--text-primary)' : 'transparent',
                color: isActive ? '#fff' : 'var(--text-muted)',
                border: isActive ? '1px solid transparent' : '1px solid var(--border)',
                whiteSpace: 'nowrap',
                lineHeight: 1.2,
              }}
            >
              {chip.label}
            </button>
          )
        })}
      </div>

      {/* 2. Summary line */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, marginBottom: 12 }}>
        <span style={{ fontWeight: 600 }}>{filtered.length}</span> session
        {filtered.length !== 1 ? 's' : ''} &middot;{' '}
        <span style={{ fontWeight: 600 }}>{counts.deepWork}</span> deep work &middot;{' '}
        <span style={{ fontWeight: 600 }}>{counts.quick}</span> quick &middot;{' '}
        <span style={{ fontWeight: 600 }}>{counts.auto}</span> automated
      </div>

      {/* 5. Empty states */}
      {sessions.length === 0 && (
        <div
          style={{
            fontSize: 13,
            color: 'var(--text-muted)',
            textAlign: 'center',
            padding: '24px 0',
          }}
        >
          No sessions yet.
        </div>
      )}

      {sessions.length > 0 && filtered.length === 0 && hasActiveFilters && (
        <div
          style={{
            fontSize: 13,
            color: 'var(--text-muted)',
            textAlign: 'center',
            padding: '24px 0',
          }}
        >
          No matching sessions.{' '}
          <span
            onClick={clearFilters}
            style={{
              color: 'var(--text-primary)',
              cursor: 'pointer',
              textDecoration: 'underline',
              textUnderlineOffset: 2,
            }}
          >
            Clear filters
          </span>
        </div>
      )}

      {/* 3. Sessions grouped by date */}
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

          {/* 4. Session rows */}
          {group.sessions.map((session) => {
            const duration = formatDuration(session.startedAt, session.endedAt)
            const relTime = formatRelativeTime(session.startedAt)
            const hasTitle = session.title != null && session.title.length > 0
            const badge = CLASSIFICATION_BADGE[session.classification]

            return (
              <div
                key={session.id}
                onClick={() => handleClick(session.id)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  padding: '8px 4px',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLDivElement).style.background = 'rgba(0,0,0,0.03)'
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLDivElement).style.background = 'transparent'
                }}
              >
                {/* Left side */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Top line: status dot + badge + title */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* Status dot */}
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: statusColor(session.status),
                        flexShrink: 0,
                      }}
                    />

                    {/* Classification badge */}
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 500,
                        padding: '1px 6px',
                        borderRadius: 8,
                        background: badge.bg,
                        color: badge.color,
                        flexShrink: 0,
                        lineHeight: 1.4,
                      }}
                    >
                      {badge.icon}
                    </span>

                    {/* Title */}
                    <span
                      style={{
                        fontSize: 13,
                        color: hasTitle ? 'var(--text-primary)' : 'var(--text-very-muted)',
                        fontStyle: hasTitle ? 'normal' : 'italic',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        minWidth: 0,
                      }}
                    >
                      {hasTitle ? session.title : '(no title)'}
                    </span>
                  </div>

                  {/* Metadata line */}
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--text-very-muted)',
                      marginTop: 2,
                      marginLeft: 14 + 8, // align with title (dot width + gap)
                    }}
                  >
                    {duration} &middot; {session.promptCount} prompt
                    {session.promptCount !== 1 ? 's' : ''} &middot; {session.toolCallCount} tool
                    {' '}call{session.toolCallCount !== 1 ? 's' : ''}
                  </div>
                </div>

                {/* Right side — relative time */}
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                    textAlign: 'right',
                    marginTop: 1,
                    marginLeft: 12,
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
