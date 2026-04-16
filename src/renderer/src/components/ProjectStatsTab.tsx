import { useState, useEffect } from 'react'
import type { ProjectStatsData, ProjectContext } from '../../../shared/types'

interface ProjectStatsTabProps {
  projectSlug: string
}

const fmt = (n: number): string => new Intl.NumberFormat().format(n)

function formatDuration(minutes: number): string {
  if (minutes < 1) return '<1m'
  if (minutes < 60) return `${Math.round(minutes)}m`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

/** Format a date string as "Mon DD" (e.g. "Apr 15") */
function shortDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/* ------------------------------------------------------------------ */
/*  Shared styles                                                      */
/* ------------------------------------------------------------------ */

const sectionHeader: React.CSSProperties = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--text-muted)',
  fontWeight: 600,
  marginTop: 20,
  marginBottom: 8,
}

const metricBox: React.CSSProperties = {
  flex: 1,
  background: 'var(--bg-modal)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '14px 16px',
}

const metricValue: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  color: 'var(--text-primary)',
  lineHeight: 1,
  fontFamily: 'var(--font-ui)',
}

const metricLabel: React.CSSProperties = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-muted)',
  marginTop: 4,
}

/* ------------------------------------------------------------------ */
/*  Commit grouping helper                                             */
/* ------------------------------------------------------------------ */

interface CommitWeekGroup {
  label: string
  commits: { hash: string; message: string; date: string }[]
}

function groupCommitsByWeek(
  commits: { hash: string; message: string; date: string; author: string }[],
): CommitWeekGroup[] {
  if (commits.length === 0) return []

  const now = new Date()
  now.setHours(0, 0, 0, 0)

  // Monday of this week
  const dayOfWeek = (now.getDay() + 6) % 7 // Mon=0 .. Sun=6
  const thisMonday = new Date(now)
  thisMonday.setDate(thisMonday.getDate() - dayOfWeek)

  const groups: Map<number, { hash: string; message: string; date: string }[]> = new Map()

  for (const c of commits) {
    const d = new Date(c.date)
    d.setHours(0, 0, 0, 0)
    const diffDays = Math.floor((thisMonday.getTime() - d.getTime()) / 86400000)
    const weekIdx = diffDays < 0 ? 0 : Math.floor(diffDays / 7)
    if (weekIdx >= 4) continue // max 4 weeks

    if (!groups.has(weekIdx)) groups.set(weekIdx, [])
    groups.get(weekIdx)!.push({ hash: c.hash, message: c.message, date: c.date })
  }

  const labels = ['This week', 'Last week', '2 weeks ago', '3 weeks ago']
  const result: CommitWeekGroup[] = []

  for (const [weekIdx, weekCommits] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    result.push({
      label: labels[weekIdx] ?? `${weekIdx} weeks ago`,
      commits: weekCommits.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      ),
    })
  }

  return result
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function ProjectStatsTab({ projectSlug }: ProjectStatsTabProps): React.ReactElement {
  const [data, setData] = useState<ProjectStatsData | null>(null)
  const [context, setContext] = useState<ProjectContext | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setData(null)
    setContext(null)

    const api = (window as any).electronAPI
    Promise.all([
      api.getProjectStats(projectSlug) as Promise<ProjectStatsData>,
      api.getProjectContext(projectSlug) as Promise<ProjectContext>,
    ])
      .then(([statsResult, contextResult]) => {
        if (!cancelled) {
          setData(statsResult)
          setContext(contextResult)
        }
      })
      .catch(() => {
        /* swallow – data stays null */
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [projectSlug])

  /* Loading */
  if (loading) {
    return (
      <div
        data-testid="project-stats-tab"
        style={{
          color: 'var(--text-muted)',
          fontSize: 13,
          padding: '24px 0',
          textAlign: 'center',
        }}
      >
        Loading stats…
      </div>
    )
  }

  /* Empty */
  if (!data || data.totalSessions === 0) {
    return (
      <div
        data-testid="project-stats-tab"
        style={{
          color: 'var(--text-muted)',
          fontSize: 13,
          padding: '24px 0',
          textAlign: 'center',
        }}
      >
        No session data available.
      </div>
    )
  }

  /* ---------------------------------------------------------------- */
  /*  Derived data                                                     */
  /* ---------------------------------------------------------------- */
  const cb = data.classificationBreakdown
  const classTotal = cb.deepWork + cb.quickTask + cb.automated + cb.failedAuto

  const segments: { key: string; count: number; color: string }[] = [
    { key: 'deep', count: cb.deepWork, color: 'var(--green)' },
    { key: 'quick', count: cb.quickTask, color: 'var(--amber)' },
    { key: 'auto', count: cb.automated, color: 'rgba(160,152,136,0.4)' },
    { key: 'failAuto', count: cb.failedAuto, color: 'rgba(239,68,68,0.3)' },
  ].filter((s) => s.count > 0)

  const totalTimeMinutes = data.avgDurationMinutes * data.totalSessions
  const commitCount = context?.recentCommits.length ?? 0
  const stalledCount = context?.stalledSessions.length ?? 0
  const commitGroups = groupCommitsByWeek(context?.recentCommits ?? [])

  return (
    <div data-testid="project-stats-tab">
      {/* ========== 1. Key Metrics Row ========== */}
      <div style={{ display: 'flex', gap: 12 }}>
        {/* Commits */}
        <div style={metricBox}>
          <div style={metricValue}>{fmt(commitCount)}</div>
          <div style={metricLabel}>Commits</div>
        </div>

        {/* Deep work sessions */}
        <div style={metricBox}>
          <div style={metricValue}>{fmt(cb.deepWork)}</div>
          <div style={metricLabel}>Deep work sessions</div>
        </div>

        {/* Time invested */}
        <div style={metricBox}>
          <div style={metricValue}>{formatDuration(totalTimeMinutes)}</div>
          <div style={metricLabel}>Time invested</div>
        </div>

        {/* Needs attention */}
        <div style={metricBox}>
          <div
            style={{
              ...metricValue,
              color: stalledCount > 0 ? 'var(--red)' : 'var(--text-primary)',
            }}
          >
            {stalledCount}
          </div>
          <div style={metricLabel}>Needs attention</div>
        </div>
      </div>

      {/* ========== 2. How You Spent Your Time ========== */}
      <div style={sectionHeader}>How you spent your time</div>

      {/* Stacked bar */}
      {classTotal > 0 ? (
        <div
          style={{
            display: 'flex',
            height: 28,
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          {segments.map((seg) => {
            const widthPx =
              classTotal > 0 ? (seg.count / classTotal) * 100 : 0
            // Estimate if label fits: roughly > 40px means > ~15% for typical widths
            const showLabel = widthPx > 15
            return (
              <div
                key={seg.key}
                style={{
                  width: `${widthPx}%`,
                  background: seg.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'width 0.3s',
                }}
              >
                {showLabel && (
                  <span
                    style={{
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 600,
                      lineHeight: 1,
                    }}
                  >
                    {seg.count}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div
          style={{
            height: 28,
            borderRadius: 6,
            background: 'var(--bg-page)',
          }}
        />
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
        <LegendItem color="var(--green)" label="Deep work" value={cb.deepWork} />
        <LegendItem color="var(--amber)" label="Quick tasks" value={cb.quickTask} />
        <LegendItem color="rgba(160,152,136,0.4)" label="Automated" value={cb.automated} />
        <LegendItem color="rgba(239,68,68,0.3)" label="Failed" value={cb.failedAuto} />
      </div>

      {/* ========== 3. Commit Timeline ========== */}
      <div style={sectionHeader}>What was shipped</div>

      {commitGroups.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {commitGroups.map((group) => (
            <div key={group.label}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  marginBottom: 6,
                }}
              >
                {group.label}{' '}
                <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>
                  ({group.commits.length} commit{group.commits.length !== 1 ? 's' : ''})
                </span>
              </div>

              {group.commits.map((c) => (
                <div
                  key={c.hash}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 8,
                    padding: '3px 0',
                    fontSize: 12,
                    lineHeight: 1.5,
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-mono, monospace)',
                      color: 'var(--text-muted)',
                      flexShrink: 0,
                      fontSize: 11,
                    }}
                  >
                    {c.hash.slice(0, 7)}
                  </span>
                  <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>&mdash;</span>
                  <span
                    style={{
                      color: 'var(--text-primary)',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {c.message}
                  </span>
                  <span
                    style={{
                      color: 'var(--text-muted)',
                      flexShrink: 0,
                      fontSize: 11,
                      textAlign: 'right',
                    }}
                  >
                    {shortDate(c.date)}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 0' }}>
          No commits found
        </div>
      )}

      {/* ========== 4. Needs Attention ========== */}
      <div style={sectionHeader}>Needs attention</div>

      {stalledCount > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {context!.stalledSessions.map((s) => {
            const label = s.title || 'Untitled session'
            return (
              <div
                key={s.id}
                style={{
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  lineHeight: 1.5,
                }}
              >
                <span style={{ color: 'var(--amber)' }}>&#x26A0;</span>{' '}
                &ldquo;{label}&rdquo;{' '}
                <span style={{ color: 'var(--text-muted)' }}>
                  &mdash; {s.status} {timeAgo(s.startedAt)} ({s.promptCount} prompt
                  {s.promptCount !== 1 ? 's' : ''})
                </span>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--green)', padding: '4px 0' }}>
          &#x2713; Nothing needs your attention
        </div>
      )}

      {/* ========== 5. Session Averages ========== */}
      <div style={sectionHeader}>Averages</div>
      <div style={{ display: 'flex', gap: 24 }}>
        <AverageItem value={data.avgPromptsPerSession.toFixed(1)} label="prompts per session" />
        <AverageItem value={data.avgToolsPerSession.toFixed(1)} label="tool calls per session" />
        <AverageItem value={formatDuration(data.avgDurationMinutes)} label="average session" />
        <AverageItem value={`${data.delegationRatio.toFixed(1)}x`} label="delegation depth" />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Legend item                                                         */
/* ------------------------------------------------------------------ */

function LegendItem({
  color,
  label,
  value,
}: {
  color: string
  label: string
  value: number
}): React.ReactElement {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 12,
        color: 'var(--text-muted)',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
        }}
      />
      {label} {value}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  Average item                                                       */
/* ------------------------------------------------------------------ */

function AverageItem({
  value,
  label,
}: {
  value: string
  label: string
}): React.ReactElement {
  return (
    <span>
      <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
        {value}
      </span>{' '}
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
    </span>
  )
}

export default ProjectStatsTab
