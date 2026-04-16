import { useEffect, useState } from 'react'
import type { ProjectOverview, ProjectContext } from '../../../shared/types'
import { useCanvasStore } from '../store'
import { generateSessionOneLiner } from '../utils/session-summary'

interface ProjectOverviewTabProps {
  projectSlug: string
}

/* ---------- Helpers ---------- */

function formatRelativeTime(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diffMs = now - then
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

function formatRelativeTimeLong(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diffMs = now - then
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`
  const months = Math.floor(days / 30)
  return `${months} month${months !== 1 ? 's' : ''} ago`
}

function statusDotColor(status: string): string {
  switch (status) {
    case 'done':
      return 'var(--green)'
    case 'failed':
      return 'var(--red)'
    case 'active':
    case 'running':
    case 'needs_input':
      return 'var(--amber)'
    default:
      return 'var(--text-very-muted)'
  }
}

function truncateHash(hash: string): string {
  return hash.slice(0, 7)
}

/* ---------- Sub-components ---------- */

function SectionHeader({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.08em',
        color: 'var(--text-muted)',
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  )
}

/* ---------- Section 1: Since You Were Last Here ---------- */

function SinceLastVisitCard({
  lastVisitedAt,
  commitsSinceLastVisit,
  stalledSessions,
  onSessionClick,
}: {
  lastVisitedAt: string
  commitsSinceLastVisit: ProjectContext['commitsSinceLastVisit']
  stalledSessions: ProjectContext['stalledSessions']
  onSessionClick: (id: string) => void
}): React.ReactElement | null {
  const hasCommits = commitsSinceLastVisit.length > 0
  const hasStalled = stalledSessions.length > 0

  if (!hasCommits && !hasStalled) return null

  const maxCommitsShown = 3
  const visibleCommits = commitsSinceLastVisit.slice(0, maxCommitsShown)
  const remainingCommits = commitsSinceLastVisit.length - maxCommitsShown
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      style={{
        background: 'rgba(245, 158, 11, 0.06)',
        border: '1px solid rgba(245, 158, 11, 0.2)',
        borderRadius: 8,
        padding: 16,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: 12,
        }}
      >
        Since you were last here{' '}
        <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>
          ({formatRelativeTimeLong(lastVisitedAt)})
        </span>
      </div>

      {hasCommits && (
        <div style={{ marginBottom: hasStalled ? 10 : 0 }}>
          <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 6 }}>
            <span style={{ color: 'var(--green)' }}>•</span>{' '}
            {commitsSinceLastVisit.length} commit{commitsSinceLastVisit.length !== 1 ? 's' : ''} shipped
          </div>
          <div style={{ paddingLeft: 14, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {(expanded ? commitsSinceLastVisit : visibleCommits).map((commit) => (
              <div
                key={commit.hash}
                style={{
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  lineHeight: 1.5,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ fontFamily: 'var(--font-mono, monospace)', opacity: 0.7 }}>
                  {truncateHash(commit.hash)}
                </span>{' '}
                — {commit.message}
              </div>
            ))}
            {remainingCommits > 0 && !expanded && (
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--amber)',
                  cursor: 'pointer',
                  marginTop: 2,
                }}
                onClick={() => setExpanded(true)}
              >
                + {remainingCommits} more
              </div>
            )}
          </div>
        </div>
      )}

      {hasStalled && (
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
            <span style={{ color: 'var(--amber)' }}>•</span>{' '}
            {stalledSessions.length} session{stalledSessions.length !== 1 ? 's' : ''} waiting for your input
          </div>
          <div style={{ paddingLeft: 14, display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
            {stalledSessions.map((session) => (
              <div
                key={session.id}
                style={{
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  lineHeight: 1.5,
                  cursor: 'pointer',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                onClick={() => onSessionClick(session.id)}
              >
                &ldquo;{session.title || 'Untitled session'}&rdquo;
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------- Section 3: Project Health (simple text) ---------- */

function ProjectHealthLine({
  healthRatio,
  lastActivityAt,
}: {
  healthRatio?: ProjectOverview['healthRatio']
  lastActivityAt: string
}): React.ReactElement {
  const parts: React.ReactNode[] = []

  if (healthRatio && healthRatio.total > 0) {
    const { done, active, failed } = healthRatio
    if (done > 0) {
      parts.push(
        <span key="done">
          <span style={{ color: 'var(--green)', fontSize: 11 }}>✓</span>{' '}
          {done} completed
        </span>,
      )
    }
    if (active > 0) {
      parts.push(
        <span key="active">
          <span style={{ color: 'var(--amber)', fontSize: 10 }}>●</span>{' '}
          {active} active
        </span>,
      )
    }
    if (failed > 0) {
      parts.push(
        <span key="failed">
          <span style={{ color: 'var(--red)', fontSize: 10 }}>●</span>{' '}
          {failed} failed
        </span>,
      )
    }
  }

  return (
    <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
      {parts.length > 0 ? (
        <>
          {parts.map((part, i) => (
            <span key={i}>
              {i > 0 && <span style={{ opacity: 0.4 }}> · </span>}
              {part}
            </span>
          ))}
          <span style={{ opacity: 0.4 }}> — </span>
        </>
      ) : null}
      last worked on {formatRelativeTime(lastActivityAt)}
    </div>
  )
}

/* ---------- Section 5: Recent Work (commits, fallback to sessions) ---------- */

function RecentWorkSection({
  recentCommits,
  recentSessions,
}: {
  recentCommits: ProjectContext['recentCommits']
  recentSessions?: ProjectOverview['recentSessions']
}): React.ReactElement | null {
  const hasCommits = recentCommits.length > 0
  const hasRecentSessions = recentSessions && recentSessions.length > 0

  if (!hasCommits && !hasRecentSessions) return null

  if (hasCommits) {
    const commits = recentCommits.slice(0, 8)
    return (
      <div>
        <SectionHeader>Recent Work</SectionHeader>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {commits.map((commit, i) => (
            <div
              key={commit.hash}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '7px 0',
                borderBottom:
                  i < commits.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: 12,
                  color: 'var(--text-very-muted)',
                  flexShrink: 0,
                }}
              >
                {truncateHash(commit.hash)}
              </span>
              <span
                style={{
                  fontSize: 13,
                  color: 'var(--text-primary)',
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {commit.message}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                {formatRelativeTime(commit.date)}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Fallback: show recent sessions if no commits — with one-liners
  const sessions = recentSessions!.slice(0, 5)
  return (
    <div>
      <SectionHeader>Recent Activity</SectionHeader>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {sessions.map((session, i) => {
          const oneLiner = generateSessionOneLiner(
            {
              title: session.title,
              firstPrompt: null,
              status: session.status,
              startedAt: session.startedAt,
              endedAt: null,
              promptCount: session.promptCount,
              toolCallCount: 0,
            },
            [],
          )
          return (
            <div
              key={i}
              style={{
                padding: '8px 0',
                cursor: 'default',
                borderBottom:
                  i < sessions.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: statusDotColor(session.status),
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: 13,
                    color: 'var(--text-primary)',
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {session.title || 'Untitled session'}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatRelativeTime(session.startedAt)}
                </span>
              </div>
              {oneLiner && (
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--text-very-muted)',
                    fontStyle: 'italic',
                    paddingLeft: 16,
                    marginTop: 2,
                  }}
                >
                  {oneLiner}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ---------- Section 7: Stalled Work ---------- */

function StalledWorkSection({
  stalledSessions,
  onSessionClick,
}: {
  stalledSessions: ProjectContext['stalledSessions']
  onSessionClick: (id: string) => void
}): React.ReactElement | null {
  if (stalledSessions.length === 0) return null

  return (
    <div>
      <SectionHeader>Needs Attention</SectionHeader>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {stalledSessions.map((session, i) => (
          <div
            key={session.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 0',
              cursor: 'pointer',
              borderBottom:
                i < stalledSessions.length - 1 ? '1px solid var(--border)' : 'none',
            }}
            onClick={() => onSessionClick(session.id)}
          >
            <span style={{ fontSize: 13, flexShrink: 0, color: 'var(--amber)' }}>{'\u26a0'}</span>
            <span
              style={{
                fontSize: 13,
                color: 'var(--text-primary)',
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              &ldquo;{session.title || 'Untitled session'}&rdquo;
            </span>
            <span
              style={{
                fontSize: 12,
                color: 'var(--text-muted)',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              {formatRelativeTime(session.startedAt)}
              <span style={{ opacity: 0.5 }}> {'\u00b7'} </span>
              {session.promptCount} prompt{session.promptCount !== 1 ? 's' : ''}
            </span>
            <span
              onClick={(e) => {
                e.stopPropagation()
                onSessionClick(session.id)
              }}
              style={{
                fontSize: 12,
                color: 'var(--amber)',
                fontWeight: 600,
                cursor: 'pointer',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              Resume {'\u2192'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- Section 8: Smart Suggestion Card ---------- */

function SmartSuggestionCard({
  stalledSessions,
  onSessionClick,
}: {
  stalledSessions: ProjectContext['stalledSessions']
  onSessionClick: (id: string) => void
}): React.ReactElement | null {
  // Only show if exactly 1 stalled session with > 5 prompts
  if (stalledSessions.length !== 1) return null
  const session = stalledSessions[0]
  if (session.promptCount <= 5) return null

  return (
    <div
      style={{
        background: 'rgba(34, 197, 94, 0.06)',
        border: '1px solid rgba(34, 197, 94, 0.2)',
        borderRadius: 8,
        padding: 16,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: 8,
        }}
      >
        {'\ud83d\udca1'} Suggested: Pick up where you left off
      </div>
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.6,
          color: 'var(--text-muted)',
          marginBottom: 10,
        }}
      >
        &ldquo;{session.title || 'Untitled session'}&rdquo; has been waiting for{' '}
        {formatRelativeTimeLong(session.startedAt).replace(' ago', '')}. You were{' '}
        {session.promptCount} prompts deep.
      </div>
      <span
        onClick={() => onSessionClick(session.id)}
        style={{
          fontSize: 13,
          color: 'rgb(34, 197, 94)',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Resume this session {'\u2192'}
      </span>
    </div>
  )
}

/* ---------- Section 9: Welcome Card ---------- */

function WelcomeCard({
  overview,
  commitCount,
}: {
  overview: ProjectOverview
  commitCount: number
}): React.ReactElement {
  const projectName = overview.name || formatSlugAsName(overview.slug)

  return (
    <div
      style={{
        background: 'var(--bg-modal)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 16,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: 8,
        }}
      >
        {'\ud83d\udc4b'} Welcome to {projectName}
      </div>
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.6,
          color: 'var(--text-muted)',
        }}
      >
        This project has {overview.sessionCount} session{overview.sessionCount !== 1 ? 's' : ''}
        {commitCount > 0 && (
          <> and {commitCount} commit{commitCount !== 1 ? 's' : ''}</>
        )}.
        Check the History tab to see what&apos;s been happening, or start a new session.
      </div>
    </div>
  )
}

function formatSlugAsName(slug: string): string {
  return slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/* ---------- Main Component ---------- */

function ProjectOverviewTab({ projectSlug }: ProjectOverviewTabProps): React.ReactElement {
  const [overview, setOverview] = useState<ProjectOverview | null>(null)
  const [context, setContext] = useState<ProjectContext | null>(null)
  const [loading, setLoading] = useState(true)
  const selectSession = useCanvasStore((s) => s.selectSession)

  useEffect(() => {
    setLoading(true)
    if (window.electronAPI) {
      Promise.all([
        window.electronAPI.getProjectOverview(projectSlug),
        window.electronAPI.getProjectContext(projectSlug),
      ]).then(([overviewData, contextData]) => {
        setOverview(overviewData)
        setContext(contextData)
        setLoading(false)
      })
    }
  }, [projectSlug])

  const handleSessionClick = (id: string) => {
    selectSession(id)
  }

  if (loading) {
    return (
      <div
        style={{
          color: 'var(--text-muted)',
          fontSize: 13,
          padding: '24px 0',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        Loading…
      </div>
    )
  }

  if (!overview) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '24px 0' }}>
        No overview available for this project.
      </div>
    )
  }

  const hasOutcomes = overview.outcomes && overview.outcomes.length > 0

  return (
    <div data-testid="project-overview-tab" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 1. Since you were last here */}
      {context &&
        context.lastVisitedAt &&
        (context.commitsSinceLastVisit.length > 0 || context.stalledSessions.length > 0) && (
          <SinceLastVisitCard
            lastVisitedAt={context.lastVisitedAt}
            commitsSinceLastVisit={context.commitsSinceLastVisit}
            stalledSessions={context.stalledSessions}
            onSessionClick={handleSessionClick}
          />
        )}

      {/* 1b. Smart suggestion — "pick up where you left off" */}
      {context &&
        context.lastVisitedAt &&
        context.stalledSessions.length > 0 && (
          <SmartSuggestionCard
            stalledSessions={context.stalledSessions}
            onSessionClick={handleSessionClick}
          />
        )}

      {/* 1c. Welcome card for first-time visitors */}
      {context && !context.lastVisitedAt && (
        <WelcomeCard
          overview={overview}
          commitCount={context.recentCommits.length}
        />
      )}

      {/* 2. Project Description */}
      {overview.description && (
        <div
          style={{
            background: 'var(--bg-modal)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 16,
          }}
        >
          <div
            style={{
              fontSize: 13,
              lineHeight: 1.6,
              color: 'var(--text-primary)',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical' as const,
              overflow: 'hidden',
            }}
          >
            {overview.description}
          </div>
        </div>
      )}

      {/* 3. Project Health (simple text line) */}
      <ProjectHealthLine
        healthRatio={overview.healthRatio}
        lastActivityAt={overview.lastActivityAt}
      />

      {/* 4. Assessment card */}
      {overview.assessment && (
        <div
          style={{
            background: 'var(--bg-modal)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 16,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              marginBottom: 8,
            }}
          >
            <span style={{ color: 'var(--amber)', fontSize: 11, lineHeight: 1 }}>★</span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.06em',
                color: 'var(--text-muted)',
              }}
            >
              Project Health
            </span>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-primary)' }}>
            {overview.assessment}
          </div>
        </div>
      )}

      {/* 5. Recent Work (commits preferred, sessions as fallback) */}
      <RecentWorkSection
        recentCommits={context?.recentCommits ?? []}
        recentSessions={overview.recentSessions}
      />

      {/* 6. What's been accomplished */}
      {hasOutcomes && (
        <div>
          <SectionHeader>What&apos;s been accomplished</SectionHeader>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {overview.outcomes!.map((outcome, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 10,
                  padding: '7px 0',
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--amber)',
                    flexShrink: 0,
                    position: 'relative',
                    top: -1,
                  }}
                />
                <span style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-primary)' }}>
                  {outcome}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 7. Stalled Work */}
      {context && (
        <StalledWorkSection
          stalledSessions={context.stalledSessions}
          onSessionClick={handleSessionClick}
        />
      )}
    </div>
  )
}

export default ProjectOverviewTab
