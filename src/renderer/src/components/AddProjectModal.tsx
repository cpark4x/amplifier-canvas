import { useState, useEffect } from 'react'

interface DiscoveredProject {
  slug: string
  name: string
  path: string
}

type AddProjectModalProps = {
  onClose: () => void
  onCreateNew: (name: string) => void
  onAddExisting: (project: DiscoveredProject) => void
}

function AddProjectModal({ onClose, onCreateNew, onAddExisting }: AddProjectModalProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<'new' | 'existing'>('new')
  const [name, setName] = useState('')
  const [search, setSearch] = useState('')
  const [discovered, setDiscovered] = useState<DiscoveredProject[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedExisting, setSelectedExisting] = useState<DiscoveredProject | null>(null)

  // Discover projects when "Existing" tab is first opened
  useEffect(() => {
    if (activeTab === 'existing' && discovered.length === 0 && !loading) {
      setLoading(true)
      const amplifierHome =
        (typeof process !== 'undefined' && process.env['AMPLIFIER_HOME']) ||
        `${(typeof process !== 'undefined' && process.env['HOME']) || '~'}/.amplifier`
      window.electronAPI
        .discoverProjects(amplifierHome)
        .then((projects) => {
          setDiscovered(projects)
          setLoading(false)
        })
        .catch(() => {
          setLoading(false)
        })
    }
  }, [activeTab, discovered.length, loading])

  const filteredProjects = discovered.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.slug.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div
      data-testid="modal-overlay"
      onClick={onClose}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(20,16,10,0.18)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
      }}
    >
      <div
        data-testid="modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 440,
          background: 'var(--bg-modal)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          padding: 24,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
            Add Project
          </span>
          <button
            data-testid="modal-close"
            onClick={onClose}
            style={{
              fontSize: 16,
              color: 'var(--text-muted)',
              background: 'none',
              border: 'none',
              lineHeight: 1,
              padding: 0,
              cursor: 'pointer',
            }}
          >
            {'\u00d7'}
          </button>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            gap: 16,
            marginTop: 16,
            borderBottom: '1px solid var(--border)',
          }}
        >
          <button
            data-testid="tab-new"
            onClick={() => setActiveTab('new')}
            style={{
              background: 'none',
              border: 'none',
              borderBottom:
                activeTab === 'new' ? '2px solid var(--text-primary)' : '2px solid transparent',
              paddingBottom: 8,
              fontSize: 13,
              fontWeight: activeTab === 'new' ? 600 : 400,
              color: activeTab === 'new' ? 'var(--text-primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
            }}
          >
            New
          </button>
          <button
            data-testid="tab-existing"
            onClick={() => setActiveTab('existing')}
            style={{
              background: 'none',
              border: 'none',
              borderBottom:
                activeTab === 'existing'
                  ? '2px solid var(--text-primary)'
                  : '2px solid transparent',
              paddingBottom: 8,
              fontSize: 13,
              fontWeight: activeTab === 'existing' ? 600 : 400,
              color: activeTab === 'existing' ? 'var(--text-primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
            }}
          >
            Existing
          </button>
        </div>

        {/* Tab content */}
        <div style={{ marginTop: 16 }}>
          {activeTab === 'new' && (
            <>
              <input
                data-testid="project-name-input"
                type="text"
                placeholder="Project name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: '1px solid var(--border)',
                  background: '#F5F2EC',
                  borderRadius: 3,
                  fontSize: 13,
                  fontFamily: 'var(--font-ui)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--text-very-muted)',
                  marginTop: 6,
                }}
              >
                Creates a new Amplifier project
              </div>

              {/* Footer */}
              <div
                style={{
                  marginTop: 20,
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 12,
                  alignItems: 'center',
                }}
              >
                <button
                  data-testid="modal-cancel"
                  onClick={onClose}
                  style={{
                    fontSize: 13,
                    color: 'var(--text-muted)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-ui)',
                  }}
                >
                  Cancel
                </button>
                <button
                  data-testid="modal-submit"
                  onClick={() => {
                    if (name.trim()) {
                      onCreateNew(name.trim())
                    }
                  }}
                  disabled={!name.trim()}
                  style={{
                    padding: '7px 14px',
                    border: '1px solid #3A3530',
                    background: '#2F2B24',
                    color: '#FFFFFF',
                    fontSize: 13,
                    borderRadius: 4,
                    cursor: name.trim() ? 'pointer' : 'default',
                    fontFamily: 'var(--font-ui)',
                    opacity: name.trim() ? 1 : 0.5,
                  }}
                >
                  Create Project
                </button>
              </div>
            </>
          )}

          {activeTab === 'existing' && (
            <>
              <input
                data-testid="search-input"
                type="text"
                placeholder="Search projects..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: '1px solid var(--border)',
                  background: '#F5F2EC',
                  borderRadius: 3,
                  fontSize: 13,
                  fontFamily: 'var(--font-ui)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />

              {/* Project list */}
              <div
                style={{
                  marginTop: 8,
                  maxHeight: 240,
                  overflowY: 'auto',
                }}
              >
                {loading && (
                  <div
                    data-testid="loading-spinner"
                    style={{
                      fontSize: 12,
                      color: 'var(--text-very-muted)',
                      padding: '12px 0',
                      textAlign: 'center',
                    }}
                  >
                    Scanning...
                  </div>
                )}
                {!loading && filteredProjects.length === 0 && (
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--text-very-muted)',
                      padding: '12px 0',
                      textAlign: 'center',
                    }}
                  >
                    {search ? 'No matching projects' : 'No Amplifier projects found'}
                  </div>
                )}
                {filteredProjects.map((project) => (
                  <div
                    key={project.slug}
                    data-testid="discovered-project"
                    onClick={() => setSelectedExisting(project)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      backgroundColor:
                        selectedExisting?.slug === project.slug
                          ? 'rgba(0,0,0,0.06)'
                          : 'transparent',
                      border:
                        selectedExisting?.slug === project.slug
                          ? '1px solid var(--border)'
                          : '1px solid transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (selectedExisting?.slug !== project.slug) {
                        ;(e.currentTarget as HTMLDivElement).style.backgroundColor =
                          'rgba(0,0,0,0.03)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLDivElement).style.backgroundColor =
                        selectedExisting?.slug === project.slug ? 'rgba(0,0,0,0.06)' : 'transparent'
                    }}
                  >
                    <div
                      style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}
                    >
                      {project.name}
                    </div>
                    <div
                      style={{ fontSize: 11, color: 'var(--text-very-muted)', marginTop: 2 }}
                    >
                      {project.path}
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div
                style={{
                  marginTop: 16,
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 12,
                  alignItems: 'center',
                }}
              >
                <button
                  data-testid="modal-cancel"
                  onClick={onClose}
                  style={{
                    fontSize: 13,
                    color: 'var(--text-muted)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-ui)',
                  }}
                >
                  Cancel
                </button>
                <button
                  data-testid="modal-submit"
                  onClick={() => {
                    if (selectedExisting) {
                      onAddExisting(selectedExisting)
                    }
                  }}
                  disabled={!selectedExisting}
                  style={{
                    padding: '7px 14px',
                    border: '1px solid #3A3530',
                    background: '#2F2B24',
                    color: '#FFFFFF',
                    fontSize: 13,
                    borderRadius: 4,
                    cursor: selectedExisting ? 'pointer' : 'default',
                    fontFamily: 'var(--font-ui)',
                    opacity: selectedExisting ? 1 : 0.5,
                  }}
                >
                  Add to Canvas
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default AddProjectModal
