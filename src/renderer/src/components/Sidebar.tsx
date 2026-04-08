import { useMemo } from 'react'
import { useCanvasStore } from '../store'
import type { SessionState } from '../../../shared/types'

type SidebarProps = {
  collapsed: boolean
  onToggle: () => void
}

interface Project {
  slug: string
  name: string
  sessions: SessionState[]
}

function Sidebar({ collapsed, onToggle }: SidebarProps): React.ReactElement {
  const sessions = useCanvasStore((s) => s.sessions)
  const selectedProjectSlug = useCanvasStore((s) => s.selectedProjectSlug)
  const selectProject = useCanvasStore((s) => s.selectProject)

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
        backgroundColor: '#F2F0EB',
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
                      style={{ padding: '2px 0' }}
                    >
                      <span
                        data-testid="session-name"
                        style={{
                          fontSize: '10px',
                          color: '#8B8B90',
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
