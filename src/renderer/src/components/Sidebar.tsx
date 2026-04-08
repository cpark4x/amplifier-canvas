import { useMemo } from 'react'
import { useCanvasStore } from '../store'
import type { SessionState, SessionStatus } from '../../../shared/types'

type SidebarProps = {
  collapsed: boolean
  onToggle: () => void
}

interface Project {
  slug: string
  name: string
  sessions: SessionState[]
}

const STATUS_COLORS: Record<SessionStatus, string> = {
  running: '#3B82F6',
  active: '#3B82F6',
  needs_input: '#F59E0B',
  done: '#10B981',
  failed: '#EF4444',
}

function Sidebar({ collapsed, onToggle }: SidebarProps): React.ReactElement {
  const sessions = useCanvasStore((s) => s.sessions)
  const selectedProjectSlug = useCanvasStore((s) => s.selectedProjectSlug)
  const selectedSessionId = useCanvasStore((s) => s.selectedSessionId)
  const selectProject = useCanvasStore((s) => s.selectProject)
  const selectSession = useCanvasStore((s) => s.selectSession)

  // Derive projects from sessions (stable reference via useMemo)
  const projects: Project[] = useMemo(() => {
    const projectMap = new Map<string, Project>()
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
  }, [sessions])

  return (
    <div
      data-testid="sidebar"
      style={{
        width: collapsed ? 28 : 200,
        minWidth: collapsed ? 28 : 200,
        height: '100%',
        backgroundColor: 'var(--bg-sidebar)',
        borderRight: '0px solid transparent',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'width 0.15s ease, min-width 0.15s ease',
      }}
    >
      {/* Toggle button */}
      <button
        data-testid="sidebar-toggle"
        onClick={onToggle}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '6px 8px',
          fontSize: '10px',
          color: '#8B8B90',
          textAlign: 'left',
          letterSpacing: '0.08em',
          textTransform: 'uppercase' as const,
        }}
      >
        {collapsed ? '\u203a' : '\u2039'}
      </button>

      {/* Project list (hidden when collapsed) */}
      {!collapsed && (
        <div style={{ padding: '4px 8px', flex: 1, overflow: 'auto' }}>
          {projects.map((project) => (
            <div key={project.slug}>
              <div
                data-testid="project-item"
                data-selected={selectedProjectSlug === project.slug ? 'true' : 'false'}
                onClick={() => selectProject(project.slug)}
                style={{
                  cursor: 'pointer',
                  padding: '3px 0',
                }}
              >
                <span
                  data-testid="project-name"
                  style={{
                    fontSize: '11px',
                    fontWeight: 500,
                    color:
                      selectedProjectSlug === project.slug ? '#2C2825' : '#8B8B90',
                  }}
                >
                  {project.name}
                </span>
              </div>

              {/* Session list (visible when project is selected) */}
              {selectedProjectSlug === project.slug && (
                <div style={{ paddingLeft: '8px' }}>
                  {project.sessions.map((session) => (
                    <div
                      key={session.id}
                      data-testid="session-item"
                      data-selected={selectedSessionId === session.id ? 'true' : 'false'}
                      onClick={() => selectSession(session.id)}
                      style={{
                        padding: '2px 4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        backgroundColor:
                          selectedSessionId === session.id
                            ? 'rgba(0, 0, 0, 0.06)'
                            : 'transparent',
                        borderRadius: '3px',
                      }}
                    >
                      <span
                        data-testid="status-dot"
                        data-status={session.status}
                        style={{
                          width: 6,
                          height: 6,
                          minWidth: 6,
                          borderRadius: '50%',
                          backgroundColor: STATUS_COLORS[session.status] || '#8B8B90',
                          display: 'inline-block',
                        }}
                      />
                      <span
                        data-testid="session-name"
                        style={{
                          fontSize: '10px',
                          color:
                            selectedSessionId === session.id ? '#2C2825' : '#8B8B90',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {session.id}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Sidebar
