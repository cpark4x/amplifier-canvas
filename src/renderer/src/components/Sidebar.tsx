import { useMemo } from 'react'
import { useCanvasStore } from '../store'
import ContextMenu from './ContextMenu'
import type { ContextMenuItem } from './ContextMenu'
import type { SessionState, SessionStatus } from '../../../shared/types'
import { useState } from 'react'

/** Returns true if a session started less than 30 seconds ago */
function isJustStarted(startedAt?: string): boolean {
  if (!startedAt) return false
  const elapsed = Date.now() - new Date(startedAt).getTime()
  return elapsed < 30_000
}

type SidebarProps = {
  collapsed: boolean
  hidden?: boolean
  onToggle: () => void
  onNewProject?: () => void
  onNewSession?: (projectSlug: string, projectPath: string) => void
  onSessionSelect?: (sessionId: string, workDir: string) => void
}

interface Project {
  slug: string
  name: string
  path: string
  sessions: SessionState[]
}

// ---- Helpers ----------------------------------------------------------------

const ACTIVE_STATUSES = new Set<SessionStatus>(['running', 'active', 'needs_input', 'loading'])
const COMPLETED_STATUSES = new Set<SessionStatus>(['done', 'failed', 'stopped'])

const STATUS_COLORS: Record<SessionStatus, string> = {
  running: '#F59E0B',
  active: '#F59E0B',
  needs_input: '#F59E0B',
  done: '#3ECF8E',
  failed: '#EF4444',
  loading: '#6B7280',
  stopped: '#6B7280',
}

/**
 * Returns a human-readable relative time string for a given ISO timestamp.
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

/** Returns the most recent activity timestamp for a project (for sorting). */
function getProjectLastActivity(project: Project): number {
  let latest = 0
  for (const s of project.sessions) {
    if (s.endedAt) {
      const t = new Date(s.endedAt).getTime()
      if (t > latest) latest = t
    }
    if (s.startedAt) {
      const t = new Date(s.startedAt).getTime()
      if (t > latest) latest = t
    }
  }
  return latest
}

// ---- Component --------------------------------------------------------------

function Sidebar({ collapsed, hidden, onToggle, onNewProject, onNewSession, onSessionSelect }: SidebarProps): React.ReactElement {
  const sessions = useCanvasStore((s) => s.sessions)
  const registeredProjects = useCanvasStore((s) => s.registeredProjects)
  const selectedSessionId = useCanvasStore((s) => s.selectedSessionId)
  const selectProject = useCanvasStore((s) => s.selectProject)
  const selectSession = useCanvasStore((s) => s.selectSession)
  const openViewer = useCanvasStore((s) => s.openViewer)
  const expandedProjectSlugs = useCanvasStore((s) => s.expandedProjectSlugs)
  const setExpandedProjectSlugs = useCanvasStore((s) => s.setExpandedProjectSlugs)

  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    items: ContextMenuItem[]
  } | null>(null)

  const handleProjectContextMenu = (e: React.MouseEvent, projectSlug: string) => {
    e.preventDefault()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: 'Remove from Canvas',
          onClick: () => {
            window.electronAPI.unregisterProject(projectSlug)
          },
        },
      ],
    })
  }

  const handleSessionContextMenu = (e: React.MouseEvent, session: SessionState) => {
    e.preventDefault()
    const items: ContextMenuItem[] = [
      {
        label: 'Remove from view',
        onClick: () => {
          window.electronAPI.hideSession(session.id)
        },
      },
    ]
    if (session.status === 'running' || session.status === 'active' || session.status === 'needs_input') {
      items.unshift({
        label: 'Stop',
        danger: true,
        onClick: () => {
          window.electronAPI.stopSession(session.id)
        },
      })
    }
    setContextMenu({ x: e.clientX, y: e.clientY, items })
  }

  // Toggle expansion: only one project expanded at a time
  const handleToggleProject = (slug: string) => {
    const isExpanded = expandedProjectSlugs.includes(slug)
    if (isExpanded) {
      // Collapse it
      setExpandedProjectSlugs([])
    } else {
      // Expand this one, collapse all others
      setExpandedProjectSlugs([slug])
    }
    selectProject(slug)
  }

  // Derive projects, sorted by most recently active
  const projects: Project[] = useMemo(() => {
    const projectMap = new Map<string, Project>()

    for (const rp of registeredProjects) {
      projectMap.set(rp.slug, { slug: rp.slug, name: rp.name, path: rp.path, sessions: [] })
    }

    for (const session of sessions) {
      const existing = projectMap.get(session.projectSlug)
      if (existing) {
        existing.sessions.push(session)
      } else {
        projectMap.set(session.projectSlug, {
          slug: session.projectSlug,
          name: session.projectName,
          path: '',
          sessions: [session],
        })
      }
    }

    // Sort by most recently active first
    return Array.from(projectMap.values()).sort((a, b) => {
      return getProjectLastActivity(b) - getProjectLastActivity(a)
    })
  }, [sessions, registeredProjects])

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
        visibility: hidden ? 'hidden' : 'visible',
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
            color: 'var(--text-very-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-very-muted)'
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polyline points="3,1 7,5 3,9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
        </button>
      )}

      {/* Expanded sidebar — NO "PROJECTS" header, NO "HISTORY" label */}
      {!collapsed && (
        <>
          {/* Collapse toggle — small chevron at top right (only when projects exist) */}
          {projects.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 8px 4px' }}>
            <button
              data-testid="sidebar-toggle"
              onClick={onToggle}
              style={{
                color: 'var(--text-very-muted)',
                background: 'none',
                border: 'none',
                padding: '2px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-very-muted)'
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                <polyline points="7,1 3,5 7,9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            </button>
          </div>
          )}

          {/* Project list */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {/* Empty state — Step 1: no projects yet */}
            {projects.length === 0 && (
              <div
                data-testid="sidebar-empty"
                style={{
                  fontSize: '11px',
                  color: 'var(--text-very-muted)',
                  textAlign: 'center',
                  padding: '24px 16px',
                }}
              >
                No projects yet
              </div>
            )}

            {/* Project list — sorted by most recently active */}
            {projects.map((project) => {
              const isExpanded = expandedProjectSlugs.includes(project.slug)

              // All sessions sorted by most recent first (active first, then completed)
              const allSessions = [...project.sessions].sort((a, b) => {
                // Active sessions first
                const aActive = ACTIVE_STATUSES.has(a.status) ? 1 : 0
                const bActive = ACTIVE_STATUSES.has(b.status) ? 1 : 0
                if (aActive !== bActive) return bActive - aActive
                // Then by most recent
                const aTime = a.endedAt ? new Date(a.endedAt).getTime() : a.startedAt ? new Date(a.startedAt).getTime() : 0
                const bTime = b.endedAt ? new Date(b.endedAt).getTime() : b.startedAt ? new Date(b.startedAt).getTime() : 0
                return bTime - aTime
              })

              // For collapsed: show last activity time
              const lastActivity = getProjectLastActivity(project)
              const lastActivityStr = lastActivity > 0 ? formatRelativeTime(new Date(lastActivity).toISOString()) : ''

              if (isExpanded) {
                // ── EXPANDED PROJECT: tinted container with sessions ──
                return (
                  <div
                    key={project.slug}
                    style={{
                      background: 'rgba(0,0,0,0.025)',
                      borderRadius: 4,
                      margin: '0 6px 6px',
                      padding: '4px 0',
                    }}
                  >
                    {/* Project header row: ▾ chevron + NAME + [+] button */}
                    <div
                      data-testid="project-item"
                      data-expanded="true"
                      onClick={() => handleToggleProject(project.slug)}
                      onContextMenu={(e) => handleProjectContextMenu(e, project.slug)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '8px 8px 4px',
                        cursor: 'pointer',
                        userSelect: 'none',
                        gap: 4,
                      }}
                    >
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                        {'\u25BE'}
                      </span>
                      <span
                        data-testid="project-name"
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          color: 'var(--text-muted)',
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {project.name}
                      </span>
                      <button
                        data-testid="new-session-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          onNewSession?.(project.slug, project.path)
                        }}
                        style={{
                          fontSize: 14,
                          color: 'var(--text-very-muted)',
                          background: 'none',
                          border: 'none',
                          lineHeight: 1,
                          padding: '0 2px',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                        title="New session"
                      >
                        +
                      </button>
                    </div>

                    {/* Session rows — indented with left border */}
                    {allSessions.map((session) => (
                      <div key={session.id} onContextMenu={(e) => handleSessionContextMenu(e, session)}>
                        <UnifiedSessionRow
                          session={session}
                          isSelected={selectedSessionId === session.id}
                          onSelect={() => {
                            selectSession(session.id)
                            onSessionSelect?.(session.id, session.workDir ?? '')
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )
              } else {
                // ── COLLAPSED PROJECT: ▸ chevron + NAME + last activity ──
                return (
                  <div
                    key={project.slug}
                    data-testid="project-item"
                    data-expanded="false"
                    onClick={() => handleToggleProject(project.slug)}
                    onContextMenu={(e) => handleProjectContextMenu(e, project.slug)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '7px 14px',
                      cursor: 'pointer',
                      userSelect: 'none',
                      gap: 6,
                      transition: 'background 0.12s ease',
                    }}
                    onMouseEnter={(e) => {
                      ;(e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(0,0,0,0.03)'
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'
                    }}
                  >
                    <span style={{ fontSize: 10, color: 'var(--text-very-muted)', flexShrink: 0 }}>
                      {'\u25B8'}
                    </span>
                    <span
                      data-testid="project-name"
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: 'var(--text-very-muted)',
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {project.name}
                    </span>
                    {lastActivityStr && (
                      <span style={{ fontSize: 10, color: 'var(--text-very-muted)', flexShrink: 0 }}>
                        {lastActivityStr}
                      </span>
                    )}
                  </div>
                )
              }
            })}
          </div>

          {/* Bottom: "Add project" button — always visible */}
          <div style={{ padding: '8px 12px' }}>
            <button
              data-testid="sidebar-add-btn"
              onClick={onNewProject}
              style={{
                width: '100%',
                padding: '6px 0',
                fontSize: 11,
                color: 'var(--text-muted)',
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: 4,
                cursor: 'pointer',
                textAlign: 'center',
              }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--text-muted)'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'
              }}
            >
              Add project
            </button>
          </div>
        </>
      )}

      {contextMenu && (
        <ContextMenu
          items={contextMenu.items}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
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

/**
 * Unified session row — used for ALL sessions (active + completed).
 * Shows: dot + name + status label
 * Indented under expanded project with left border.
 */
function UnifiedSessionRow({ session, isSelected, onSelect }: SessionRowProps): React.ReactElement {
  const isActive = ACTIVE_STATUSES.has(session.status)
  const isDone = session.status === 'done'

  // Build the status label
  let statusLabel = ''
  let statusColor = 'var(--text-very-muted)'

  if (session.status === 'running' || session.status === 'active') {
    statusLabel = isJustStarted(session.startedAt) ? 'just started' : 'running'
    statusColor = 'var(--amber)'
  } else if (session.status === 'needs_input') {
    statusLabel = 'needs input'
    statusColor = 'var(--amber)'
  } else if (session.status === 'loading') {
    statusLabel = 'loading\u2026'
    statusColor = 'var(--text-very-muted)'
  } else if (isDone) {
    // "done · 2h 14m"
    const duration = session.startedAt && session.endedAt
      ? formatDuration(session.startedAt, session.endedAt)
      : ''
    statusLabel = duration ? `done \u00B7 ${duration}` : 'done'
    statusColor = 'var(--green)'
  } else if (session.status === 'failed') {
    statusLabel = 'failed'
    statusColor = '#EF4444'
  } else if (session.status === 'stopped') {
    statusLabel = 'stopped'
    statusColor = 'var(--text-very-muted)'
  }

  return (
    <div
      data-testid="session-item"
      data-session-id={session.id}
      data-project-slug={session.projectSlug}
      data-selected={isSelected ? 'true' : 'false'}
      onClick={onSelect}
      style={{
        height: 32,
        padding: '0 8px 0 0',
        marginLeft: 14,
        paddingLeft: 12,
        borderLeft: isSelected ? '2px solid var(--amber)' : '2px solid var(--border)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        backgroundColor: isSelected ? 'var(--bg-sidebar-active)' : 'transparent',
        transition: 'background 0.12s ease',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          ;(e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(0,0,0,0.03)'
        }
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.backgroundColor = isSelected ? 'var(--bg-sidebar-active)' : 'transparent'
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
          fontSize: 12,
          fontWeight: isActive ? 600 : 400,
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
          fontSize: 10,
          flexShrink: 0,
          color: statusColor,
          whiteSpace: 'nowrap',
        }}
      >
        {statusLabel}
      </span>
    </div>
  )
}

export default Sidebar
