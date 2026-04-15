import { useCanvasStore } from '../store'
import type { SessionState } from '../../../shared/types'

interface ProjectStatsTabProps {
  projectSlug: string
}

const ACTIVE_STATUSES = new Set(['running', 'active', 'needs_input'])

function statusDotColor(status: SessionState['status']): string {
  if (ACTIVE_STATUSES.has(status)) return 'var(--amber)'
  if (status === 'done') return 'var(--green)'
  if (status === 'failed') return 'var(--red, #e55)'
  return 'var(--text-very-muted)'
}

function formatDuration(startedAt: string, endedAt?: string): string {
  const end = endedAt ? new Date(endedAt).getTime() : Date.now()
  const ms = end - new Date(startedAt).getTime()
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return '<1m'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`
}

function ProjectStatsTab({ projectSlug }: ProjectStatsTabProps): React.ReactElement {
  const sessions = useCanvasStore((s) => s.sessions).filter(
    (s) => s.projectSlug === projectSlug,
  )

  const totalSessions = sessions.length
  const totalPrompts = sessions.reduce((sum, s) => sum + (s.promptCount ?? 0), 0)
  const totalToolCalls = sessions.reduce((sum, s) => sum + (s.toolCallCount ?? 0), 0)
  const totalFilesChanged = sessions.reduce(
    (sum, s) => sum + (s.filesChangedCount ?? 0),
    0,
  )

  // Sort sessions most-recent-first
  const sortedSessions = [...sessions].sort((a, b) => {
    const aTime = new Date(b.startedAt).getTime()
    const bTime = new Date(a.startedAt).getTime()
    return aTime - bTime
  })

  return (
    <div data-testid="project-stats-tab">
      {/* Stats grid 2x2 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <GridStatCard value={totalSessions} label="Total Sessions" />
        <GridStatCard value={totalPrompts} label="Total Prompts" />
        <GridStatCard value={totalToolCalls} label="Total Tool Calls" />
        <GridStatCard value={totalFilesChanged} label="Total Files Changed" />
      </div>

      {/* Session timeline */}
      <div
        style={{
          fontSize: 11,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.06em',
          color: 'var(--text-muted)',
          fontWeight: 600,
          marginBottom: 10,
        }}
      >
        Per Session
      </div>
      <div>
        {sortedSessions.map((session, i) => {
          const isRunning = ACTIVE_STATUSES.has(session.status)
          const duration = formatDuration(session.startedAt, session.endedAt)

          return (
            <div
              key={session.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 0',
                borderBottom:
                  i < sortedSessions.length - 1
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
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  flex: 1,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  minWidth: 0,
                }}
              >
                {session.title || session.id}
              </span>

              {/* Meta */}
              <span
                style={{
                  fontSize: 11,
                  color: isRunning ? 'var(--amber)' : 'var(--text-very-muted)',
                  fontFamily: 'var(--font-mono)',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                {isRunning
                  ? `running \u00B7 ${session.toolCallCount ?? 0} tool calls so far`
                  : `${duration} \u00B7 ${session.promptCount ?? 0} prompts \u00B7 ${session.filesChangedCount ?? 0} files`}
              </span>
            </div>
          )
        })}
        {sortedSessions.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            No sessions yet.
          </div>
        )}
      </div>
    </div>
  )
}

/* ---------- Grid stat card ---------- */

function GridStatCard({
  value,
  label,
}: {
  value: number
  label: string
}): React.ReactElement {
  return (
    <div
      style={{
        background: 'var(--bg-sidebar)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: 16,
      }}
    >
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: 'var(--text-primary)',
          lineHeight: 1,
          marginBottom: 4,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 11,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.06em',
          color: 'var(--text-muted)',
          fontWeight: 500,
        }}
      >
        {label}
      </div>
    </div>
  )
}

export default ProjectStatsTab
