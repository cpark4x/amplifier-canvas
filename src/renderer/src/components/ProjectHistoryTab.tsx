import { useState, useEffect, useMemo, useCallback } from 'react'
import { useCanvasStore } from '../store'
import type { ProjectHistorySession, SessionClassification, ProjectContext } from '../../../shared/types'
import { generateSessionOneLiner, correlateCommitsToSession } from '../utils/session-summary'
import type { CommitInfo } from '../utils/session-summary'

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

function truncatePrompt(text: string, maxLen = 80): string {
  const firstLine = text.split('\n')[0].trim()
  if (firstLine.length <= maxLen) return firstLine
  return firstLine.substring(0, maxLen).trimEnd() + '\u2026'
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

function statusDot(status: string): string {
  if (status === 'done') return 'var(--green)'
  if (status === 'failed') return 'var(--red)'
  if (ACTIVE_STATUSES.has(status)) return 'var(--amber)'
  return 'var(--text-very-muted)'
}

function isInteractive(cls: SessionClassification): boolean {
  return cls === 'deep-work' || cls === 'quick-task'
}

// Pretty-print agent names: "foundation-git-ops" → "Git Ops"
function prettyAgentName(raw: string): string {
  // Strip common prefixes
  const stripped = raw
    .replace(/^foundation-/, '')
    .replace(/^superpowers-/, '')
    .replace(/^stories-/, '')
    .replace(/^amplifier-/, '')
  return stripped
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--text-muted)',
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  )
}

/** Session row — human-initiated sessions */
function SessionRow({
  session,
  oneLiner,
  onClick,
}: {
  session: ProjectHistorySession
  oneLiner: string | null
  onClick: () => void
}): React.ReactElement {
  const duration = formatDuration(session.startedAt, session.endedAt)
  const relTime = formatRelativeTime(session.startedAt)
  const hasTitle = session.title != null && session.title.length > 0
  const promptPreview = session.firstPrompt ? truncatePrompt(session.firstPrompt) : null
  const isResumable = ACTIVE_STATUSES.has(session.status)
  const isDeep = session.classification === 'deep-work'

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        padding: '10px 8px',
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
      {/* Status dot */}
      <div style={{ paddingTop: 5, paddingRight: 10, flexShrink: 0 }}>
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: statusDot(session.status),
            ...(isResumable ? { boxShadow: `0 0 4px ${statusDot(session.status)}` } : {}),
          }}
        />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Title line */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: isDeep ? 500 : 400,
              color: hasTitle ? 'var(--text-primary)' : 'var(--text-very-muted)',
              fontStyle: hasTitle ? 'normal' : 'italic',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minWidth: 0,
              flex: 1,
            }}
          >
            {hasTitle ? session.title : '(no title)'}
          </span>
          {isResumable && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 8,
                background: 'rgba(245,158,11,0.12)',
                color: 'var(--amber)',
                flexShrink: 0,
              }}
            >
              Resume
            </span>
          )}
        </div>

        {/* Metadata line */}
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-very-muted)',
            marginTop: 3,
            display: 'flex',
            gap: 4,
          }}
        >
          <span>{duration}</span>
          <span>&middot;</span>
          <span>{session.promptCount} prompt{session.promptCount !== 1 ? 's' : ''}</span>
          {session.toolCallCount > 0 && (
            <>
              <span>&middot;</span>
              <span>{session.toolCallCount} tool call{session.toolCallCount !== 1 ? 's' : ''}</span>
            </>
          )}
        </div>

        {/* One-liner or first prompt preview */}
        {(oneLiner || promptPreview) && (
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-very-muted)',
              fontStyle: 'italic',
              marginTop: 3,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {oneLiner || promptPreview}
          </div>
        )}
      </div>

      {/* Right: relative time */}
      <div
        style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          flexShrink: 0,
          whiteSpace: 'nowrap',
          marginLeft: 12,
          paddingTop: 2,
        }}
      >
        {relTime}
      </div>
    </div>
  )
}

/** Commit marker — thin inline row */
function CommitRow({
  commit,
}: {
  commit: { hash: string; message: string; date: string; author: string }
}): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '3px 8px 3px 25px',
        gap: 8,
        opacity: 0.6,
      }}
    >
      <span style={{ fontSize: 10, fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-very-muted)', flexShrink: 0 }}>
        {commit.hash.substring(0, 7)}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-very-muted)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {commit.message}
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-very-muted)', flexShrink: 0 }}>
        {formatRelativeTime(commit.date)}
      </span>
    </div>
  )
}

/** Collapsed automated sessions summary for a date group */
function AutomatedSummary({
  sessions,
  onExpand,
  expanded,
  onClick,
}: {
  sessions: ProjectHistorySession[]
  onExpand: () => void
  expanded: boolean
  onClick: (id: string) => void
}): React.ReactElement {
  const failed = sessions.filter(s => s.status === 'failed').length
  const done = sessions.filter(s => s.status === 'done').length

  return (
    <div style={{ padding: '4px 8px 4px 25px' }}>
      <div
        onClick={onExpand}
        style={{
          fontSize: 11,
          color: 'var(--text-very-muted)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 0',
        }}
        onMouseEnter={(e) => { ;(e.currentTarget as HTMLDivElement).style.color = 'var(--text-muted)' }}
        onMouseLeave={(e) => { ;(e.currentTarget as HTMLDivElement).style.color = 'var(--text-very-muted)' }}
      >
        <span style={{ fontSize: 9 }}>{expanded ? '\u25be' : '\u25b8'}</span>
        <span>
          {sessions.length} automated run{sessions.length !== 1 ? 's' : ''}
          {done > 0 && <span style={{ color: 'var(--green)' }}> &middot; {done} completed</span>}
          {failed > 0 && <span style={{ color: 'var(--red)' }}> &middot; {failed} failed</span>}
        </span>
      </div>
      {expanded && (
        <div style={{ borderLeft: '1px solid var(--border)', marginLeft: 4, paddingLeft: 10, marginTop: 4 }}>
          {sessions.map(s => (
            <div
              key={s.id}
              onClick={() => onClick(s.id)}
              style={{
                fontSize: 11,
                color: 'var(--text-very-muted)',
                padding: '3px 0',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: statusDot(s.status), flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {s.title || '(no title)'}
              </span>
              <span style={{ flexShrink: 0 }}>{formatRelativeTime(s.startedAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Agent usage card — project-level insight */
function AgentUsageCard({
  agentUsage,
  totalAgentSessions,
}: {
  agentUsage: { agent: string; count: number }[]
  totalAgentSessions: number
}): React.ReactElement | null {
  if (agentUsage.length === 0) return null

  // Show top 6 agents, collapse the rest
  const top = agentUsage.slice(0, 6)
  const rest = agentUsage.slice(6)
  const restTotal = rest.reduce((sum, a) => sum + a.count, 0)

  return (
    <div
      style={{
        background: 'var(--bg-modal)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '12px 14px',
        marginBottom: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <SectionLabel>Agent Usage</SectionLabel>
        <span style={{ fontSize: 11, color: 'var(--text-very-muted)' }}>
          {totalAgentSessions.toLocaleString()} total delegations
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {top.map(({ agent, count }) => (
          <span
            key={agent}
            style={{
              fontSize: 11,
              padding: '3px 8px',
              borderRadius: 10,
              background: agent === 'self' ? 'rgba(76,175,116,0.08)' : 'rgba(160,152,136,0.1)',
              color: agent === 'self' ? 'var(--green)' : 'var(--text-muted)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span>{prettyAgentName(agent)}</span>
            <span style={{ fontWeight: 600, fontSize: 10, opacity: 0.7 }}>{count}</span>
          </span>
        ))}
        {restTotal > 0 && (
          <span
            style={{
              fontSize: 11,
              padding: '3px 8px',
              borderRadius: 10,
              background: 'rgba(160,152,136,0.06)',
              color: 'var(--text-very-muted)',
            }}
          >
            +{rest.length} more ({restTotal})
          </span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

function ProjectHistoryTab({ projectSlug }: ProjectHistoryTabProps): React.ReactElement {
  const [sessions, setSessions] = useState<ProjectHistorySession[]>([])
  const [context, setContext] = useState<ProjectContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [expandedAuto, setExpandedAuto] = useState<Set<string>>(new Set())
  const [showAutoFilter, setShowAutoFilter] = useState(false)

  const selectSession = useCanvasStore((s) => s.selectSession)
  const setViewMode = useCanvasStore((s) => s.setViewMode)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    Promise.all([
      window.electronAPI.getProjectHistory(projectSlug),
      window.electronAPI.getProjectContext(projectSlug),
    ])
      .then(([historyData, contextData]: [ProjectHistorySession[], ProjectContext | null]) => {
        if (!cancelled) {
          setSessions(historyData)
          setContext(contextData)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [projectSlug])

  const commits = context?.recentCommits ?? []

  // Split sessions into interactive vs automated
  const interactive = useMemo(() =>
    sessions.filter(s => isInteractive(s.classification)), [sessions])
  const automated = useMemo(() =>
    sessions.filter(s => !isInteractive(s.classification)), [sessions])

  // Resumable sessions
  const resumable = useMemo(() =>
    interactive.filter(s => ACTIVE_STATUSES.has(s.status) && s.promptCount > 0), [interactive])

  // Filter by search query
  const filteredInteractive = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return interactive
    return interactive.filter(s => (s.title ?? '').toLowerCase().includes(q))
  }, [interactive, query])

  const filteredAutomated = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return automated
    return automated.filter(s => (s.title ?? '').toLowerCase().includes(q))
  }, [automated, query])

  // Compute one-liners
  const sessionOneLiners = useMemo(() => {
    const map = new Map<string, string | null>()
    for (const s of interactive) {
      const overlapping = correlateCommitsToSession(
        { startedAt: s.startedAt, endedAt: s.endedAt, status: s.status },
        commits as CommitInfo[],
      )
      map.set(s.id, generateSessionOneLiner(s, overlapping))
    }
    return map
  }, [interactive, commits])

  // Build timeline: interleave sessions and commits, grouped by date
  const grouped = useMemo(() => {
    type TimelineItem =
      | { type: 'session'; data: ProjectHistorySession }
      | { type: 'commit'; data: { hash: string; message: string; date: string; author: string } }
      | { type: 'auto-summary'; data: ProjectHistorySession[] }

    // Merge session items with commits
    const items: (Exclude<TimelineItem, { type: 'auto-summary' }>)[] = []
    for (const s of (showAutoFilter ? filteredAutomated : filteredInteractive)) {
      items.push({ type: 'session', data: s })
    }
    if (!showAutoFilter) {
      const q = query.trim().toLowerCase()
      for (const c of commits) {
        if (q && !c.message.toLowerCase().includes(q)) continue
        items.push({ type: 'commit', data: c })
      }
    }
    items.sort((a, b) => {
      const dateA = a.type === 'session' ? a.data.startedAt : a.data.date
      const dateB = b.type === 'session' ? b.data.startedAt : b.data.date
      return new Date(dateB).getTime() - new Date(dateA).getTime()
    })

    // Group by date
    const dateMap = new Map<DateGroup, TimelineItem[]>()
    for (const item of items) {
      const dateStr = item.type === 'session' ? item.data.startedAt : item.data.date
      const g = classifyDate(dateStr)
      if (!dateMap.has(g)) dateMap.set(g, [])
      dateMap.get(g)!.push(item)
    }

    // Add automated summaries into each date group (when showing interactive view)
    if (!showAutoFilter) {
      const autoByDate = new Map<DateGroup, ProjectHistorySession[]>()
      for (const s of filteredAutomated) {
        const g = classifyDate(s.startedAt)
        if (!autoByDate.has(g)) autoByDate.set(g, [])
        autoByDate.get(g)!.push(s)
      }
      for (const [g, autoSessions] of autoByDate) {
        if (!dateMap.has(g)) dateMap.set(g, [])
        dateMap.get(g)!.push({ type: 'auto-summary', data: autoSessions })
      }
    }

    return GROUP_ORDER
      .filter(g => dateMap.has(g))
      .map(g => ({ label: g, items: dateMap.get(g)! }))
  }, [filteredInteractive, filteredAutomated, commits, query, showAutoFilter])

  function handleClick(id: string): void {
    selectSession(id)
    setViewMode('session')
  }

  const toggleAutoExpand = useCallback((key: string) => {
    setExpandedAuto(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  // --- Render ---

  if (loading) {
    return (
      <div data-testid="project-history-tab">
        <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>
          Loading history...
        </div>
      </div>
    )
  }

  const displayCount = showAutoFilter ? filteredAutomated.length : filteredInteractive.length

  return (
    <div data-testid="project-history-tab">
      {/* 0. Resumable sessions — pinned */}
      {resumable.length > 0 && !showAutoFilter && (
        <div
          style={{
            marginBottom: 16,
            background: 'rgba(245,158,11,0.06)',
            border: '1px solid rgba(245,158,11,0.2)',
            borderRadius: 8,
            padding: '10px 14px',
          }}
        >
          <SectionLabel>Waiting for you</SectionLabel>
          {resumable.map(s => (
            <div
              key={s.id}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(245,158,11,0.12)' }}
            >
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--amber)', flexShrink: 0, boxShadow: '0 0 4px rgba(245,158,11,0.4)' }} />
              <span style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {s.title ?? '(no title)'}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                {s.promptCount} prompts &middot; {formatRelativeTime(s.startedAt)}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); handleClick(s.id) }}
                style={{
                  fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6,
                  border: '1px solid var(--amber)', background: 'rgba(245,158,11,0.1)',
                  color: 'var(--amber)', cursor: 'pointer', flexShrink: 0, fontFamily: 'var(--font-ui)',
                }}
              >
                Resume
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 1. Agent usage card */}
      {context && !showAutoFilter && (
        <AgentUsageCard
          agentUsage={context.agentUsage}
          totalAgentSessions={context.totalAgentSessions}
        />
      )}

      {/* 2. Search + filter toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sessions..."
          style={{
            flex: 1, boxSizing: 'border-box', fontSize: 13, padding: '7px 12px',
            background: 'var(--bg-modal)', border: '1px solid var(--border)', borderRadius: 6,
            color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', outline: 'none',
          }}
        />
        <button
          onClick={() => setShowAutoFilter(false)}
          style={{
            fontSize: 11, padding: '5px 12px', borderRadius: 12, cursor: 'pointer',
            fontFamily: 'var(--font-ui)', fontWeight: !showAutoFilter ? 600 : 400,
            background: !showAutoFilter ? 'var(--text-primary)' : 'transparent',
            color: !showAutoFilter ? '#fff' : 'var(--text-muted)',
            border: !showAutoFilter ? '1px solid transparent' : '1px solid var(--border)',
          }}
        >
          My Sessions ({interactive.length})
        </button>
        <button
          onClick={() => setShowAutoFilter(true)}
          style={{
            fontSize: 11, padding: '5px 12px', borderRadius: 12, cursor: 'pointer',
            fontFamily: 'var(--font-ui)', fontWeight: showAutoFilter ? 600 : 400,
            background: showAutoFilter ? 'var(--text-primary)' : 'transparent',
            color: showAutoFilter ? '#fff' : 'var(--text-muted)',
            border: showAutoFilter ? '1px solid transparent' : '1px solid var(--border)',
          }}
        >
          Automated ({automated.length})
        </button>
      </div>

      {/* 3. Count line */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        <span style={{ fontWeight: 600 }}>{displayCount}</span>{' '}
        {showAutoFilter ? 'automated run' : 'session'}{displayCount !== 1 ? 's' : ''}
      </div>

      {/* 4. Empty state */}
      {displayCount === 0 && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>
          {query.trim() ? 'No matching sessions.' : showAutoFilter ? 'No automated sessions.' : 'No sessions yet.'}
        </div>
      )}

      {/* 5. Timeline grouped by date */}
      {grouped.map((group, groupIdx) => (
        <div key={group.label}>
          <div
            style={{
              fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em',
              color: 'var(--text-muted)', marginTop: groupIdx === 0 ? 0 : 16, marginBottom: 6,
            }}
          >
            {group.label}
          </div>

          {group.items.map((item, idx) => {
            if (item.type === 'commit') {
              return <CommitRow key={`c-${item.data.hash}-${idx}`} commit={item.data} />
            }
            if (item.type === 'auto-summary') {
              const autoKey = `auto-${group.label}`
              return (
                <AutomatedSummary
                  key={autoKey}
                  sessions={item.data}
                  expanded={expandedAuto.has(autoKey)}
                  onExpand={() => toggleAutoExpand(autoKey)}
                  onClick={handleClick}
                />
              )
            }
            // Session row
            return (
              <SessionRow
                key={item.data.id}
                session={item.data}
                oneLiner={sessionOneLiners.get(item.data.id) ?? null}
                onClick={() => handleClick(item.data.id)}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}

export default ProjectHistoryTab
