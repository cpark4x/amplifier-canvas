import { useState, useEffect } from 'react'
import type { ProjectStatsData } from '../../../shared/types'

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

function heatColor(total: number): string {
  if (total === 0) return 'var(--bg-page)'
  if (total === 1) return 'rgba(245,158,11,0.15)'
  if (total <= 3) return 'rgba(245,158,11,0.35)'
  if (total <= 5) return 'rgba(245,158,11,0.6)'
  return 'var(--amber)'
}

function successRateColor(rate: number): string {
  if (rate >= 50) return 'var(--green)'
  if (rate < 25) return 'var(--red)'
  return 'var(--text-primary)'
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
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function ProjectStatsTab({ projectSlug }: ProjectStatsTabProps): React.ReactElement {
  const [data, setData] = useState<ProjectStatsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setData(null)
    ;(window as any).electronAPI
      .getProjectStats(projectSlug)
      .then((result: ProjectStatsData) => {
        if (!cancelled) setData(result)
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
  /*  Build 28-day heatmap grid                                        */
  /* ---------------------------------------------------------------- */
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const activityMap = new Map<string, number>()
  for (const entry of data.dailyActivity) {
    activityMap.set(entry.date, entry.total)
  }

  // Generate 28 dates (today − 27 … today)
  const days: { date: Date; iso: string; total: number }[] = []
  for (let i = 27; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    days.push({ date: d, iso, total: activityMap.get(iso) ?? 0 })
  }

  // JS getDay(): 0=Sun,1=Mon..6=Sat → remap to Mon=0..Sun=6
  const remapDay = (d: Date): number => (d.getDay() + 6) % 7

  // Build 4 columns × 7 rows
  type Cell = { iso: string; total: number } | null
  const columns: Cell[][] = [[], [], [], []]

  const firstDay = days[0].date
  const firstMonday = new Date(firstDay)
  firstMonday.setDate(firstMonday.getDate() - remapDay(firstDay))

  for (const day of days) {
    const dayMonday = new Date(day.date)
    dayMonday.setDate(dayMonday.getDate() - remapDay(day.date))
    const weekIdx = Math.round(
      (dayMonday.getTime() - firstMonday.getTime()) / (7 * 86400000),
    )
    const row = remapDay(day.date)
    const col = Math.min(Math.max(weekIdx, 0), 3)
    if (!columns[col]) columns[col] = []
    columns[col][row] = { iso: day.iso, total: day.total }
  }

  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 7; r++) {
      if (!columns[c][r]) columns[c][r] = null
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Session classification bar segments                              */
  /* ---------------------------------------------------------------- */
  const cb = data.classificationBreakdown
  const classTotal = cb.deepWork + cb.quickTask + cb.automated + cb.failedAuto

  const segments: { key: string; count: number; color: string }[] = [
    { key: 'deep', count: cb.deepWork, color: 'var(--green)' },
    { key: 'quick', count: cb.quickTask, color: 'var(--amber)' },
    { key: 'auto', count: cb.automated, color: 'rgba(160,152,136,0.4)' },
    { key: 'failAuto', count: cb.failedAuto, color: 'rgba(239,68,68,0.3)' },
  ].filter((s) => s.count > 0)

  /* ---------------------------------------------------------------- */
  /*  Day labels for heatmap                                           */
  /* ---------------------------------------------------------------- */
  const dayLabels = ['M', '', 'W', '', 'F', '', '']

  return (
    <div data-testid="project-stats-tab">
      {/* ========== 1. Key Metrics Row ========== */}
      <div style={{ display: 'flex', gap: 12 }}>
        {/* Success Rate */}
        <div style={metricBox}>
          <div style={{ ...metricValue, color: successRateColor(data.meaningfulSuccessRate) }}>
            {Math.round(data.meaningfulSuccessRate)}%
          </div>
          <div style={metricLabel}>Success Rate</div>
        </div>

        {/* Deep Sessions */}
        <div style={metricBox}>
          <div style={metricValue}>{fmt(cb.deepWork)}</div>
          <div style={metricLabel}>Deep Sessions</div>
        </div>

        {/* Delegation Ratio */}
        <div style={metricBox}>
          <div style={metricValue}>{data.delegationRatio.toFixed(1)}x</div>
          <div style={metricLabel}>Delegation Ratio</div>
        </div>

        {/* Total Prompts */}
        <div style={metricBox}>
          <div style={metricValue}>{fmt(data.totalPrompts)}</div>
          <div style={metricLabel}>Total Prompts</div>
        </div>
      </div>

      {/* ========== 2. Session Classification Bar ========== */}
      <div style={sectionHeader}>Session Breakdown</div>

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
        <LegendItem color="var(--green)" label="⚡ Deep Work" value={cb.deepWork} />
        <LegendItem color="var(--amber)" label="→ Quick Task" value={cb.quickTask} />
        <LegendItem color="rgba(160,152,136,0.4)" label="⚙ Automated" value={cb.automated} />
        <LegendItem color="rgba(239,68,68,0.3)" label="⚙ Failed Auto" value={cb.failedAuto} />
      </div>

      {/* ========== 3. Activity Heatmap ========== */}
      <div style={sectionHeader}>Activity · Last 4 Weeks</div>

      <div style={{ display: 'flex', gap: 3 }}>
        {/* Day labels column */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            marginRight: 4,
          }}
        >
          {dayLabels.map((label, i) => (
            <div
              key={i}
              style={{
                minWidth: 16,
                height: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                fontSize: 9,
                color: 'var(--text-very-muted)',
                lineHeight: 1,
              }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Heatmap columns */}
        {columns.map((col, ci) => (
          <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {col.map((cell, ri) => (
              <div
                key={ri}
                title={
                  cell
                    ? `${cell.iso}: ${cell.total} session${cell.total !== 1 ? 's' : ''}`
                    : ''
                }
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 4,
                  background: cell ? heatColor(cell.total) : 'var(--bg-page)',
                }}
              />
            ))}
          </div>
        ))}
      </div>

      {/* ========== 4. Delegation Insights ========== */}
      {data.agentSessionCount > 0 && (
        <>
          <div style={sectionHeader}>Delegation</div>
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
                color: 'var(--text-primary)',
                lineHeight: 1.5,
              }}
            >
              You initiated{' '}
              <span style={{ fontWeight: 700 }}>{fmt(data.rootSessionCount)}</span>{' '}
              sessions → spawned{' '}
              <span style={{ fontWeight: 700 }}>{fmt(data.agentSessionCount)}</span>{' '}
              agent sessions
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-muted)',
                marginTop: 4,
                lineHeight: 1.5,
              }}
            >
              Average delegation depth:{' '}
              <span style={{ fontWeight: 700, color: 'var(--amber)' }}>
                {data.delegationRatio.toFixed(1)}x
              </span>{' '}
              per session
            </div>
          </div>
        </>
      )}

      {/* ========== 5. Averages Row ========== */}
      <div style={sectionHeader}>Averages</div>
      <div style={{ display: 'flex', gap: 24 }}>
        <AverageItem value={data.avgPromptsPerSession.toFixed(1)} label="prompts/session" />
        <AverageItem value={data.avgToolsPerSession.toFixed(1)} label="tool calls/session" />
        <AverageItem value={formatDuration(data.avgDurationMinutes)} label="avg duration" />
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
