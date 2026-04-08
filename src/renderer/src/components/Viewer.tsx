import { useState, useEffect } from 'react'
import { useCanvasStore } from '../store'
import FileBrowser from './FileBrowser'
import FileRenderer from './FileRenderer'
import type { SessionStatus } from '../../../shared/types'

const STATUS_COLORS: Record<SessionStatus, string> = {
  running: '#3B82F6',
  active: '#3B82F6',
  needs_input: '#F59E0B',
  done: '#10B981',
  failed: '#EF4444',
}

function Viewer(): React.ReactElement | null {
  const selectedSessionId = useCanvasStore((s) => s.selectedSessionId)
  const getSelectedSession = useCanvasStore((s) => s.getSelectedSession)
  const selectSession = useCanvasStore((s) => s.selectSession)
  const session = getSelectedSession()
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)

  // Reset selected file when session changes
  useEffect(() => {
    setSelectedFilePath(null)
  }, [selectedSessionId])

  if (!selectedSessionId || !session) {
    return null
  }

  return (
    <div
      data-testid="viewer-panel"
      style={{
        width: 350,
        minWidth: 350,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#F2F0EB',
        borderLeft: '1px solid rgba(0,0,0,0.08)',
        overflow: 'hidden',
      }}
    >
      {/* Viewer header */}
      <div
        data-testid="viewer-header"
        style={{
          padding: '10px 12px',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          minHeight: 40,
        }}
      >
        <span
          data-testid="viewer-status-dot"
          style={{
            width: 8,
            height: 8,
            minWidth: 8,
            borderRadius: '50%',
            backgroundColor: STATUS_COLORS[session.status] || '#8B8B90',
            display: 'inline-block',
          }}
        />
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: '#2C2825',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {session.projectName}
          </div>
          <div
            style={{
              fontSize: '10px',
              color: '#8B8B90',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {session.id}
          </div>
        </div>
        <button
          data-testid="viewer-close"
          onClick={() => selectSession(null)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            color: '#8B8B90',
            padding: '2px 4px',
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      {/* Content area */}
      <div
        data-testid="viewer-content"
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '12px',
        }}
      >
        {selectedFilePath ? (
          <div>
            <button
              data-testid="viewer-back-to-files"
              onClick={() => setSelectedFilePath(null)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '11px',
                color: '#3B82F6',
                padding: '4px 0 8px 0',
              }}
            >
              ← Back to files
            </button>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#2C2825',
                marginBottom: '8px',
                paddingBottom: '6px',
                borderBottom: '1px solid rgba(0,0,0,0.08)',
              }}
            >
              {selectedFilePath.split('/').pop()}
            </div>
            <FileRenderer filePath={selectedFilePath} />
          </div>
        ) : session.workDir ? (
          <FileBrowser
            rootPath={session.workDir}
            onSelectFile={(filePath) => setSelectedFilePath(filePath)}
          />
        ) : (
          <div
            style={{
              color: '#8B8B90',
              fontSize: '12px',
              textAlign: 'center',
              marginTop: '40px',
            }}
          >
            No project directory available
          </div>
        )}
      </div>
    </div>
  )
}

export default Viewer