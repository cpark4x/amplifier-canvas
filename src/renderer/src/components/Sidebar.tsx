import { useState } from 'react'

const MOCK_PROJECTS = [
  {
    id: 'team-pulse',
    name: 'Team Pulse',
    sessions: [
      { id: 'tp-main', name: 'main' },
      { id: 'tp-notif', name: 'feature/notifications' },
    ],
  },
  {
    id: 'canvas-app',
    name: 'Canvas-App',
    sessions: [
      { id: 'ca-main', name: 'main' },
      { id: 'ca-sidebar', name: 'redesign-sidebar' },
    ],
  },
  {
    id: 'ridecast',
    name: 'Ridecast',
    sessions: [
      { id: 'rc-main', name: 'main' },
    ],
  },
]

type SidebarProps = {
  collapsed: boolean
  onToggle: () => void
}

function Sidebar({ collapsed, onToggle }: SidebarProps): React.ReactElement {
  const [selectedProject, setSelectedProject] = useState<string | null>(null)

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
        {collapsed ? '›' : '‹'}
      </button>

      {/* Project list (hidden when collapsed) */}
      {!collapsed && (
        <div style={{ padding: '4px 8px', flex: 1, overflow: 'auto' }}>
          {MOCK_PROJECTS.map((project) => (
            <div key={project.id}>
              <div
                data-testid="project-item"
                data-selected={selectedProject === project.id ? 'true' : 'false'}
                onClick={() =>
                  setSelectedProject(
                    selectedProject === project.id ? null : project.id
                  )
                }
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
                      selectedProject === project.id ? '#2C2825' : '#8B8B90',
                  }}
                >
                  {project.name}
                </span>
              </div>

              {/* Session list (visible when project is selected) */}
              {selectedProject === project.id && (
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
                        {session.name}
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