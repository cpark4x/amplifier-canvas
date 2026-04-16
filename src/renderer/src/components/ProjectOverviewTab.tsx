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

const fmtNumber = new Intl.NumberFormat()
function formatNumber(n: number): string {
  return fmtNumber.format(n)
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

/* ---------- Health Bar ---------- */

function HealthBar({
  healthRatio,
  sessionCount,
  lastActivityAt,
  agentSessionCount,
  meaningfulSuccessRate,
}: {
  healthRatio: NonNullable<ProjectOverview['healthRatio']>
  sessionCount: number
  lastActivityAt: string
  agentSessionCount?: number
  meaningfulSuccessRate?: number
}): React.ReactElement {
  const { done, active, failed, total } = healthRatio
  const safeTotal = total || 1
  const donePct = (done / safeTotal) * 100
  const activePct = (active / safeTotal) * 100
  const failedPct = (failed / safeTotal) * 100

  return (
    <div>
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
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4 }}>
        {meaningfulSuccessRate != null ? (
          <>
            {Math.round(meaningfulSuccessRate)}% success
            <span style={{ opacity: 0.5 }}> · </span>
            {formatNumber(sessionCount)} session{sessionCount !== 1 ? 's' : ''}
            {agentSessionCount != null && agentSessionCount > 0 && (
              <>
                <span style={{ opacity: 0.5 }}> · </span>
                <span style={{ color: 'var(--text-very-muted)' }}>
                  {formatNumber(agentSessionCount)} agent session{agentSessionCount !== 1 ? 's' : ''} spawned
                </span>
              </>
            )}
            <span style={{ opacity: 0.5 }}> · </span>
            last active {formatRelativeTime(lastActivityAt)}
          </>
        ) : (
          <>
            {formatNumber(sessionCount)} session{sessionCount !== 1 ? 's' : ''}
            <span style={{ opacity: 0.5 }}> · </span>
            last active {formatRelativeTime(lastActivityAt)}
          </>
        )}
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

  const hasHealthRatio = overview.healthRatio && overview.healthRatio.total > 0
  const hasRecentSessions = overview.recentSessions && overview.recentSessions.length > 0
  const hasOutcomes = overview.outcomes && overview.outcomes.length > 0
  const hasDelegation = overview.delegationRatio != null && overview.delegationRatio > 0

  return (
    <div data-testid="project-overview-tab" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 1. Project Description */}
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

      {/* 2. Health bar + stat row */}
      {hasHealthRatio ? (
        <HealthBar
          healthRatio={overview.healthRatio!}
          sessionCount={overview.sessionCount}
          lastActivityAt={overview.lastActivityAt}
          agentSessionCount={overview.agentSessionCount}
          meaningfulSuccessRate={overview.meaningfulSuccessRate}
        />
      ) : (
        <div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--border)' }} />
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1 }}>
            {formatNumber(overview.sessionCount)} session{overview.sessionCount !== 1 ? 's' : ''}
            <span style={{ opacity: 0.5 }}> · </span>
            last active {formatRelativeTime(overview.lastActivityAt)}
          </div>
        </div>
      )}

      {/* 3. Delegation ratio badge */}
      {hasDelegation && (
        <div>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 10px',
              borderRadius: 12,
              background: 'rgba(245,158,11,0.1)',
              color: 'var(--amber)',
              fontSize: 11,
              fontWeight: 500,
            }}
          >
            ⚡ {overview.delegationRatio!.toFixed(1)}x delegation ratio
          </span>
          <div style={{ fontSize: 11, color: 'var(--text-very-muted)', marginTop: 2 }}>
            Each session spawned ~{Math.round(overview.delegationRatio!)} agent session
            {Math.round(overview.delegationRatio!) !== 1 ? 's' : ''}
          </div>
        </div>
      )}

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

      {/* 5. Recent Sessions */}
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
                  cursor: 'default',
                  borderBottom:
                    i < Math.min(overview.recentSessions!.length, 5) - 1
                      ? '1px solid var(--border)'
                      : 'none',
                }}
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
                  {formatRelativeTime(session.startedAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. Outcomes */}
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
                <span style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-primary)' }}>
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
