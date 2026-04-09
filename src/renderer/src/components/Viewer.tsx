import { useState, useEffect } from 'react'
import { useCanvasStore } from '../store'
import FileBrowser from './FileBrowser'
import FileRenderer from './FileRenderer'

type PrimaryTab = 'FILES' | 'APP' | 'ANALYSIS' | 'CHANGES'

interface OpenFile {
  path: string
  name: string
}

function Viewer(): React.ReactElement | null {
  const viewerOpen = useCanvasStore((s) => s.viewerOpen)
  const closeViewer = useCanvasStore((s) => s.closeViewer)
  const getSelectedSession = useCanvasStore((s) => s.getSelectedSession)
  const session = getSelectedSession()

  const [primaryTab, setPrimaryTab] = useState<PrimaryTab>('FILES')
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([])
  const [activeFileIdx, setActiveFileIdx] = useState<number>(0)
  const [showBrowser, setShowBrowser] = useState(false)
  const [appUrl, setAppUrl] = useState<string | null>(null)

  // Reset when viewer closes
  useEffect(() => {
    if (!viewerOpen) {
      setOpenFiles([])
      setActiveFileIdx(0)
      setShowBrowser(false)
      setAppUrl(null)
    }
  }, [viewerOpen])

  if (!viewerOpen) return null

  const primaryTabs: PrimaryTab[] = ['FILES', 'APP', 'ANALYSIS', 'CHANGES']
  const activeFile = openFiles[activeFileIdx] || null

  function openFile(path: string): void {
    const name = path.split('/').pop() || path
    const existingIdx = openFiles.findIndex((f) => f.path === path)
    if (existingIdx >= 0) {
      setActiveFileIdx(existingIdx)
    } else {
      const newFiles = [...openFiles, { path, name }]
      setOpenFiles(newFiles)
      setActiveFileIdx(newFiles.length - 1)
    }
    setShowBrowser(false)
    setPrimaryTab('FILES')
  }

  function closeFile(idx: number): void {
    const newFiles = openFiles.filter((_, i) => i !== idx)
    setOpenFiles(newFiles)
    if (activeFileIdx >= newFiles.length) {
      setActiveFileIdx(Math.max(0, newFiles.length - 1))
    } else if (activeFileIdx > idx) {
      setActiveFileIdx(activeFileIdx - 1)
    }
  }

  function setAppPreview(url: string): void {
    setAppUrl(url)
    setPrimaryTab('APP')
  }

  // Expose for external use (e.g. from terminal file detection)
  ;(window as unknown as Record<string, unknown>).__canvasOpenFile = openFile
  ;(window as unknown as Record<string, unknown>).__canvasSetAppPreview = setAppPreview

  const workDir = session?.workDir || null

  return (
    <div
      data-testid="viewer-panel"
      style={{
        width: 340,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-right)',
        borderLeft: '1px solid var(--border)',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Primary tab row */}
      <div
        data-testid="primary-tabs"
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          height: 36,
          borderBottom: '1px solid var(--border)',
          backgroundColor: 'var(--bg-header)',
          padding: '0 12px',
          gap: 20,
          flexShrink: 0,
        }}
      >
        {primaryTabs.map((tab) => (
          <button
            key={tab}
            data-testid={`tab-${tab.toLowerCase()}`}
            onClick={() => setPrimaryTab(tab)}
            style={{
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              padding: '0 10px',
              height: '100%',
              border: 'none',
              borderBottom: primaryTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
              background: 'none',
              cursor: 'pointer',
              color: primaryTab === tab ? 'var(--text-primary)' : 'var(--text-very-muted)',
            }}
          >
            {tab}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          data-testid="viewer-close"
          aria-label="Close viewer"
          onClick={closeViewer}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '13px',
            color: 'var(--text-muted)',
            padding: '2px 4px',
            lineHeight: 1,
          }}
        >
          {'\u2715'}
        </button>
      </div>

      {/* FILES tab content */}
      {primaryTab === 'FILES' && (
        <>
          {/* Secondary tab row: browse + file tabs */}
          <div
            data-testid="secondary-tabs"
            style={{
              display: 'flex',
              alignItems: 'center',
              height: 30,
              borderBottom: '1px solid var(--border)',
              backgroundColor: 'var(--bg-header)',
              padding: '0 8px',
              gap: 2,
              overflowX: 'auto',
              flexShrink: 0,
            }}
          >
            <button
              data-testid="browse-btn"
              onClick={() => setShowBrowser(!showBrowser)}
              title="Browse files"
              style={{
                fontSize: '12px',
                width: 24,
                height: 22,
                border: 'none',
                borderRadius: 3,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                background: showBrowser ? 'rgba(0,0,0,0.08)' : 'none',
                color: showBrowser ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              {'\u25A6'}
            </button>
            {openFiles.map((file, idx) => (
              <div
                key={file.path}
                data-testid="file-tab"
                onClick={() => { setActiveFileIdx(idx); setShowBrowser(false) }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 6px',
                  fontSize: '10px',
                  cursor: 'pointer',
                  borderRadius: 3,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  backgroundColor: idx === activeFileIdx && !showBrowser ? 'rgba(0,0,0,0.08)' : 'transparent',
                  color: idx === activeFileIdx && !showBrowser ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontWeight: idx === activeFileIdx && !showBrowser ? 600 : 400,
                }}
              >
                {file.name}
                <span
                  data-testid="file-tab-close"
                  onClick={(e) => { e.stopPropagation(); closeFile(idx) }}
                  style={{
                    cursor: 'pointer',
                    fontSize: '10px',
                    color: 'var(--text-very-muted)',
                    marginLeft: 2,
                  }}
                >
                  {'\u00D7'}
                </span>
              </div>
            ))}
          </div>

          {/* Panel content */}
          <div
            data-testid="panel-content"
            style={{ flex: 1, overflow: 'auto', padding: 16 }}
          >
            {showBrowser && workDir ? (
              <FileBrowser
                rootPath={workDir}
                onSelectFile={(filePath) => openFile(filePath)}
              />
            ) : activeFile ? (
              <FileRenderer filePath={activeFile.path} />
            ) : (
              <div
                style={{
                  color: 'var(--text-very-muted)',
                  fontSize: '11px',
                  textAlign: 'center',
                  marginTop: 60,
                }}
              >
                Click {'\u25A6'} to browse files
              </div>
            )}
          </div>
        </>
      )}

      {/* APP tab content */}
      {primaryTab === 'APP' && (
        <>
          {appUrl ? (
            <>
              <div
                data-testid="app-address-bar"
                style={{
                  height: 28,
                  backgroundColor: 'var(--bg-header)',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 10px',
                }}
              >
                <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  {appUrl}
                </span>
              </div>
              <webview
                data-testid="app-preview"
                src={appUrl}
                style={{ flex: 1 }}
              />
            </>
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-very-muted)',
                fontSize: '11px',
              }}
            >
              No app running. Start a dev server to see the preview.
            </div>
          )}
        </>
      )}

      {/* ANALYSIS tab content */}
      {primaryTab === 'ANALYSIS' && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-very-muted)',
            fontSize: '11px',
          }}
        >
          Analysis view coming soon
        </div>
      )}

      {/* CHANGES tab content */}
      {primaryTab === 'CHANGES' && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-very-muted)',
            fontSize: '11px',
          }}
        >
          Changes view coming soon
        </div>
      )}
    </div>
  )
}

export default Viewer
