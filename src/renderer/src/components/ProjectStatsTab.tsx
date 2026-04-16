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

/** Map a day's total sessions to a heatmap color. */
function heatColor(total: number): string {
  if (total === 0) return 'var(--bg-sidebar)'
  if (total === 1) return 'rgba(245,158,11,0.2)'
  if (total <= 3) return 'rgba(245,158,11,0.4)'
  if (total <= 5) return 'rgba(245,158,11,0.7)'
  return 'var(--amber)'
}

/* ------------------------------------------------------------------ */
/*  Shared styles                                                      */
/* ------------------------------------------------------------------ */

const sectionHeader: React.CSSProperties = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-muted)',
  fontWeight: 600,
  marginBottom: 10,
}

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-modal)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: 16,
}

const cardValue: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 700,
  color: 'var(--text-primary)',
  lineHeight: 1,
  marginBottom: 6,
  fontFamily: 'var(--font-ui)',
}

const cardLabel: React.CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-muted)',
  fontWeight: 500,
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
        style={{ color: 'var(--text-muted)', fontSize: 13, padding: '24px 0' }}
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
        style={{ color: 'var(--text-muted)', fontSize: 13, padding: '24px 0' }}
      >
        No session data available.
      </div>
    )
  }

  /* ---- Build 28-day heatmap grid ---- */
  const today = new Date()
  // Reset to start of day in local tz
  today.setHours(0, 0, 0, 0)

  // Build lookup map from dailyActivity
  const activityMap = new Map<string, number>()
  for (const entry of data.dailyActivity) {
    activityMap.set(entry.date, entry.total)
  }

  // Generate 28 dates (today - 27 … today)
  const days: { date: Date; iso: string; total: number }[] = []
  for (let i = 27; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    days.push({ date: d, iso, total: activityMap.get(iso) ?? 0 })
  }

  // Arrange into columns (weeks). Each column = 7 rows Mon(0)..Sun(6).
  // We need to figure out which day-of-week each date falls on.
  // JS getDay(): 0=Sun,1=Mon..6=Sat → remap to Mon=0..Sun=6
  const remapDay = (d: Date): number => ((d.getDay() + 6) % 7)

  // Build 4 columns × 7 rows. Fill with null for empty slots.
  type Cell = { iso: string; total: number } | null
  const columns: Cell[][] = [[], [], [], []]

  // First, determine the column boundaries.
  // The 28 days span at most 5 partial weeks, but we want exactly 4 columns.
  // Strategy: group days by their ISO week offset from the first day.
  const firstDay = days[0].date
  const firstMonday = new Date(firstDay)
  firstMonday.setDate(firstMonday.getDate() - remapDay(firstDay))

  for (const day of days) {
    const dayMonday = new Date(day.date)
    dayMonday.setDate(dayMonday.getDate() - remapDay(day.date))
    const weekIdx = Math.round((dayMonday.getTime() - firstMonday.getTime()) / (7 * 86400000))
    const row = remapDay(day.date)
    // Clamp weekIdx to 0..3
    const col = Math.min(Math.max(weekIdx, 0), 3)
    if (!columns[col]) columns[col] = []
    columns[col][row] = { iso: day.iso, total: day.total }
  }

  // Fill any remaining nulls
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 7; r++) {
      if (!columns[c][r]) columns[c][r] = null
    }
  }

  /* ---- Status distribution bar ---- */
  const dist = data.statusDistribution
  const distTotal = dist.done + dist.failed + dist.active + dist.other
  const pct = (v: number) => (distTotal > 0 ? (v / distTotal) * 100 : 0)

  return (
    <div data-testid="project-stats-tab">
      {/* ========== 1. Stats Grid (2×2) ========== */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          marginBottom: 28,
        }}
      >
        {/* Total Sessions */}
        <div style={cardStyle}>
          <div style={cardValue}>{fmt(data.totalSessions)}</div>
          <div style={cardLabel}>Total Sessions</div>
        </div>

        {/* Success Rate */}
        <div style={cardStyle}>
          <div style={cardValue}>
            {Math.round(data.successRate)}
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-muted)' }}>%</span>
          </div>
          <div style={cardLabel}>Success Rate</div>
        </div>

        {/* Avg Prompts/Session */}
        <div style={cardStyle}>
          <div style={cardValue}>{data.avgPromptsPerSession.toFixed(1)}</div>
          <div style={cardLabel}>Avg Prompts / Session</div>
        </div>

        {/* Avg Duration */}
        <div style={cardStyle}>
          <div style={cardValue}>{formatDuration(data.avgDurationMinutes)}</div>
          <div style={cardLabel}>Avg Duration</div>
        </div>
      </div>

      {/* ========== 2. Activity Heatmap ========== */}
      <div style={sectionHeader}>Activity</div>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', gap: 3 }}>
          {/* Day labels column */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              marginRight: 4,
              justifyContent: 'flex-start',
            }}
          >
            {['M', '', 'W', '', 'F', '', ''].map((label, i) => (
              <div
                key={i}
                style={{
                  width: 12,
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
                  title={cell ? `${cell.iso}: ${cell.total} session${cell.total !== 1 ? 's' : ''}` : ''}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    background: cell ? heatColor(cell.total) : 'var(--bg-sidebar)',
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ========== 3. Status Distribution ========== */}
      <div style={sectionHeader}>Session Outcomes</div>
      <div style={{ marginBottom: 28 }}>
        {/* Proportional bar */}
        {distTotal > 0 ? (
          <div
            style={{
              display: 'flex',
              height: 24,
              borderRadius: 4,
              overflow: 'hidden',
              marginBottom: 10,
            }}
          >
            {pct(dist.done) > 0 && (
              <div style={{ width: `${pct(dist.done)}%`, background: 'var(--green)', transition: 'width 0.3s' }} />
            )}
            {pct(dist.active) > 0 && (
              <div style={{ width: `${pct(dist.active)}%`, background: 'var(--amber)', transition: 'width 0.3s' }} />
            )}
            {pct(dist.failed) > 0 && (
              <div style={{ width: `${pct(dist.failed)}%`, background: 'var(--red)', transition: 'width 0.3s' }} />
            )}
            {pct(dist.other) > 0 && (
              <div style={{ width: `${pct(dist.other)}%`, background: 'var(--text-very-muted)', transition: 'width 0.3s' }} />
            )}
          </div>
        ) : (
          <div
            style={{
              height: 24,
              borderRadius: 4,
              background: 'var(--bg-sidebar)',
              marginBottom: 10,
            }}
          />
        )}

        {/* Legend */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <LegendItem color="var(--green)" label="Completed" value={dist.done} />
          <LegendItem color="var(--amber)" label="In Progress" value={dist.active} />
          <LegendItem color="var(--red)" label="Failed" value={dist.failed} />
          <LegendItem color="var(--text-very-muted)" label="Other" value={dist.other} />
        </div>
      </div>

      {/* ========== 4. Totals Row ========== */}
      <div style={sectionHeader}>Totals</div>
      <div style={{ display: 'flex', gap: 24, fontSize: 13 }}>
        <span>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(data.totalPrompts)}</span>{' '}
          <span style={{ color: 'var(--text-muted)' }}>prompts</span>
        </span>
        <span>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(data.totalToolCalls)}</span>{' '}
          <span style={{ color: 'var(--text-muted)' }}>tool calls</span>
        </span>
        <span>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(data.totalFilesChanged)}</span>{' '}
          <span style={{ color: 'var(--text-muted)' }}>files changed</span>
        </span>
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
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-muted)' }}>
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

export default ProjectStatsTab
