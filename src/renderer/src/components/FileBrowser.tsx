import { useState, useEffect, useCallback } from 'react'
import type { FileEntry } from '../../../shared/types'

type FileBrowserProps = {
  rootPath: string
  onSelectFile: (filePath: string) => void
}

function FileBrowser({ rootPath, onSelectFile }: FileBrowserProps): React.ReactElement {
  const [currentPath, setCurrentPath] = useState(rootPath)
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(true)

  const loadDirectory = useCallback(async (dirPath: string) => {
    setLoading(true)
    try {
      const result = await window.electronAPI.listDir(dirPath)
      // Sort: directories first, then files alphabetically
      const sorted = [...result].sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        return a.name.localeCompare(b.name)
      })
      setEntries(sorted)
    } catch {
      console.error('[FileBrowser] Failed to load directory:', dirPath)
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setCurrentPath(rootPath)
  }, [rootPath])

  useEffect(() => {
    void loadDirectory(currentPath)
  }, [currentPath, loadDirectory])

  const handleEntryClick = (entry: FileEntry): void => {
    if (entry.isDirectory) {
      setCurrentPath(entry.path)
    } else {
      onSelectFile(entry.path)
    }
  }

  const navigateUp = (): void => {
    if (currentPath !== rootPath) {
      const parent = currentPath.substring(0, currentPath.lastIndexOf('/'))
      if (parent.length >= rootPath.length) {
        setCurrentPath(parent)
      } else {
        setCurrentPath(rootPath)
      }
    }
  }

  // Compute relative breadcrumb from rootPath
  const relativePath = currentPath.startsWith(rootPath)
    ? currentPath.slice(rootPath.length).replace(/^\//, '')
    : ''
  const breadcrumbParts = relativePath ? relativePath.split('/') : []

  return (
    <div data-testid="file-browser" style={{ fontSize: '13px' }}>
      {/* Breadcrumb */}
      <div
        data-testid="file-breadcrumb"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 0 8px 0',
          color: 'var(--text-muted)',
          fontSize: '10px',
          flexWrap: 'wrap',
        }}
      >
        <span
          onClick={() => setCurrentPath(rootPath)}
          style={{ cursor: 'pointer', color: 'var(--text-primary)' }}
        >
          root
        </span>
        {breadcrumbParts.map((part, i) => {
          // Build path up to this part
          const pathUpTo = rootPath + '/' + breadcrumbParts.slice(0, i + 1).join('/')
          return (
            <span key={pathUpTo}>
              <span style={{ margin: '0 2px' }}>/</span>
              <span
                onClick={() => setCurrentPath(pathUpTo)}
                style={{
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                }}
              >
                {part}
              </span>
            </span>
          )
        })}
      </div>

      {/* Back button when not at root */}
      {currentPath !== rootPath && (
        <div
          data-testid="file-browser-back"
          onClick={navigateUp}
          style={{
            padding: '3px 4px',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: '11px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span style={{ fontSize: '10px' }}>..</span>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ color: 'var(--text-muted)', padding: '8px 0', fontSize: '11px' }}>
          Loading...
        </div>
      )}

      {/* Empty state */}
      {!loading && entries.length === 0 && (
        <div style={{ color: 'var(--text-muted)', padding: '8px 0', fontSize: '11px' }}>
          Empty directory
        </div>
      )}

      {/* File entries */}
      {!loading &&
        entries.map((entry) => (
          <div
            key={entry.path}
            data-testid="file-entry"
            data-is-directory={entry.isDirectory ? 'true' : 'false'}
            data-name={entry.name}
            onClick={() => handleEntryClick(entry)}
            style={{
              height: 28,
              padding: '0 4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              borderRadius: '3px',
              fontSize: '13px',
              color: 'var(--text-primary)',
              transition: 'background 0.12s ease',
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLDivElement).style.backgroundColor = '#E8E0D4'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'
            }}
          >
            <span style={{ fontSize: '13px', width: '16px', textAlign: 'center', color: 'var(--text-very-muted)', fontFamily: 'var(--font-mono)' }}>
              {entry.isDirectory ? '\u25B8' : '\u2261'}
            </span>
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {entry.name}
            </span>
          </div>
        ))}
    </div>
  )
}

export default FileBrowser
