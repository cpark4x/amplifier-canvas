import { useEffect, useState } from 'react'
import type { ProjectOverview } from '../../../shared/types'

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

/* ---------- Sub-components ---------- */

function StatPill({ value, label }: { value: number; label: string }): React.ReactElement {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 5,
        fontSize: 13,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{value.toLocaleString()}</span>
      <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>{label}</span>
    </span>
  )
}

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

/* ---------- Health Bar ---------- */

function HealthBar({
  healthRatio,
  sessionCount,
  lastActivityAt,
}: {
  healthRatio: NonNullable<ProjectOverview['healthRatio']>
  sessionCount: number
  lastActivityAt: string
}): React.ReactElement {
  const { done, failed, active, total } = healthRatio
  const safeTotal = total || 1
  const donePct = (done / safeTotal) * 100
  const activePct = (active / safeTotal) * 100
  const failedPct = (failed / safeTotal) * 100
  const successRate = Math.round((done / safeTotal) * 100)

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      {/* Bar */}
      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: 'var(--border)',
          overflow: 'hidden',
          display: 'flex',
        }}
      >
        {donePct > 0 && (
          <div style={{ width: `${donePct}%`, background: 'var(--green)', transition: 'width 0.3s ease' }} />
        )}
        {activePct > 0 && (
          <div style={{ width: `${activePct}%`, background: 'var(--amber)', transition: 'width 0.3s ease' }} />
        )}
        {failedPct > 0 && (
          <div style={{ width: `${failedPct}%`, background: 'var(--red)', transition: 'width 0.3s ease' }} />
        )}
      </div>
      {/* Summary line */}
      <div
        style={{
          fontSize: 12,
          color: 'var(--text-muted)',
          marginTop: 6,
          lineHeight: 1,
        }}
      >
        {successRate}% success rate{' '}
        <span style={{ opacity: 0.5 }}>·</span> {sessionCount} session{sessionCount !== 1 ? 's' : ''}{' '}
        <span style={{ opacity: 0.5 }}>·</span> last active {formatRelativeTime(lastActivityAt)}
      </div>
    </div>
  )
}

/* ---------- Main Component ---------- */

function ProjectOverviewTab({ projectSlug }: ProjectOverviewTabProps): React.ReactElement {
  const [overview, setOverview] = useState<ProjectOverview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    if (window.electronAPI) {
      window.electronAPI.getProjectOverview(projectSlug).then((data) => {
        setOverview(data)
        setLoading(false)
      })
    }
  }, [projectSlug])

  if (loading) {
    return (
      <div
        style={{
          color: 'var(--text-muted)',
          fontSize: 13,
          padding: '24px 0',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 14,
            height: 14,
            border: '2px solid var(--border)',
            borderTopColor: 'var(--text-muted)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        Loading overview…
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

  const hasHealthRatio = overview.healthRatio && overview.healthRatio.total > 0
  const hasRecentSessions = overview.recentSessions && overview.recentSessions.length > 0
  const hasOutcomes = overview.outcomes && overview.outcomes.length > 0

  return (
    <div data-testid="project-overview-tab" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 1. Project Description */}
      {overview.description && (
        <div
          style={{
            background: 'var(--bg-modal)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '12px 16px',
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

      {/* 2. Health bar + quick stats row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 24,
        }}
      >
        {/* Left: health bar */}
        {hasHealthRatio ? (
          <HealthBar
            healthRatio={overview.healthRatio!}
            sessionCount={overview.sessionCount}
            lastActivityAt={overview.lastActivityAt}
          />
        ) : (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                height: 6,
                borderRadius: 3,
                background: 'var(--border)',
              }}
            />
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1 }}>
              {overview.sessionCount} session{overview.sessionCount !== 1 ? 's' : ''}{' '}
              <span style={{ opacity: 0.5 }}>·</span> last active {formatRelativeTime(overview.lastActivityAt)}
            </div>
          </div>
        )}

        {/* Right: stat pills */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            flexShrink: 0,
          }}
        >
          <StatPill value={overview.totalPrompts} label="prompts" />
          <StatPill value={overview.totalToolCalls} label="tool calls" />
          <StatPill value={overview.totalFilesChanged} label="files" />
        </div>
      </div>

      {/* 3. Assessment card */}
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
            <span style={{ color: 'var(--amber)', fontSize: 11, lineHeight: 1 }}>&#x2736;</span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.08em',
                color: 'var(--amber)',
              }}
            >
              Project Health
            </span>
          </div>
          <div
            style={{
              fontSize: 13,
              lineHeight: 1.6,
              color: 'var(--text-primary)',
            }}
          >
            {overview.assessment}
          </div>
        </div>
      )}

      {/* 4. Recent Sessions */}
      {hasRecentSessions && (
        <div>
          <SectionHeader>Recent Activity</SectionHeader>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {overview.recentSessions!.slice(0, 5).map((session, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 0',
                  borderBottom:
                    i < Math.min(overview.recentSessions!.length, 5) - 1
                      ? '1px solid var(--border)'
                      : 'none',
                }}
              >
                {/* Status dot */}
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
                {/* Title */}
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
                {/* Time ago */}
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
            ))}
          </div>
        </div>
      )}

      {/* 5. Outcomes */}
      {hasOutcomes && (
        <div>
          <SectionHeader>Key Outcomes</SectionHeader>
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
                <span
                  style={{
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: 'var(--text-primary)',
                  }}
                >
                  {outcome}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default ProjectOverviewTab
