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

const STATUS_COLORS: Record<SessionStatus, string> = {
  running: '#F59E0B',
  active: '#F59E0B',
  needs_input: '#F59E0B',
  done: '#4CAF74',
  failed: '#EF4444',
}

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
            {projects.map((project) => (
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

                {/* Session rows — always visible (session-first design per storyboard) */}
                <div>
                  {project.sessions.map((session) => (
                    <div
                      key={session.id}
                      data-testid="session-item"
                      data-selected={selectedSessionId === session.id ? 'true' : 'false'}
                      onClick={() => { selectSession(session.id); openViewer() }}
                      style={{
                        height: 36,
                        padding: '0 12px 0 14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        position: 'relative',
                        backgroundColor:
                          selectedSessionId === session.id
                            ? 'var(--bg-sidebar-active)'
                            : 'transparent',
                        borderLeft:
                          selectedSessionId === session.id
                            ? '2px solid var(--amber)'
                            : '2px solid transparent',
                        transition: 'background 0.12s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (selectedSessionId !== session.id) {
                          ;(e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(0,0,0,0.03)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        ;(e.currentTarget as HTMLDivElement).style.backgroundColor =
                          selectedSessionId === session.id ? '#E8E0D4' : 'transparent'
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
                          backgroundColor: STATUS_COLORS[session.status] || 'var(--text-very-muted)',
                          display: 'inline-block',
                          flexShrink: 0,
                        }}
                      />

                      {/* Session name */}
                      <span
                        data-testid="session-name"
                        style={{
                          fontSize: '12px',
                          fontWeight:
                            session.status === 'running' || session.status === 'active' ? 600 : 400,
                          color: 'var(--text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1,
                        }}
                      >
                        {session.id.slice(0, 8)}
                      </span>

                      {/* Session age */}
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
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default Sidebar
