import { useCanvasStore } from '../store'
import type { SessionState } from '../../../shared/types'

interface ProjectHistoryTabProps {
  projectSlug: string
}

const ACTIVE_STATUSES = new Set(['running', 'active', 'needs_input'])

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

function ProjectHistoryTab({ projectSlug }: ProjectHistoryTabProps): React.ReactElement {
  const sessions = useCanvasStore((s) => s.sessions).filter(
    (s) => s.projectSlug === projectSlug,
  )
  const selectSession = useCanvasStore((s) => s.selectSession)
  const setViewMode = useCanvasStore((s) => s.setViewMode)

  // Split into active and completed, both sorted most-recent-first
  const activeSessions = [...sessions]
    .filter((s) => ACTIVE_STATUSES.has(s.status))
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())

  const completedSessions = [...sessions]
    .filter((s) => !ACTIVE_STATUSES.has(s.status))
    .sort((a, b) => {
      const aTime = new Date(b.endedAt ?? b.startedAt).getTime()
      const bTime = new Date(a.endedAt ?? a.startedAt).getTime()
      return aTime - bTime
    })

  function handleNavigate(session: SessionState): void {
    selectSession(session.id)
    setViewMode('session')
  }

  return (
    <div data-testid="project-history-tab">
      {/* Currently open sessions */}
      {activeSessions.length > 0 && (
        <>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase' as const,
              letterSpacing: '0.08em',
              color: 'var(--amber)',
              marginBottom: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--amber)',
                display: 'inline-block',
              }}
            />
            Currently Open
          </div>
          {activeSessions.map((session) => (
            <div
              key={session.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '9px 2px',
                background: 'rgba(245,158,11,0.04)',
                marginBottom: 4,
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                gap: 12,
              }}
              onClick={() => handleNavigate(session)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}
                >
                  {session.title || session.id}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--amber)',
                    fontFamily: 'var(--font-mono)',
                    marginTop: 2,
                  }}
                >
                  running &middot; {formatDuration(session.startedAt)}
                  {session.worktree && session.worktree !== 'main' && (
                    <> &middot; &#x219F; {session.worktree}</>
                  )}
                </div>
              </div>
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--amber)',
                  flexShrink: 0,
                  cursor: 'pointer',
                }}
              >
                View &rarr;
              </span>
            </div>
          ))}
        </>
      )}

      {/* Completed session history */}
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.08em',
          color: 'var(--text-very-muted)',
          margin: `${activeSessions.length > 0 ? 14 : 0}px 0 6px`,
        }}
      >
        History
      </div>
      {completedSessions.length === 0 && (
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          No completed sessions yet.
        </div>
      )}
      {completedSessions.map((session, i) => {
        const timestamp = formatRelativeTime(session.endedAt ?? session.startedAt)
        const duration = formatDuration(session.startedAt, session.endedAt)

        return (
          <div
            key={session.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '9px 0',
              borderBottom:
                i < completedSessions.length - 1
                  ? '1px solid var(--border)'
                  : 'none',
              cursor: 'pointer',
              gap: 12,
            }}
            onClick={() => handleNavigate(session)}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}
                >
                  {session.title || session.id}
                </span>
                {/* Worktree/branch badge */}
                {session.worktree && session.worktree !== 'main' && (
                  <span
                    style={{
                      fontSize: 9,
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-very-muted)',
                      background: 'var(--bg-sidebar)',
                      border: '1px solid var(--border)',
                      borderRadius: 3,
                      padding: '1px 5px',
                      letterSpacing: '0.02em',
                    }}
                  >
                    &#x219F; {session.worktree}
                  </span>
                )}
                {/* Commit hash badge */}
                {session.commitHash && (
                  <span
                    style={{
                      fontSize: 9,
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-very-muted)',
                      background: 'var(--bg-sidebar)',
                      border: '1px solid var(--border)',
                      borderRadius: 3,
                      padding: '1px 5px',
                      letterSpacing: '0.02em',
                    }}
                  >
                    {session.commitHash}
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--text-very-muted)',
                  fontFamily: 'var(--font-mono)',
                  marginTop: 2,
                }}
              >
                {timestamp} &middot; {duration}
                {session.promptCount != null && <> &middot; {session.promptCount} prompts</>}
                {session.filesChangedCount != null && session.filesChangedCount > 0 && (
                  <> &middot; {session.filesChangedCount} files</>
                )}
              </div>
            </div>
            <span
              style={{
                fontSize: 11,
                color: 'var(--amber)',
                flexShrink: 0,
                cursor: 'pointer',
              }}
            >
              Resume &rarr;
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default ProjectHistoryTab
