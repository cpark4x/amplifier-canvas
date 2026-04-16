import { useState, useEffect, useMemo, useCallback } from 'react'
import { useCanvasStore } from '../store'
import type { ProjectHistorySession, SessionClassification, ProjectContext } from '../../../shared/types'

interface ProjectHistoryTabProps {
  projectSlug: string
}

// ---------------------------------------------------------------------------
// Filter types — default is 'work' (deep + quick), not 'all'
// ---------------------------------------------------------------------------

type ClassificationFilter = 'work' | 'all' | 'deep-work' | 'quick-task' | 'auto'

const FILTER_CHIPS: { key: ClassificationFilter; label: string }[] = [
  { key: 'work', label: 'My Work' },
  { key: 'deep-work', label: 'Deep Work' },
  { key: 'quick-task', label: 'Quick' },
  { key: 'auto', label: 'Auto' },
  { key: 'all', label: 'All' },
]

function matchesFilter(
  classification: SessionClassification,
  filter: ClassificationFilter,
): boolean {
  if (filter === 'all') return true
  if (filter === 'work') return classification === 'deep-work' || classification === 'quick-task'
  if (filter === 'auto') return classification === 'automated' || classification === 'failed-auto'
  return classification === filter
}

// ---------------------------------------------------------------------------
// Timeline item types — sessions and commits in a unified list
// ---------------------------------------------------------------------------

interface CommitData {
  hash: string
  message: string
  date: string
  author: string
}

type TimelineItem =
  | { type: 'session'; data: ProjectHistorySession }
  | { type: 'commit'; data: CommitData }

function getTimelineDate(item: TimelineItem): string {
  return item.type === 'session' ? item.data.startedAt : item.data.date
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

function truncatePrompt(text: string, maxLen = 80): string {
  const firstLine = text.split('\n')[0].trim()
  if (firstLine.length <= maxLen) return firstLine
  return firstLine.substring(0, maxLen).trimEnd() + '…'
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

/** Filters where commits should appear alongside sessions */
const SHOW_COMMITS_IN_FILTER = new Set<ClassificationFilter>(['work', 'deep-work', 'quick-task', 'all'])

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ProjectHistoryTab({ projectSlug }: ProjectHistoryTabProps): React.ReactElement {
  const [sessions, setSessions] = useState<ProjectHistorySession[]>([])
  const [commits, setCommits] = useState<CommitData[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [classFilter, setClassFilter] = useState<ClassificationFilter>('work') // Default: My Work
  const [dismissing, setDismissing] = useState(false)

  const selectSession = useCanvasStore((s) => s.selectSession)
  const setViewMode = useCanvasStore((s) => s.setViewMode)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    // Fetch sessions and context in parallel
    Promise.all([
      window.electronAPI.getProjectHistory(projectSlug),
      window.electronAPI.getProjectContext(projectSlug),
    ])
      .then(([historyData, contextData]: [ProjectHistorySession[], ProjectContext | null]) => {
        if (!cancelled) {
          setSessions(historyData)
          setCommits(contextData?.recentCommits ?? [])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectSlug])

  // --- Resumable sessions (needs_input / running / active) ---
  const resumable = useMemo(() => {
    return sessions.filter((s) => ACTIVE_STATUSES.has(s.status) && s.promptCount > 0)
  }, [sessions])

  // --- Noise sessions (automated + failed-auto + ghost) for batch dismiss ---
  const noiseSessionIds = useMemo(() => {
    return sessions
      .filter((s) => s.classification === 'automated' || s.classification === 'failed-auto')
      .map((s) => s.id)
  }, [sessions])

  // Filtered sessions — search (on title) AND classification filter
  const filteredSessions = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sessions.filter((s) => {
      if (q && !(s.title ?? '').toLowerCase().includes(q)) return false
      if (!matchesFilter(s.classification, classFilter)) return false
      return true
    })
  }, [sessions, query, classFilter])

  // Build unified timeline: merge filtered sessions with commits
  const timeline = useMemo(() => {
    const items: TimelineItem[] = filteredSessions.map((s) => ({ type: 'session', data: s }))

    // Only add commits when the current filter shows them
    if (SHOW_COMMITS_IN_FILTER.has(classFilter)) {
      const q = query.trim().toLowerCase()
      for (const c of commits) {
        // If searching, filter commits by message too
        if (q && !c.message.toLowerCase().includes(q)) continue
        items.push({ type: 'commit', data: c })
      }
    }

    // Sort by date descending
    items.sort(
      (a, b) => new Date(getTimelineDate(b)).getTime() - new Date(getTimelineDate(a)).getTime(),
    )

    return items
  }, [filteredSessions, commits, classFilter, query])

  // Classification counts (from ALL sessions, not filtered)
  const counts = useMemo(() => {
    const deepWork = sessions.filter((s) => s.classification === 'deep-work').length
    const quick = sessions.filter((s) => s.classification === 'quick-task').length
    const auto = sessions.filter(
      (s) => s.classification === 'automated' || s.classification === 'failed-auto',
    ).length
    return { deepWork, quick, auto, work: deepWork + quick }
  }, [sessions])

  // Group timeline by date
  const grouped = useMemo(() => {
    const map = new Map<DateGroup, TimelineItem[]>()
    for (const item of timeline) {
      const g = classifyDate(getTimelineDate(item))
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(item)
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({
      label: g,
      items: map.get(g)!,
    }))
  }, [timeline])

  // Count only sessions for the summary line
  const filteredSessionCount = filteredSessions.length

  const hasActiveFilters = query.trim() !== '' || classFilter !== 'work'

  function clearFilters(): void {
    setQuery('')
    setClassFilter('work')
  }

  function handleClick(id: string): void {
    selectSession(id)
    setViewMode('session')
  }

  const handleBatchDismiss = useCallback(async () => {
    if (noiseSessionIds.length === 0) return
    setDismissing(true)
    try {
      const result = await window.electronAPI.batchHideSessions(noiseSessionIds)
      if (result.success) {
        // Remove dismissed sessions from local state
        setSessions((prev) =>
          prev.filter((s) => !noiseSessionIds.includes(s.id)),
        )
      }
    } finally {
      setDismissing(false)
    }
  }, [noiseSessionIds])

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
      {/* 0. Resumable sessions — pinned to top */}
      {resumable.length > 0 && (
        <div
          style={{
            marginBottom: 16,
            background: 'rgba(245,158,11,0.06)',
            border: '1px solid rgba(245,158,11,0.2)',
            borderRadius: 8,
            padding: '10px 14px',
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--amber)',
              marginBottom: 8,
            }}
          >
            Waiting for you
          </div>
          {resumable.map((s) => (
            <div
              key={s.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 0',
                borderBottom: '1px solid rgba(245,158,11,0.12)',
              }}
            >
              {/* Amber pulse dot */}
              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: 'var(--amber)',
                  flexShrink: 0,
                  boxShadow: '0 0 4px rgba(245,158,11,0.4)',
                }}
              />
              {/* Title */}
              <span
                style={{
                  fontSize: 13,
                  color: 'var(--text-primary)',
                  flex: 1,
                  minWidth: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {s.title ?? '(no title)'}
              </span>
              {/* Metadata */}
              <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                {s.promptCount} prompts · {formatRelativeTime(s.startedAt)}
              </span>
              {/* Resume button */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleClick(s.id)
                }}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '3px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--amber)',
                  background: 'rgba(245,158,11,0.1)',
                  color: 'var(--amber)',
                  cursor: 'pointer',
                  flexShrink: 0,
                  fontFamily: 'var(--font-ui)',
                }}
              >
                Resume
              </button>
            </div>
          ))}
        </div>
      )}

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

      {/* 2. Summary line + batch dismiss */}
      <div
        style={{
          fontSize: 12,
          color: 'var(--text-muted)',
          marginTop: 8,
          marginBottom: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>
          <span style={{ fontWeight: 600 }}>{filteredSessionCount}</span> session
          {filteredSessionCount !== 1 ? 's' : ''}
          {classFilter === 'work' && counts.auto > 0 && (
            <span style={{ color: 'var(--text-very-muted)' }}>
              {' '}· {counts.auto} automated hidden
            </span>
          )}
        </span>
        {/* Batch dismiss button — shown when noise exists */}
        {noiseSessionIds.length > 0 && (
          <button
            onClick={handleBatchDismiss}
            disabled={dismissing}
            style={{
              fontSize: 11,
              padding: '3px 10px',
              borderRadius: 6,
              cursor: dismissing ? 'default' : 'pointer',
              fontFamily: 'var(--font-ui)',
              fontWeight: 500,
              background: 'transparent',
              color: 'var(--text-very-muted)',
              border: '1px solid var(--border)',
              opacity: dismissing ? 0.5 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {dismissing
              ? 'Cleaning up...'
              : `Dismiss ${noiseSessionIds.length} automated`}
          </button>
        )}
      </div>

      {/* Empty states */}
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

      {sessions.length > 0 && filteredSessionCount === 0 && hasActiveFilters && (
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
            Show all work sessions
          </span>
        </div>
      )}

      {/* 3. Timeline grouped by date — sessions + commit markers */}
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

          {/* 4. Timeline rows */}
          {group.items.map((item, itemIdx) => {
            if (item.type === 'commit') {
              // --- Commit marker row ---
              const commit = item.data
              return (
                <div
                  key={`commit-${commit.hash}-${itemIdx}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '4px 4px 4px 22px',
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: 'var(--font-mono, monospace)',
                      color: 'var(--text-very-muted)',
                      flexShrink: 0,
                    }}
                  >
                    {commit.hash.substring(0, 7)}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--text-very-muted)',
                      flexShrink: 0,
                    }}
                  >
                    —
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--text-very-muted)',
                      flex: 1,
                      minWidth: 0,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {commit.message}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--text-very-muted)',
                      flexShrink: 0,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatRelativeTime(commit.date)}
                  </span>
                </div>
              )
            }

            // --- Session row ---
            const session = item.data
            const duration = formatDuration(session.startedAt, session.endedAt)
            const relTime = formatRelativeTime(session.startedAt)
            const hasTitle = session.title != null && session.title.length > 0
            const badge = CLASSIFICATION_BADGE[session.classification]
            const promptPreview =
              session.firstPrompt ? truncatePrompt(session.firstPrompt) : null

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
                    {duration} · {session.promptCount} prompt
                    {session.promptCount !== 1 ? 's' : ''} · {session.toolCallCount} tool
                    {' '}call{session.toolCallCount !== 1 ? 's' : ''}
                  </div>

                  {/* First prompt preview */}
                  {promptPreview && (
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--text-very-muted)',
                        fontStyle: 'italic',
                        marginTop: 2,
                        marginLeft: 14 + 8,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {promptPreview}
                    </div>
                  )}
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
