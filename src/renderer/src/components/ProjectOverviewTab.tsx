import { useEffect, useState } from 'react'
import type { ProjectOverview, ProjectContext } from '../../../shared/types'
import { useCanvasStore } from '../store'

interface ProjectOverviewTabProps {
  projectSlug: string
}

/* ---------- Helpers ---------- */

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
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

function formatDuration(startIso: string, endIso: string): string {
  const diffMs = new Date(endIso).getTime() - new Date(startIso).getTime()
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000))
  if (days < 1) return 'less than a day'
  if (days < 7) return `${days} day${days !== 1 ? 's' : ''}`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks} week${weeks !== 1 ? 's' : ''}`
  const months = Math.floor(days / 30)
  return `${months} month${months !== 1 ? 's' : ''}`
}

function trendLabel(trend: ProjectOverview['trend']): { text: string; color: string } {
  switch (trend) {
    case 'accelerating': return { text: 'Picking up', color: 'var(--green)' }
    case 'steady':       return { text: 'Steady', color: 'var(--text-muted)' }
    case 'slowing':      return { text: 'Slowing down', color: 'var(--amber)' }
    case 'dormant':      return { text: 'Dormant', color: 'var(--text-very-muted)' }
    case 'new':          return { text: 'Just started', color: 'var(--blue, #60a5fa)' }
  }
}

function lifecycleLabel(lifecycle: ProjectOverview['lifecycle']): { text: string; color: string } {
  switch (lifecycle) {
    case 'new':     return { text: 'New project', color: 'var(--blue, #60a5fa)' }
    case 'active':  return { text: 'Active', color: 'var(--green)' }
    case 'mature':  return { text: 'Mature', color: 'var(--text-muted)' }
    case 'dormant': return { text: 'Dormant', color: 'var(--text-very-muted)' }
  }
}

function formatSlugAsName(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/* ---------- Sub-components ---------- */

function SectionLabel({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{
      fontSize: 10,
      fontWeight: 600,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.08em',
      color: 'var(--text-very-muted)',
      marginBottom: 8,
    }}>
      {children}
    </div>
  )
}

function MetricCell({
  value, label, muted,
}: {
  value: string | number; label: string; muted?: boolean
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <span style={{
        fontSize: 20,
        fontWeight: 600,
        color: muted ? 'var(--text-very-muted)' : 'var(--text-primary)',
        lineHeight: 1.2,
      }}>
        {value}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-very-muted)' }}>{label}</span>
    </div>
  )
}

function Badge({ text, color }: { text: string; color: string }): React.ReactElement {
  return (
    <span style={{
      fontSize: 10,
      fontWeight: 600,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.04em',
      padding: '2px 7px',
      borderRadius: 4,
      background: `color-mix(in srgb, ${color} 12%, transparent)`,
      color,
    }}>
      {text}
    </span>
  )
}

/* ---------- Card: Project Identity ---------- */

function IdentityCard({ overview }: { overview: ProjectOverview }): React.ReactElement {
  const projectName = overview.name || formatSlugAsName(overview.slug)

  let repoLabel: string | null = null
  if (overview.repoUrl) {
    const match = overview.repoUrl.match(/github\.com\/(.+)/)
    repoLabel = match ? match[1] : overview.repoUrl
  }

  const lc = lifecycleLabel(overview.lifecycle)

  return (
    <div style={{
      background: 'var(--bg-modal)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      {/* Name + badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
          {projectName}
        </span>
        <Badge text={lc.text} color={lc.color} />
        {overview.repoVisibility && overview.repoVisibility !== 'unknown' && (
          <Badge
            text={overview.repoVisibility}
            color={overview.repoVisibility === 'public' ? 'var(--green)' : 'var(--amber)'}
          />
        )}
      </div>

      {/* Description */}
      {overview.description && (
        <div style={{
          fontSize: 13,
          lineHeight: 1.6,
          color: 'var(--text-muted)',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical' as const,
          overflow: 'hidden',
        }}>
          {overview.description}
        </div>
      )}

      {/* Repo row */}
      {repoLabel && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--text-muted)' }}>
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
          {overview.repoContributorCount != null && overview.repoContributorCount > 0 && (
            <span>
              {overview.repoContributorCount === 1 ? 'Solo project' : `${overview.repoContributorCount} contributors`}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/* ---------- Card: At a Glance ---------- */

function AtAGlanceCard({ overview }: { overview: ProjectOverview }): React.ReactElement {
  const age = overview.firstSessionAt
    ? formatDuration(overview.firstSessionAt, new Date().toISOString())
    : null

  const tr = trendLabel(overview.trend)

  return (
    <div>
      <SectionLabel>At a Glance</SectionLabel>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
        gap: 16,
        background: 'var(--bg-modal)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 16,
      }}>
        <MetricCell value={overview.sessionCount} label="sessions" />
        <MetricCell
          value={overview.totalPrompts.toLocaleString()}
          label="prompts"
        />
        <MetricCell value={overview.totalFilesChanged.toLocaleString()} label="files changed" />
        {age && <MetricCell value={age} label="project age" />}
      </div>
    </div>
  )
}

/* ---------- Card: Activity + Health ---------- */

function ActivityHealthCard({ overview }: { overview: ProjectOverview }): React.ReactElement {
  const tr = trendLabel(overview.trend)
  const done = overview.healthRatio?.done ?? 0
  const failed = overview.healthRatio?.failed ?? 0
  const total = overview.healthRatio?.total ?? overview.sessionCount

  const donePercent = total > 0 ? (done / total) * 100 : 0
  const failedPercent = total > 0 ? (failed / total) * 100 : 0

  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      {/* Activity column */}
      <div style={{ flex: 1, minWidth: 160 }}>
        <SectionLabel>Activity</SectionLabel>
        <div style={{
          background: 'var(--bg-modal)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>
              {overview.sessionsThisWeek} session{overview.sessionsThisWeek !== 1 ? 's' : ''} this week
            </span>
            <Badge text={tr.text} color={tr.color} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-very-muted)' }}>
            Last active {formatRelativeTime(overview.lastActivityAt)}
            {overview.sessionsLastWeek > 0 && (
              <> {'\u00b7'} {overview.sessionsLastWeek} last week</>
            )}
          </div>
        </div>
      </div>

      {/* Health column */}
      <div style={{ flex: 1, minWidth: 160 }}>
        <SectionLabel>Health</SectionLabel>
        <div style={{
          background: 'var(--bg-modal)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          {/* Success bar */}
          {total > 0 && (
            <div style={{
              display: 'flex',
              height: 5,
              borderRadius: 3,
              overflow: 'hidden',
              background: 'rgba(255,255,255,0.05)',
            }}>
              {donePercent > 0 && <div style={{ width: `${donePercent}%`, background: 'var(--green)' }} />}
              {failedPercent > 0 && <div style={{ width: `${failedPercent}%`, background: 'var(--red)' }} />}
            </div>
          )}
          <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
            {overview.meaningfulSuccessRate != null ? `${overview.meaningfulSuccessRate}%` : '\u2014'} success rate
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-very-muted)' }}>
            {done} completed {'\u00b7'} {failed} failed
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- Card: Attention Needed ---------- */

function AttentionCard({
  overview,
  context,
  onSessionClick,
}: {
  overview: ProjectOverview
  context: ProjectContext | null
  onSessionClick: (id: string) => void
}): React.ReactElement | null {
  const items: { icon: string; text: string; action?: () => void }[] = []

  // Stalled sessions
  if (overview.stalledSessionCount > 0 && context?.stalledSessions) {
    for (const s of context.stalledSessions) {
      items.push({
        icon: '\u26a0',
        text: `"${s.title || 'Untitled'}" is waiting for your input`,
        action: () => onSessionClick(s.id),
      })
    }
  }

  // Recent failures
  if (overview.recentFailureCount > 0) {
    items.push({
      icon: '\u2718',
      text: `${overview.recentFailureCount} session${overview.recentFailureCount !== 1 ? 's' : ''} failed this week`,
    })
  }

  if (items.length === 0) return null

  return (
    <div>
      <SectionLabel>Needs Attention</SectionLabel>
      <div style={{
        background: 'rgba(245, 158, 11, 0.06)',
        border: '1px solid rgba(245, 158, 11, 0.2)',
        borderRadius: 8,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
        {items.map((item, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              color: 'var(--text-primary)',
              cursor: item.action ? 'pointer' : 'default',
            }}
            onClick={item.action}
          >
            <span style={{ flexShrink: 0 }}>{item.icon}</span>
            <span style={{ flex: 1 }}>{item.text}</span>
            {item.action && (
              <span style={{ fontSize: 12, color: 'var(--amber)', fontWeight: 600, flexShrink: 0 }}>
                Resume {'\u2192'}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- Card: Recent Work ---------- */

function RecentWorkCard({ overview }: { overview: ProjectOverview }): React.ReactElement | null {
  const hasTopics = overview.recentWorkTopics.length > 0
  const hasCommit = overview.lastCommitMessage

  if (!hasTopics && !hasCommit) return null

  return (
    <div>
      <SectionLabel>Recent Work</SectionLabel>
      <div style={{
        background: 'var(--bg-modal)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}>
        {/* Recent topics from sessions */}
        {hasTopics && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-very-muted)', marginBottom: 6 }}>
              What you&apos;ve been working on
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {overview.recentWorkTopics.map((topic, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 13,
                    color: 'var(--text-primary)',
                    lineHeight: 1.5,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {topic}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Last commit */}
        {hasCommit && (
          <div style={{
            borderTop: hasTopics ? '1px solid var(--border)' : 'none',
            paddingTop: hasTopics ? 10 : 0,
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-very-muted)', marginBottom: 4 }}>
              Last commit
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>
              {overview.lastCommitMessage}
              {overview.lastCommitAt && (
                <span style={{ color: 'var(--text-very-muted)', marginLeft: 6, fontSize: 12 }}>
                  {formatRelativeTime(overview.lastCommitAt)}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ---------- Card: Since You Were Last Here ---------- */

function SinceLastVisitCard({
  context,
  onSessionClick,
}: {
  context: ProjectContext
  onSessionClick: (id: string) => void
}): React.ReactElement | null {
  if (!context.lastVisitedAt) return null
  const hasCommits = context.commitsSinceLastVisit.length > 0
  const hasStalled = context.stalledSessions.length > 0
  if (!hasCommits && !hasStalled) return null

  return (
    <div style={{
      background: 'rgba(245, 158, 11, 0.06)',
      border: '1px solid rgba(245, 158, 11, 0.15)',
      borderRadius: 8,
      padding: 14,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
        Since your last visit
      </div>
      {hasCommits && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {context.commitsSinceLastVisit.length} new commit{context.commitsSinceLastVisit.length !== 1 ? 's' : ''} shipped
        </div>
      )}
      {hasStalled && context.stalledSessions.map(s => (
        <div
          key={s.id}
          style={{ fontSize: 12, color: 'var(--amber)', cursor: 'pointer' }}
          onClick={() => onSessionClick(s.id)}
        >
          &ldquo;{s.title || 'Untitled'}&rdquo; needs your input {'\u2192'}
        </div>
      ))}
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
      <div style={{
        color: 'var(--text-muted)',
        fontSize: 13,
        padding: '24px 0',
        display: 'flex',
        justifyContent: 'center',
      }}>
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
    <div
      data-testid="project-overview-tab"
      style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
    >
      {/* Contextual: since last visit */}
      {context && (
        <SinceLastVisitCard context={context} onSessionClick={handleSessionClick} />
      )}

      {/* 1. Identity: what is this project? */}
      <IdentityCard overview={overview} />

      {/* 2. At a Glance: how big is it? */}
      <AtAGlanceCard overview={overview} />

      {/* 3. Activity + Health: am I using it? Is it working? */}
      <ActivityHealthCard overview={overview} />

      {/* 4. Needs Attention: what needs me? */}
      <AttentionCard
        overview={overview}
        context={context}
        onSessionClick={handleSessionClick}
      />

      {/* 5. Recent Work: what have I been doing? */}
      <RecentWorkCard overview={overview} />
    </div>
  )
}

export default ProjectOverviewTab
