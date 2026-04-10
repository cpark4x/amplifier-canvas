import { useState, useEffect } from 'react'
import TerminalComponent from './components/Terminal'
import Sidebar from './components/Sidebar'
import Viewer from './components/Viewer'
import AddProjectModal from './components/AddProjectModal'
import { ToastContainer } from './components/Toast'
import { useCanvasStore } from './store'

// Register IPC listeners eagerly at module level (before React mount)
// so we catch the initial session push from main process on did-finish-load.
// The useEffect approach loses the first push because it fires after paint.
if (typeof window !== 'undefined' && window.electronAPI) {
  window.electronAPI.onSessionsChanged((sessions) => {
    useCanvasStore.getState().setSessions(sessions)
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
  const viewerOpen = useCanvasStore((s) => s.viewerOpen)
  const openViewer = useCanvasStore((s) => s.openViewer)
  const closeViewer = useCanvasStore((s) => s.closeViewer)
  const getSelectedSession = useCanvasStore((s) => s.getSelectedSession)

  const [showModal, setShowModal] = useState(false)
  const [showTerminal, setShowTerminal] = useState(false)
  const hasSession = selectedSessionId !== null || showTerminal

  // Restore workspace state on mount
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getWorkspaceState().then(({ state, isFirstTime }) => {
        if (!isFirstTime && state) {
          if (state.selectedProjectSlug) {
            useCanvasStore.getState().selectProject(state.selectedProjectSlug)
          }
          if (state.selectedSessionId) {
            useCanvasStore.getState().selectSession(state.selectedSessionId)
            useCanvasStore.getState().openViewer()
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
    } else {
      setWorkspaceLoaded(true)
    }
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

          {/* Settings (placeholder) */}
          <button
            data-testid="header-btn-settings"
            title="Settings"
            onClick={() => undefined}
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
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          onNewProject={() => setShowModal(true)}
        />

        {/* Center zone: welcome screen OR terminal depending on state */}
        {!hasSession ? (
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

            {/* Screen 2: Add Project modal */}
            {showModal && (
              <AddProjectModal
                onClose={() => setShowModal(false)}
                onCreateNew={(projectName) => {
                  const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
                  const amplifierHome = process.env['AMPLIFIER_HOME'] || `${process.env['HOME'] || '~'}/.amplifier`
                  const path = `${amplifierHome}/projects/${slug}`

                  window.electronAPI.registerProject(slug, path, projectName).then(() => {
                    useCanvasStore.getState().selectProject(slug)
                    useCanvasStore.getState().toggleProjectExpanded(slug)
                    setShowModal(false)
                    setShowTerminal(true)

                    setTimeout(() => {
                      if (window.electronAPI) {
                        window.electronAPI.sendTerminalInput('amplifier\r')
                      }
                    }, 300)
                  })
                }}
                onAddExisting={(project) => {
                  window.electronAPI.registerProject(project.slug, project.path, project.name).then(() => {
                    useCanvasStore.getState().selectProject(project.slug)
                    useCanvasStore.getState().toggleProjectExpanded(project.slug)
                    setShowModal(false)
                  })
                }}
              />
            )}
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
              <TerminalComponent />
            </div>
            <Viewer />
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
      <ToastContainer />
    </div>
  )
}

export default App
