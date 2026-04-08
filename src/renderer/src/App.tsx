import { useState } from 'react'
import TerminalComponent from './components/Terminal'
import Sidebar from './components/Sidebar'
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
          height: 32,
          minHeight: 32,
          backgroundColor: '#F5F3EE',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 80, // room for macOS traffic lights
          WebkitAppRegion: 'drag' as unknown as string,
          fontSize: '11px',
          color: '#8B8B90',
          letterSpacing: '0.04em',
        }}
      >
        <span style={{ WebkitAppRegion: 'no-drag' as unknown as string }}>
          Amplifier Canvas
        </span>
      </div>

      {/* Main content: sidebar + terminal */}
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
          overflow: 'hidden',
          padding: '4px',
        }}>
          <TerminalComponent />
        </div>
      </div>

      {/* Debug element for e2e tests — hidden */}
      <div data-testid="debug-session-count" style={{ display: 'none' }}>
        {sessions.length}
      </div>
    </div>
  )
}

export default App
