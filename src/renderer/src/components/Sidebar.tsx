import { useMemo } from 'react'
import { useCanvasStore } from '../store'
import type { SessionState, SessionStatus } from '../../../shared/types'

type SidebarProps = {
  collapsed: boolean
  onToggle: () => void
  onNewProject?: () => void
}

interface Project {
  slug: string
  name: string
  sessions: SessionState[]
}

// ---- Helpers ----------------------------------------------------------------

const ACTIVE_STATUSES = new Set<SessionStatus>(['running', 'active', 'needs_input'])
const COMPLETED_STATUSES = new Set<SessionStatus>(['done', 'failed'])

const STATUS_COLORS: Record<SessionStatus, string> = {
  running: '#F59E0B',
  active: '#F59E0B',
  needs_input: '#F59E0B',
  done: '#3ECF8E', // Emerald
  failed: '#EF4444',
}

/**
 * Returns a human-readable relative time string for a given ISO timestamp.
 * < 1 minute  → "just now"
 * < 60 minutes → "Xm ago"
 * < 24 hours   → "Xh ago"
 * < 7 days     → "Xd ago"
 * else         → "Mon D"  (e.g. "Apr 7")
 */
function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Returns human-readable duration from two ISO timestamps. */
function formatDuration(startedAt: string, endedAt: string): string {
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime()
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return '<1m'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`
}

/** Returns a stats summary line, e.g. "5m · 1 prompt · 2 files". Omits zero values. */
function formatStats(session: SessionState): string {
  const parts: string[] = []

  if (session.startedAt && session.endedAt) {
    parts.push(formatDuration(session.startedAt, session.endedAt))
  }

  const prompts = session.promptCount ?? 0
  if (prompts > 0) {
    parts.push(`${prompts} ${prompts === 1 ? 'prompt' : 'prompts'}`)
  }

  const files = session.filesChangedCount ?? 0
  if (files > 0) {
    parts.push(`${files} ${files === 1 ? 'file' : 'files'}`)
  }

  return parts.join(' · ')
}

// ---- Component --------------------------------------------------------------

function Sidebar({ collapsed, onToggle, onNewProject }: SidebarProps): React.ReactElement {
  const sessions = useCanvasStore((s) => s.sessions)
  const createdProjects = useCanvasStore((s) => s.createdProjects)
  const selectedProjectSlug = useCanvasStore((s) => s.selectedProjectSlug)
  const selectedSessionId = useCanvasStore((s) => s.selectedSessionId)
  const selectProject = useCanvasStore((s) => s.selectProject)
  const selectSession = useCanvasStore((s) => s.selectSession)
  const openViewer = useCanvasStore((s) => s.openViewer)

  // Derive projects from created projects + sessions
  const projects: Project[] = useMemo(() => {
    const projectMap = new Map<string, Project>()

    // Include manually created projects
    for (const cp of createdProjects) {
      projectMap.set(cp.slug, { slug: cp.slug, name: cp.name, sessions: [] })
    }

    // Merge session-derived projects
    for (const session of sessions) {
      const existing = projectMap.get(session.projectSlug)
      if (existing) {
        existing.sessions.push(session)
      } else {
        projectMap.set(session.projectSlug, {
          slug: session.projectSlug,
          name: session.projectName,
          sessions: [session],
        })
      }
    }
    return Array.from(projectMap.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [sessions, createdProjects])

  return (
    <div
      data-testid="sidebar"
      style={{
        width: collapsed ? 28 : 200,
        minWidth: collapsed ? 28 : 200,
        height: '100%',
        backgroundColor: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'width 0.15s ease, min-width 0.15s ease',
        padding: collapsed ? 0 : '12px 0',
      }}
    >
      {/* Collapsed: just the toggle */}
      {collapsed && (
        <button
          data-testid="sidebar-toggle"
          onClick={onToggle}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '6px 8px',
            fontSize: '10px',
            color: 'var(--text-very-muted)',
            textAlign: 'left',
          }}
        >
          {'\u203a'}
        </button>
      )}

      {/* Expanded sidebar */}
      {!collapsed && (
        <>
          {/* Section header: "Projects" + "+" button — matches storyboard exactly */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 16px 8px',
            }}
          >
            <span
              data-testid="sidebar-section-label"
              style={{
                fontSize: '10px',
                textTransform: 'uppercase',
                color: 'var(--text-very-muted)',
                letterSpacing: '0.08em',
                fontWeight: 600,
              }}
            >
              Projects
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                data-testid="sidebar-add-btn"
                onClick={onNewProject}
                style={{
                  fontSize: '14px',
                  color: 'var(--text-very-muted)',
                  background: 'none',
                  border: 'none',
                  lineHeight: 1,
                  padding: 0,
                  cursor: 'pointer',
                }}
              >
                +
              </button>
              <button
                data-testid="sidebar-toggle"
                onClick={onToggle}
                style={{
                  fontSize: '14px',
                  color: 'var(--text-very-muted)',
                  background: 'none',
                  border: 'none',
                  lineHeight: 1,
                  padding: 0,
                  cursor: 'pointer',
                }}
              >
                {'\u2039'}
              </button>
            </div>
          </div>

          {/* Content area */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {/* Empty state — storyboard Screen 1 */}
            {projects.length === 0 && (
              <div
                data-testid="sidebar-empty"
                style={{
                  fontSize: '11px',
                  color: 'var(--text-very-muted)',
                  textAlign: 'center',
                  padding: '12px 16px',
                }}
              >
                No projects yet
              </div>
            )}

            {/* Project + session list — storyboard Screens 3+ */}
            {projects.map((project) => {
              const activeSessions = project.sessions.filter((s) => ACTIVE_STATUSES.has(s.status))
              const historySessions = project.sessions
                .filter((s) => COMPLETED_STATUSES.has(s.status))
                .sort((a, b) => {
                  if (!a.endedAt && !b.endedAt) return 0
                  if (!a.endedAt) return 1
                  if (!b.endedAt) return -1
                  return new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime()
                })

              const hasCompleted = historySessions.length > 0

              return (
                <div key={project.slug}>
                  {/* Project label */}
                  <div
                    data-testid="project-item"
                    data-selected={selectedProjectSlug === project.slug ? 'true' : 'false'}
                    onClick={() => selectProject(project.slug)}
                    style={{
                      padding: '12px 12px 4px',
                      fontSize: '10px',
                      fontWeight: 600,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: 'var(--text-very-muted)',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    <span data-testid="project-name">{project.name}</span>
                  </div>

                  {/* Active session rows */}
                  <div>
                    {activeSessions.map((session) => (
                      <SessionRow
                        key={session.id}
                        session={session}
                        isSelected={selectedSessionId === session.id}
                        onSelect={() => {
                          selectSession(session.id)
                          openViewer()
                        }}
                      />
                    ))}
                  </div>

                  {/* + New session slot — only when project has completed sessions */}
                  {hasCompleted && (
                    <div
                      data-testid="new-session-slot"
                      onClick={onNewProject}
                      style={{
                        height: 30,
                        padding: '0 12px 0 22px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        cursor: 'pointer',
                        opacity: 0.7,
                      }}
                      onMouseEnter={(e) => {
                        ;(e.currentTarget as HTMLDivElement).style.opacity = '1'
                      }}
                      onMouseLeave={(e) => {
                        ;(e.currentTarget as HTMLDivElement).style.opacity = '0.7'
                      }}
                    >
                      <span
                        style={{
                          fontSize: '12px',
                          color: 'var(--text-very-muted)',
                          lineHeight: 1,
                        }}
                      >
                        +
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          color: 'var(--text-very-muted)',
                        }}
                      >
                        New session
                      </span>
                    </div>
                  )}

                  {/* History section */}
                  {historySessions.length > 0 && (
                    <>
                      {/* HISTORY label */}
                      <div
                        data-testid="history-label"
                        style={{
                          padding: '6px 12px 2px 14px',
                          fontSize: '10px',
                          textTransform: 'uppercase',
                          color: '#A0977D',
                          letterSpacing: '0.08em',
                          fontWeight: 600,
                          userSelect: 'none',
                        }}
                      >
                        HISTORY
                      </div>

                      {/* History session rows */}
                      {historySessions.map((session) => (
                        <HistorySessionRow
                          key={session.id}
                          session={session}
                          isSelected={selectedSessionId === session.id}
                          onSelect={() => {
                            selectSession(session.id)
                            openViewer()
                          }}
                        />
                      ))}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ---- Sub-components ---------------------------------------------------------

interface SessionRowProps {
  session: SessionState
  isSelected: boolean
  onSelect: () => void
}

/** Active session row (running / active / needs_input) */
function SessionRow({ session, isSelected, onSelect }: SessionRowProps): React.ReactElement {
  return (
    <div
      data-testid="session-item"
      data-project-slug={session.projectSlug}
      data-selected={isSelected ? 'true' : 'false'}
      onClick={onSelect}
      style={{
        height: 36,
        padding: '0 12px 0 14px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        position: 'relative',
        backgroundColor: isSelected ? 'var(--bg-sidebar-active)' : 'transparent',
        borderLeft: isSelected ? '2px solid var(--amber)' : '2px solid transparent',
        transition: 'background 0.12s ease',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          ;(e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(0,0,0,0.03)'
        }
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.backgroundColor = isSelected ? '#E8E0D4' : 'transparent'
      }}
    >
      {/* Status dot */}
      <span
        data-testid="status-dot"
        data-status={session.status}
        style={{
          width: 6,
          height: 6,
          minWidth: 6,
          borderRadius: '50%',
          backgroundColor: STATUS_COLORS[session.status] ?? 'var(--text-very-muted)',
          display: 'inline-block',
          flexShrink: 0,
        }}
      />

      {/* Session name */}
      <span
        data-testid="session-name"
        style={{
          fontSize: '12px',
          fontWeight: session.status === 'running' || session.status === 'active' ? 600 : 400,
          color: 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
        }}
      >
        {session.title ?? session.id}
      </span>

      {/* Status label */}
      <span
        style={{
          fontSize: '11px',
          flexShrink: 0,
          color:
            session.status === 'running' || session.status === 'active'
              ? 'var(--amber)'
              : session.status === 'done'
                ? 'var(--green)'
                : 'var(--text-very-muted)',
        }}
      >
        {session.status === 'running' || session.status === 'active'
          ? 'running'
          : session.status === 'done'
            ? 'done'
            : ''}
      </span>
    </div>
  )
}

/** History session row (done / failed) — shows title, relative time, and stats */
function HistorySessionRow({ session, isSelected, onSelect }: SessionRowProps): React.ReactElement {
  return (
    <div
      data-testid="history-item"
      data-project-slug={session.projectSlug}
      data-selected={isSelected ? 'true' : 'false'}
      onClick={onSelect}
      style={{
        padding: '4px 12px 4px 14px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        position: 'relative',
        backgroundColor: isSelected ? 'var(--bg-sidebar-active)' : 'transparent',
        borderLeft: isSelected ? '2px solid var(--amber)' : '2px solid transparent',
        transition: 'background 0.12s ease',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          ;(e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(0,0,0,0.03)'
        }
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.backgroundColor = isSelected ? '#E8E0D4' : 'transparent'
      }}
    >
      {/* Status dot — vertically centered with title line */}
      <span
        data-testid="status-dot"
        data-status={session.status}
        style={{
          width: 6,
          height: 6,
          minWidth: 6,
          borderRadius: '50%',
          backgroundColor: STATUS_COLORS[session.status] ?? 'var(--text-very-muted)',
          display: 'inline-block',
          flexShrink: 0,
          marginTop: 5,
        }}
      />

      {/* Content: title + time, then stats */}
      <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
        {/* Title + relative time + resume button */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 4 }}>
          <span
            data-testid="history-title"
            style={{
              fontSize: '12px',
              fontWeight: 400,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}
          >
            {session.title ?? session.id}
          </span>
          {session.endedAt && (
            <span
              style={{
                fontSize: '10px',
                color: '#A0977D',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              {formatRelativeTime(session.endedAt)}
            </span>
          )}
          <button
            data-testid="resume-btn"
            onClick={(e) => {
              e.stopPropagation()
              window.electronAPI.resumeSession(session.id)
            }}
            style={{
              fontSize: '10px',
              color: 'var(--text-very-muted)',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            Resume →
          </button>
        </div>

        {/* Stats line */}
        <span
          data-testid="history-stats"
          style={{
            fontSize: '10px',
            color: '#A0977D',
            display: 'block',
          }}
        >
          {formatStats(session)}
        </span>
      </div>
    </div>
  )
}

export default Sidebar
