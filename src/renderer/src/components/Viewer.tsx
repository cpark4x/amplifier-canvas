import { useState, useEffect } from 'react'
import { useCanvasStore } from '../store'
import FileBrowser from './FileBrowser'
import FileRenderer from './FileRenderer'

type PrimaryTab = 'FILES' | 'APP' | 'ANALYSIS' | 'CHANGES'

interface OpenFile {
  path: string
  name: string
  openedBy: 'amplifier' | 'user'
}

const OPERATION_BADGE_COLORS: Record<string, { bg: string; fg: string }> = {
  read: { bg: '#2D5A3D', fg: '#7FBA9A' },
  write: { bg: '#4A3520', fg: '#C4784A' },
  edit: { bg: '#2A3F5A', fg: '#5A9AC4' },
  create: { bg: '#3A4A1A', fg: '#8ABF3A' },
  delete: { bg: '#5A1A1A', fg: '#C44A4A' },
}

function Viewer(): React.ReactElement {
  const viewerOpen = useCanvasStore((s) => s.viewerOpen)
  const closeViewer = useCanvasStore((s) => s.closeViewer)
  const selectedSessionId = useCanvasStore((s) => s.selectedSessionId)
  const session = useCanvasStore((s) => {
    const { sessions, selectedSessionId: sid } = s
    if (!sid) return null
    return sessions.find((sess) => sess.id === sid) || null
  })

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

  // Reset open files when session changes (different session = fresh file view)
  useEffect(() => {
    setOpenFiles([])
    setActiveFileIdx(0)
    setShowBrowser(false)
  }, [selectedSessionId])

  const primaryTabs: PrimaryTab[] = ['FILES', 'APP', 'ANALYSIS', 'CHANGES']
  const activeFile = openFiles[activeFileIdx] || null

  function openFile(path: string, openedBy: 'amplifier' | 'user'): void {
    const name = path.split('/').pop() || path
    const existingIdx = openFiles.findIndex((f) => f.path === path)
    if (existingIdx >= 0) {
      setActiveFileIdx(existingIdx)
    } else {
      const newFiles = [...openFiles, { path, name, openedBy }]
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
  ;(window as unknown as Record<string, unknown>).__canvasOpenFile = (path: string) => openFile(path, 'amplifier')
  ;(window as unknown as Record<string, unknown>).__canvasSetAppPreview = setAppPreview

  const workDir = session?.workDir || null

  function resolveFilePath(filePath: string): string {
    if (filePath.startsWith('/') || !workDir) return filePath
    return `${workDir}/${filePath}`
  }

  return (
    <div
      data-testid="viewer-panel"
      style={{
        width: viewerOpen ? 340 : 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-right)',
        borderLeft: viewerOpen ? '1px solid var(--border)' : 'none',
        overflow: 'hidden',
        flexShrink: 0,
        transition: 'width 0.2s ease',
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
            style={{ fontSize: '12px', fontWeight: 500, paddingBottom: 8, paddingLeft: 0, paddingRight: 0, paddingTop: 0, color: primaryTab === tab ? 'var(--text-primary)' : 'var(--text-very-muted)', borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderBottom: primaryTab === tab ? '2px solid var(--accent)' : '2px solid transparent', background: 'none', cursor: 'pointer', whiteSpace: 'nowrap' as const, marginBottom: -1 }}
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
              style={{ fontSize: '13px', width: 22, height: 22, border: 'none', borderRadius: 3, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'transparent', color: showBrowser ? 'var(--amber)' : 'var(--text-very-muted)' }}
            >
              {'\u25A6'}
            </button>
            {openFiles.map((file, idx) => (
              <div
                key={file.path}
                data-testid="file-tab"
                onClick={() => { setActiveFileIdx(idx); setShowBrowser(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, color: idx === activeFileIdx && !showBrowser ? 'var(--text-primary)' : 'var(--text-very-muted)', fontWeight: idx === activeFileIdx && !showBrowser ? 500 : 400, borderBottom: idx === activeFileIdx && !showBrowser ? '2px solid var(--amber)' : '2px solid transparent', marginBottom: -1 }}
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
                onSelectFile={(filePath) => openFile(filePath, 'user')}
              />
            ) : (
              <>
                {/* Recent files — always visible when session has activity */}
                {session && session.recentFiles && session.recentFiles.length > 0 && (
                  <div data-testid="recent-files" style={{ marginBottom: 16 }}>
                    <div
                      style={{
                        fontSize: '10px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: 'var(--text-very-muted)',
                        marginBottom: 4,
                      }}
                    >
                      Recent Files
                    </div>
                    {session.recentFiles.map((file, idx) => {
                      const fileName = file.path.split('/').pop() || file.path
                      const badgeColors = OPERATION_BADGE_COLORS[file.operation] ?? { bg: '#3A3530', fg: '#C8C4BC' }
                      return (
                        <div
                          key={idx}
                          data-testid="recent-file-item"
                          onClick={() => openFile(resolveFilePath(file.path), 'amplifier')}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            height: 28,
                            fontSize: '13px',
                            cursor: 'pointer',
                            borderRadius: 3,
                            padding: '0 4px',
                            color: 'var(--text-primary)',
                          }}
                        >
                          <span style={{ color: 'var(--text-very-muted)', fontSize: '12px', flexShrink: 0 }}>
                            {'\u2261'}
                          </span>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {fileName}
                          </span>
                          <span
                            data-testid="operation-badge"
                            style={{
                              fontSize: '10px',
                              padding: '1px 5px',
                              borderRadius: 3,
                              backgroundColor: badgeColors.bg,
                              color: badgeColors.fg,
                              flexShrink: 0,
                            }}
                          >
                            {file.operation}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* File content or browse hint */}
                {activeFile ? (
                  <>
                    <div
                      data-testid="provenance-label"
                      style={{
                        fontSize: '10px',
                        color: 'var(--text-very-muted)',
                        marginBottom: '8px',
                      }}
                    >
                      {activeFile.openedBy === 'amplifier' ? 'Opened by Amplifier' : 'Opened by you'}
                    </div>
                    <FileRenderer filePath={activeFile.path} />
                  </>
                ) : (
                  <div
                    style={{
                      color: 'var(--text-very-muted)',
                      fontSize: '11px',
                      textAlign: 'center',
                      marginTop: session?.recentFiles?.length ? 8 : 60,
                    }}
                  >
                    Click {'\u25A6'} to browse files
                  </div>
                )}
              </>
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
