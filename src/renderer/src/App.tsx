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

  return (
    <div id="app" style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* S5: Header bar */}
      <div
        data-testid="header-bar"
        style={{
          height: 38,
          minHeight: 38,
          backgroundColor: 'var(--bg-header)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 80, // room for macOS traffic lights
          WebkitAppRegion: 'drag' as unknown as string,
          fontSize: '13px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          letterSpacing: '0.04em',
        }}
      >
        <span style={{ WebkitAppRegion: 'no-drag' as unknown as string }}>
          Amplifier Canvas
        </span>
      </div>

      {/* Main content: sidebar + terminal + viewer */}
      <div style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
      }}>
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
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
        {selectedSessionId && <Viewer />}
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
