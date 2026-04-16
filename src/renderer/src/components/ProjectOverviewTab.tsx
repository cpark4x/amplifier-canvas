import { useEffect, useState } from 'react'
import type { ProjectOverview, ProjectContext } from '../../../shared/types'
import { useCanvasStore } from '../store'

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

function formatSlugAsName(slug: string): string {
  return slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
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

/* ---------- Section: Repository Info ---------- */

function RepositoryInfoSection({
  overview,
}: {
  overview: ProjectOverview
}): React.ReactElement | null {
  const hasRepo = overview.repoUrl
  const hasDescription = overview.description

  if (!hasRepo && !hasDescription) return null

  // Extract short repo name from URL: "github.com/cpark4x/amplifier-canvas" → "cpark4x/amplifier-canvas"
  let repoLabel: string | null = null
  if (overview.repoUrl) {
    const match = overview.repoUrl.match(/github\.com\/(.+)/)
    repoLabel = match ? match[1] : overview.repoUrl
  }

  return (
    <div>
      <SectionHeader>About</SectionHeader>
      <div
        style={{
          background: 'var(--bg-modal)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {/* Description from README */}
        {hasDescription && (
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
        )}

        {/* Repo metadata row */}
        {hasRepo && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              fontSize: 12,
              color: 'var(--text-muted)',
            }}
          >
            {/* GitHub link */}
            {repoLabel && (
              <span
                style={{ cursor: 'pointer', color: 'var(--text-link, var(--amber))' }}
                title={overview.repoUrl}
                onClick={() => {
                  if (overview.repoUrl && window.electronAPI?.openExternal) {
                    window.electronAPI.openExternal(overview.repoUrl)
                  }
                }}
              >
                {repoLabel}
              </span>
            )}

            {/* Visibility badge */}
            {overview.repoVisibility && overview.repoVisibility !== 'unknown' && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.04em',
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: overview.repoVisibility === 'public'
                    ? 'rgba(34, 197, 94, 0.12)'
                    : 'rgba(245, 158, 11, 0.12)',
                  color: overview.repoVisibility === 'public'
                    ? 'var(--green)'
                    : 'var(--amber)',
                }}
              >
                {overview.repoVisibility}
              </span>
            )}

            {/* Contributor count */}
            {overview.repoContributorCount != null && overview.repoContributorCount > 0 && (
              <span style={{ color: 'var(--text-muted)' }}>
                {overview.repoContributorCount === 1
                  ? 'Solo'
                  : `${overview.repoContributorCount} contributors`}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ---------- Section: Since You Were Last Here ---------- */

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
            <span style={{ color: 'var(--green)' }}>{'\u2022'}</span>{' '}
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
                {'\u2014'} {commit.message}
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
            <span style={{ color: 'var(--amber)' }}>{'\u2022'}</span>{' '}
            {stalledSessions.length} session{stalledSessions.length !== 1 ? 's' : ''} waiting for your input
          </div>
          <div style={{ paddingLeft: 14, display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
            {stalledSessions.map((session) => (
              <div
                key={session.id}
                style={{
                  fontSize: 12,
                  color: 'var(--amber)',
                  lineHeight: 1.5,
                  cursor: 'pointer',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                onClick={() => onSessionClick(session.id)}
              >
                {session.title || 'Untitled session'} {'\u2192'}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------- Section: Session Health ---------- */

function SessionHealthSection({
  healthRatio,
  sessionCount,
  lastActivityAt,
  meaningfulSuccessRate,
}: {
  healthRatio?: ProjectOverview['healthRatio']
  sessionCount: number
  lastActivityAt: string
  meaningfulSuccessRate?: number
}): React.ReactElement {
  const done = healthRatio?.done ?? 0
  const failed = healthRatio?.failed ?? 0
  const active = healthRatio?.active ?? 0
  const total = healthRatio?.total ?? sessionCount

  // Success rate bar
  const donePercent = total > 0 ? (done / total) * 100 : 0
  const failedPercent = total > 0 ? (failed / total) * 100 : 0
  const activePercent = total > 0 ? (active / total) * 100 : 0

  return (
    <div>
      <SectionHeader>Session Health</SectionHeader>
      <div
        style={{
          background: 'var(--bg-modal)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {/* Visual bar */}
        {total > 0 && (
          <div
            style={{
              display: 'flex',
              height: 6,
              borderRadius: 3,
              overflow: 'hidden',
              background: 'rgba(255,255,255,0.05)',
            }}
          >
            {donePercent > 0 && (
              <div style={{ width: `${donePercent}%`, background: 'var(--green)' }} />
            )}
            {activePercent > 0 && (
              <div style={{ width: `${activePercent}%`, background: 'var(--amber)' }} />
            )}
            {failedPercent > 0 && (
              <div style={{ width: `${failedPercent}%`, background: 'var(--red)' }} />
            )}
          </div>
        )}

        {/* Counts row */}
        <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-muted)' }}>
          {done > 0 && (
            <span>
              <span style={{ color: 'var(--green)' }}>{'\u2713'}</span> {done} completed
            </span>
          )}
          {active > 0 && (
            <span>
              <span style={{ color: 'var(--amber)', fontSize: 10 }}>{'\u25cf'}</span> {active} active
            </span>
          )}
          {failed > 0 && (
            <span>
              <span style={{ color: 'var(--red)', fontSize: 10 }}>{'\u25cf'}</span> {failed} failed
            </span>
          )}
          {total === 0 && <span>No sessions yet</span>}
        </div>

        {/* Summary line */}
        <div style={{ fontSize: 12, color: 'var(--text-very-muted)' }}>
          {total} total sessions
          {meaningfulSuccessRate != null && meaningfulSuccessRate > 0 && (
            <> {'\u00b7'} {meaningfulSuccessRate}% success rate (excluding automated)</>
          )}
          {' '}{'\u00b7'} last active {formatRelativeTime(lastActivityAt)}
        </div>
      </div>
    </div>
  )
}

/* ---------- Section: Recent Commits ---------- */

function RecentCommitsSection({
  recentCommits,
}: {
  recentCommits: ProjectContext['recentCommits']
}): React.ReactElement | null {
  if (recentCommits.length === 0) return null

  const commits = recentCommits.slice(0, 8)
  return (
    <div>
      <SectionHeader>Recent Commits</SectionHeader>
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

/* ---------- Section: Recent Sessions ---------- */

function RecentSessionsSection({
  recentSessions,
  onSessionClick,
}: {
  recentSessions: ProjectOverview['recentSessions']
  onSessionClick: (id: string) => void
}): React.ReactElement | null {
  if (!recentSessions || recentSessions.length === 0) return null

  const sessions = recentSessions.slice(0, 5)
  return (
    <div>
      <SectionHeader>Recent Sessions</SectionHeader>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {sessions.map((session, i) => {
          const isResumable = ['active', 'running', 'needs_input'].includes(session.status)
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 0',
                cursor: isResumable ? 'pointer' : 'default',
                borderBottom:
                  i < sessions.length - 1 ? '1px solid var(--border)' : 'none',
              }}
              onClick={isResumable ? () => onSessionClick(session.title) : undefined}
            >
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
                {session.promptCount > 0 && (
                  <>{session.promptCount} prompt{session.promptCount !== 1 ? 's' : ''} {'\u00b7'} </>
                )}
                {formatRelativeTime(session.startedAt)}
              </span>
              {isResumable && (
                <span
                  style={{
                    fontSize: 12,
                    color: 'var(--amber)',
                    fontWeight: 600,
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  Resume {'\u2192'}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ---------- Section: Stalled Work ---------- */

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
              <span style={{ opacity: 0.5 }}> {'\u00b7'} </span>
              {session.promptCount} prompt{session.promptCount !== 1 ? 's' : ''}
            </span>
            <span
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

/* ---------- Section: Smart Suggestion Card ---------- */

function SmartSuggestionCard({
  stalledSessions,
  onSessionClick,
}: {
  stalledSessions: ProjectContext['stalledSessions']
  onSessionClick: (id: string) => void
}): React.ReactElement | null {
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
        Pick up where you left off
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

/* ---------- Section: Welcome Card ---------- */

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
        Welcome to {projectName}
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
        Loading{'\u2026'}
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

  return (
    <div data-testid="project-overview-tab" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* 1. Since you were last here (contextual alert) */}
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

      {/* 1b. Smart suggestion */}
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

      {/* 2. About — description + repo metadata (feedback #1 and #6) */}
      <RepositoryInfoSection overview={overview} />

      {/* 3. Session Health — clear framing for the numbers (feedback #2 and #3) */}
      <SessionHealthSection
        healthRatio={overview.healthRatio}
        sessionCount={overview.sessionCount}
        lastActivityAt={overview.lastActivityAt}
        meaningfulSuccessRate={overview.meaningfulSuccessRate}
      />

      {/* 4. Recent Commits (feedback #5 — this IS the accomplishments) */}
      <RecentCommitsSection
        recentCommits={context?.recentCommits ?? []}
      />

      {/* 5. Recent Sessions — clear labels + resume action (feedback #4) */}
      <RecentSessionsSection
        recentSessions={overview.recentSessions}
        onSessionClick={handleSessionClick}
      />

      {/* 6. Stalled Work */}
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
