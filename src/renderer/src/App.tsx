import { useState, useEffect } from 'react'
import TerminalComponent from './components/Terminal'
import Sidebar from './components/Sidebar'
import Viewer from './components/Viewer'
import ProjectView from './components/ProjectView'
import AddProjectModal from './components/AddProjectModal'
import SettingsModal from './components/SettingsModal'
import ErrorBoundary from './components/ErrorBoundary'
import { ToastContainer } from './components/Toast'
import { useCanvasStore } from './store'

// Register IPC listeners eagerly at module level (before React mount)
// so we catch the initial session push from main process on did-finish-load.
// The useEffect approach loses the first push because it fires after paint.
if (typeof window !== 'undefined' && window.electronAPI) {
  // Register projects from main process (includes projects with zero visible sessions)
  window.electronAPI.onProjectsChanged((projects) => {
    for (const p of projects) {
      useCanvasStore.getState().registerProject(p.slug, p.name, p.path)
    }
  })
  window.electronAPI.onSessionsChanged((sessions) => {
    useCanvasStore.getState().setSessions(sessions)
    // Derive registered projects from the sessions we received
    const seen = new Set<string>()
    for (const s of sessions) {
      if (!seen.has(s.projectSlug)) {
        seen.add(s.projectSlug)
        useCanvasStore.getState().registerProject(s.projectSlug, s.projectName)
      }
    }
  })
  window.electronAPI.onFilesChanged(({ sessionId, files }) => {
    useCanvasStore.getState().updateFileActivity(sessionId, files)
  })
  window.electronAPI.onRunningSessionsToast(({ count }) => {
    useCanvasStore.getState().addToast({
      sessionId: 'app-quit',
      message: `${count} ${count === 1 ? 'session is' : 'sessions are'} still running. They'll continue in the background.`,
    })
  })
}

// Inline button style for header icon buttons (no hover state in inline styles —
// we handle hover via onMouseEnter/Leave).
const HEADER_BTN_STYLE: React.CSSProperties = {
  width: 26,
  height: 26,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 15,
  color: 'var(--text-very-muted)',
  background: 'none',
  border: 'none',
  borderRadius: 3,
  cursor: 'pointer',
  WebkitAppRegion: 'no-drag' as unknown as string,
  flexShrink: 0,
}

function App(): React.ReactElement {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false)
  const sessions = useCanvasStore((s) => s.sessions)
  const selectedSessionId = useCanvasStore((s) => s.selectedSessionId)
  const selectedProjectSlug = useCanvasStore((s) => s.selectedProjectSlug)
  const expandedProjectSlugs = useCanvasStore((s) => s.expandedProjectSlugs)
  const viewMode = useCanvasStore((s) => s.viewMode)
  const viewerOpen = useCanvasStore((s) => s.viewerOpen)
  const openViewer = useCanvasStore((s) => s.openViewer)
  const closeViewer = useCanvasStore((s) => s.closeViewer)
  const getSelectedSession = useCanvasStore((s) => s.getSelectedSession)

  const [showModal, setShowModal] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [showTerminal, setShowTerminal] = useState(false)
  // The terminal PTY session ID — either an Amplifier session ID (resume) or a
  // synthetic ID like 'terminal-<slug>' (new session, before Amplifier assigns one)
  const [terminalSessionId, setTerminalSessionId] = useState<string | null>(null)
  const hasSession = selectedSessionId !== null || showTerminal

  // Hydrate store and restore workspace on mount.
  // Chain: pull projects + sessions FIRST, then restore workspace state.
  // This eliminates race conditions where did-finish-load pushes arrive
  // before the renderer's IPC listeners are ready.
  useEffect(() => {
    if (!window.electronAPI) {
      setWorkspaceLoaded(true)
      return
    }

    const api = window.electronAPI

    // Step 1: Pull projects and sessions in parallel (both pull-based, race-safe)
    const projectsP = api.getRegisteredProjects
      ? api.getRegisteredProjects().catch(() => [] as Array<{ slug: string; name: string; path: string }>)
      : Promise.resolve([] as Array<{ slug: string; name: string; path: string }>)

    const sessionsP = api.getInitialSessions
      ? api.getInitialSessions().catch(() => [] as import('../../shared/types').SessionState[])
      : Promise.resolve([] as import('../../shared/types').SessionState[])

    const workspaceP = api.getWorkspaceState().catch(() => ({ state: null, isFirstTime: true }))

    Promise.all([projectsP, sessionsP, workspaceP]).then(([projects, sessions, { state, isFirstTime }]) => {
      const store = useCanvasStore.getState()

      // Step 2a: Hydrate projects
      for (const p of projects) {
        store.registerProject(p.slug, p.name, p.path)
      }

      // Step 2b: Hydrate sessions (only if pull returned data and no push beat us)
      if (sessions.length > 0 && store.sessions.length === 0) {
        store.setSessions(sessions)
      }

      // Step 3: NOW restore workspace state (sessions are guaranteed to be loaded)
      if (!isFirstTime && state) {
        if (state.selectedProjectSlug) {
          useCanvasStore.getState().selectProject(state.selectedProjectSlug)
        }
        if (state.selectedSessionId) {
          const currentSessions = useCanvasStore.getState().sessions
          const exists = currentSessions.some((s) => s.id === state.selectedSessionId && !s.hidden)
          if (exists) {
            useCanvasStore.getState().selectSession(state.selectedSessionId)
            useCanvasStore.getState().openViewer()
          }
        }
        if (state.expandedProjectSlugs.length > 0) {
          useCanvasStore.getState().setExpandedProjectSlugs(state.expandedProjectSlugs)
        }
        setSidebarCollapsed(state.sidebarCollapsed)
      }

      setWorkspaceLoaded(true)
    }).catch(() => {
      setWorkspaceLoaded(true)
    })
  }, [])

  // Persist workspace state on every relevant change
  useEffect(() => {
    if (!workspaceLoaded || !window.electronAPI) return
    window.electronAPI.saveWorkspaceState({
      selectedProjectSlug,
      expandedProjectSlugs,
      selectedSessionId,
      sidebarCollapsed,
    })
  }, [selectedSessionId, selectedProjectSlug, expandedProjectSlugs, sidebarCollapsed, workspaceLoaded])

  // Test utility: reset app state back to the welcome screen.
  // Called by E2E tests that need the welcome screen to be visible
  // even when another test file in the same Playwright worker has already
  // selected a session or created a project.
  ;(window as unknown as Record<string, unknown>).__resetToWelcome = () => {
    setShowTerminal(false)
    useCanvasStore.setState({ selectedSessionId: null, viewerOpen: false })
  }

  // Derive pane title from selected session
  const selectedSession = getSelectedSession()
  const paneTitle = selectedSession
    ? `${selectedSession.title ?? selectedSession.id} · ${selectedSession.projectName}`
    : 'Terminal'

  return (
    <div id="app" style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header bar */}
      <div
        data-testid="header-bar"
        style={{
          height: 38,
          minHeight: 38,
          backgroundColor: 'var(--bg-header)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          paddingLeft: 80, // room for macOS traffic lights
          WebkitAppRegion: 'drag' as unknown as string,
        }}
      >
        {/* Left: logo + app name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, WebkitAppRegion: 'no-drag' as unknown as string }}>
          {/* Logo mark — two offset squares */}
          <svg
            data-testid="header-logo"
            width="22"
            height="22"
            viewBox="0 0 512 512"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ flexShrink: 0, display: 'block' }}
          >
            <rect x="116" y="116" width="240" height="240" rx="28" stroke="#1C1A16" strokeWidth="18" fill="none"/>
            <rect x="156" y="156" width="240" height="240" rx="28" stroke="#C4784A" strokeWidth="18" fill="none"/>
          </svg>
          <span
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}
          >
            Amplifier Canvas
          </span>
        </div>

        {/* Right: icon buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, WebkitAppRegion: 'no-drag' as unknown as string }}>
          {/* Layout / viewer toggle */}
          <button
            data-testid="header-btn-layout"
            title="Layout"
            onClick={() => viewerOpen ? closeViewer() : openViewer()}
            style={HEADER_BTN_STYLE}
            onMouseEnter={(e) => { ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.06)' }}
            onMouseLeave={(e) => { ;(e.currentTarget as HTMLButtonElement).style.background = 'none' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <line x1="9" y1="3" x2="9" y2="21"/>
            </svg>
          </button>

          {/* Notifications (placeholder) */}
          <button
            data-testid="header-btn-notifications"
            title="Notifications"
            onClick={() => undefined}
            style={HEADER_BTN_STYLE}
            onMouseEnter={(e) => { ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.06)' }}
            onMouseLeave={(e) => { ;(e.currentTarget as HTMLButtonElement).style.background = 'none' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          </button>

          {/* Settings */}
          <button
            data-testid="header-btn-settings"
            title="Settings"
            onClick={() => setSettingsOpen(true)}
            style={HEADER_BTN_STYLE}
            onMouseEnter={(e) => { ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.06)' }}
            onMouseLeave={(e) => { ;(e.currentTarget as HTMLButtonElement).style.background = 'none' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Main content: sidebar + center + optional right panel */}
      <div style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
      }}>
        <ErrorBoundary fallbackLabel="Sidebar"><Sidebar
          collapsed={sidebarCollapsed}
          hidden={!workspaceLoaded}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          onNewProject={() => setShowModal(true)}
          onNewSession={(projectSlug, projectPath) => {
            const ptyId = `terminal-${projectSlug}-${Date.now()}`
            // Show optimistic placeholder in sidebar immediately
            const rp = useCanvasStore.getState().registeredProjects.find((p) => p.slug === projectSlug)
            useCanvasStore.getState().addOptimisticSession(projectSlug, rp?.name ?? projectSlug)
            // CRITICAL: clear viewMode so terminal pane renders (ProjectView takes precedence
            // over Terminal when viewMode === 'project'). Without this, starting a new session
            // from within the project view leaves the terminal hidden forever.
            useCanvasStore.getState().setViewMode('session')
            setTerminalSessionId(ptyId)
            setShowTerminal(true)
            window.electronAPI.spawnPty(ptyId, 80, 24, projectPath, projectSlug).then(() => {
              setTimeout(() => {
                window.electronAPI.sendTerminalInput(ptyId, 'amplifier\r')
              }, 200)
            })
          }}
          onSessionSelect={(sessionId, workDir) => {
            // Switch terminal to this session's PTY (spawn if needed, replay buffer)
            // CRITICAL: clear viewMode so Terminal renders instead of ProjectView.
            useCanvasStore.getState().setViewMode('session')
            setTerminalSessionId(sessionId)
            setShowTerminal(true)
            // Ensure a PTY exists for this session — if newly spawned, resume the session
            window.electronAPI.spawnPty(sessionId, 80, 24, workDir).then((result) => {
              if (result.success && !result.alreadyExists && !sessionId.startsWith('optimistic-')) {
                // New PTY for a real Amplifier session — auto-resume it
                setTimeout(() => {
                  window.electronAPI.sendTerminalInput(sessionId, `amplifier session resume ${sessionId}\r`)
                }, 200)
              }
              // If alreadyExists, the PTY is already running — just show it (buffer replay handles display)
            }).catch(() => {
              // PTY spawn can fail in test environments — don't crash
            })
          }}
        /></ErrorBoundary>

        {/* Center zone: welcome screen, project view, OR terminal depending on state */}
        {viewMode === 'project' && selectedProjectSlug ? (
          /* Project intelligence view */
          <ErrorBoundary fallbackLabel="Project View"><ProjectView /></ErrorBoundary>
        ) : !hasSession ? (
          /* Screen 1 + 2: Welcome with optional modal overlay */
          <div
            data-testid="welcome-main"
            style={{
              flex: 1,
              background: 'var(--bg-right)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
            }}>
              {/* Logo mark — two offset squares */}
              <svg
                width="80"
                height="80"
                viewBox="0 0 512 512"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{ marginBottom: 20 }}
              >
                <rect x="116" y="116" width="240" height="240" rx="28" stroke="#1C1A16" strokeWidth="18" fill="none"/>
                <rect x="156" y="156" width="240" height="240" rx="28" stroke="#C4784A" strokeWidth="18" fill="none"/>
              </svg>
              <div style={{
                fontSize: '28px',
                fontWeight: 700,
                fontStyle: 'italic',
                color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
              }}>
                Welcome to Canvas
              </div>
              <div style={{
                fontSize: '14px',
                color: 'var(--text-muted)',
                marginTop: '8px',
                maxWidth: '340px',
                lineHeight: 1.5,
              }}>
                Your workspace for Amplifier sessions, files, and previews.
              </div>
              <button
                data-testid="welcome-btn"
                onClick={() => setShowModal(true)}
                style={{
                  marginTop: '24px',
                  padding: '9px 18px',
                  border: '1px solid #3A3530',
                  background: 'var(--bg-modal)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontFamily: 'var(--font-ui)',
                }}
              >
                Create your first project <span style={{ color: 'var(--amber)' }}>{'\u2192'}</span>
              </button>
            </div>

          </div>
        ) : (
          /* Screens 3+: Terminal zone with optional viewer */
          <>
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column' as const,
              overflow: 'hidden',
            }}>
              {/* Pane title bar above terminal */}
              <div
                data-testid="pane-title"
                style={{
                  height: 28,
                  minHeight: 28,
                  backgroundColor: 'var(--bg-pane-title)',
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: 12,
                  paddingRight: 12,
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  flexShrink: 0,
                }}
              >
                {paneTitle}
                {selectedSession && (
                  <span
                    style={{
                      marginLeft: 'auto',
                      fontSize: '10px',
                      color: 'var(--text-very-muted)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    Ctrl+C to return to shell
                  </span>
                )}
              </div>
              {terminalSessionId && (
                <TerminalComponent key={terminalSessionId} sessionId={terminalSessionId} />
              )}
            </div>
            {viewerOpen && <ErrorBoundary fallbackLabel="File Viewer"><Viewer /></ErrorBoundary>}
          </>
        )}
      </div>

      {/* Debug elements for e2e tests — hidden */}
      <div data-testid="debug-session-count" style={{ display: 'none' }}>
        {sessions.length}
      </div>
      <div data-testid="debug-session-workdirs" style={{ display: 'none' }}>
        {JSON.stringify(sessions.map((s) => ({ id: s.id, workDir: s.workDir })))}
      </div>
      <div data-testid="debug-session-titles" style={{ display: 'none' }}>
        {JSON.stringify(
          sessions.map((s) => ({
            id: s.id,
            title: s.title,
            status: s.status,
            promptCount: s.promptCount,
            filesChangedCount: s.filesChangedCount,
          })),
        )}
      </div>
      {/* Add Project modal — rendered outside the hasSession gate so it
          works from both the welcome screen and the terminal view */}
      {showModal && (
        <AddProjectModal
          onClose={() => setShowModal(false)}
          onCreateNew={(projectName) => {
            const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
            const amplifierHome = (typeof process !== 'undefined' ? process.env['AMPLIFIER_HOME'] : undefined) || `${(typeof process !== 'undefined' ? process.env['HOME'] : undefined) || '~'}/.amplifier`
            const projPath = `${amplifierHome}/projects/${slug}`
            const ptyId = `terminal-${slug}`

            window.electronAPI.registerProject(slug, projPath, projectName)
              .then((result) => {
                if (!result.success) {
                  console.error('[App] registerProject failed:', result.error)
                  return
                }
                useCanvasStore.getState().registerProject(slug, projectName, projPath)
                useCanvasStore.getState().selectProject(slug)
                useCanvasStore.getState().setExpandedProjectSlugs([slug])
                // Show optimistic placeholder in sidebar immediately
                useCanvasStore.getState().addOptimisticSession(slug, projectName)
                // CRITICAL: clear viewMode so Terminal renders instead of ProjectView.
                useCanvasStore.getState().setViewMode('session')
                setShowModal(false)
                setTerminalSessionId(ptyId)
                setShowTerminal(true)

                window.electronAPI.spawnPty(ptyId, 80, 24, projPath, slug).then(() => {
                  setTimeout(() => {
                    window.electronAPI.sendTerminalInput(ptyId, 'amplifier\r')
                  }, 200)
                }).catch((err: unknown) => {
                  console.error('[App] spawnPty failed:', err)
                })
              })
              .catch((err: unknown) => {
                console.error('[App] registerProject IPC error:', err)
              })
          }}
          onAddExisting={(project) => {
            useCanvasStore.getState().registerProject(project.slug, project.name, project.path)
            useCanvasStore.getState().selectProject(project.slug)
            useCanvasStore.getState().setExpandedProjectSlugs([project.slug])
            setShowModal(false)
          }}
          onNewSessionInProject={(project) => {
            const ptyId = `terminal-${project.slug}-${Date.now()}`
            useCanvasStore.getState().registerProject(project.slug, project.name, project.path)
            useCanvasStore.getState().selectProject(project.slug)
            useCanvasStore.getState().setExpandedProjectSlugs([project.slug])
            // Show optimistic placeholder in sidebar immediately
            useCanvasStore.getState().addOptimisticSession(project.slug, project.name)
            // CRITICAL: clear viewMode so Terminal renders instead of ProjectView.
            useCanvasStore.getState().setViewMode('session')
            setShowModal(false)
            setTerminalSessionId(ptyId)
            setShowTerminal(true)

            window.electronAPI.spawnPty(ptyId, 80, 24, project.path, project.slug).then(() => {
              setTimeout(() => {
                window.electronAPI.sendTerminalInput(ptyId, 'amplifier\r')
              }, 200)
            })
          }}
          onResumeSession={(project, sessionId) => {
            useCanvasStore.getState().registerProject(project.slug, project.name, project.path)
            useCanvasStore.getState().selectProject(project.slug)
            useCanvasStore.getState().selectSession(sessionId)
            useCanvasStore.getState().setExpandedProjectSlugs([project.slug])
            setShowModal(false)
            setTerminalSessionId(sessionId)
            setShowTerminal(true)

            window.electronAPI.spawnPty(sessionId, 80, 24, project.path).then(() => {
              setTimeout(() => {
                window.electronAPI.sendTerminalInput(sessionId, `amplifier session resume ${sessionId}\r`)
              }, 200)
            })
          }}
        />
      )}
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ToastContainer />
    </div>
  )
}

export default App
