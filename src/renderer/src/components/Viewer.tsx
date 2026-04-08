import { useState, useEffect } from 'react'
import { useCanvasStore } from '../store'
import FileBrowser from './FileBrowser'
import FileRenderer from './FileRenderer'
import type { FileActivity, SessionStatus } from '../../../shared/types'

const STATUS_COLORS: Record<SessionStatus, string> = {
  running: '#F59E0B',
  active: '#F59E0B',
  needs_input: '#F59E0B',
  done: '#4CAF74',
  failed: '#EF4444',
}

const OPERATION_COLORS: Record<FileActivity['operation'], string> = {
  read: 'var(--text-muted)',
  write: '#F59E0B',
  edit: '#F59E0B',
  create: '#4CAF74',
  delete: '#EF4444',
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
        width: 340,
        minWidth: 340,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-right)',
        borderLeft: '1px solid var(--border)',
        overflow: 'hidden',
      }}
    >
      {/* Viewer header */}
      <div
        data-testid="viewer-header"
        style={{
          padding: '10px 12px',
          borderBottom: '1px solid var(--border)',
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
            backgroundColor: STATUS_COLORS[session.status] || 'var(--text-muted)',
            display: 'inline-block',
          }}
        />
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--text-primary)',
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
              color: 'var(--text-muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {session.id.slice(0, 8)}
          </div>
        </div>
        <button
          data-testid="viewer-close"
          aria-label="Close viewer"
          onClick={() => selectSession(null)}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#1C1A16' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#8A8278' }}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            color: 'var(--text-muted)',
            padding: '2px 4px',
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      {/* Recent files quick access */}
      {session.recentFiles.length > 0 && (
        <div
          data-testid="recent-files"
          style={{
            padding: '6px 12px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            gap: '4px',
            flexWrap: 'wrap',
            maxHeight: '60px',
            overflow: 'hidden',
          }}
        >
          {[...new Map(session.recentFiles.map((f) => [f.path, f])).values()]
            .slice(-5)
            .map((file) => {
              const fileName = file.path.split('/').pop() || file.path
              const absolutePath = session.workDir
                ? `${session.workDir}/${file.path}`
                : file.path
              return (
                <span
                  key={file.path}
                  data-testid="recent-file-item"
                  onClick={() => setSelectedFilePath(absolutePath)}
                  style={{
                    fontSize: '10px',
                    cursor: 'pointer',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    backgroundColor: 'rgba(0,0,0,0.04)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span
                    data-testid="operation-badge"
                    style={{
                      fontSize: '8px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      color: '#fff',
                      backgroundColor: OPERATION_COLORS[file.operation] || 'var(--text-muted)',
                      borderRadius: '2px',
                      padding: '0px 3px',
                      lineHeight: '14px',
                    }}
                  >
                    {file.operation}
                  </span>
                  <span style={{ color: 'var(--text-primary)' }}>{fileName}</span>
                </span>
              )
            })}
        </div>
      )}

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
              aria-label="Back to files"
              onClick={() => setSelectedFilePath(null)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '11px',
                color: 'var(--text-muted)',
                padding: '4px 0 8px 0',
              }}
            >
              ← Back to files
            </button>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                marginBottom: '8px',
                paddingBottom: '6px',
                borderBottom: '1px solid var(--border)',
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
              color: 'var(--text-muted)',
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
