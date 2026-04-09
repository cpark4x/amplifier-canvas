import { useState } from 'react'
import TerminalComponent from './components/Terminal'
import Sidebar from './components/Sidebar'
import Viewer from './components/Viewer'
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
}

function App(): React.ReactElement {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const sessions = useCanvasStore((s) => s.sessions)
  const selectedSessionId = useCanvasStore((s) => s.selectedSessionId)

  const [showTerminal, setShowTerminal] = useState(false)
  const hasSession = selectedSessionId !== null || showTerminal

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              WebkitAppRegion: 'no-drag' as unknown as string,
            }}
          >
            Amplifier Canvas
          </span>
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
        />

        {/* Center zone: welcome screen OR terminal depending on state */}
        {!hasSession ? (
          /* Screen 1: Welcome — clean slate, no terminal */
          <div
            data-testid="welcome-main"
            style={{
              flex: 1,
              background: 'var(--bg-right)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
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
                onClick={() => setShowTerminal(true)}
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
                Terminal
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
    </div>
  )
}

export default App
