import { useState, useEffect } from 'react'
import type { SessionState } from '../../../shared/types'

interface DiscoveredProject {
  slug: string
  name: string
  path: string
}

type ModalStep = 'browse' | 'choose-action'

type AddProjectModalProps = {
  onClose: () => void
  onCreateNew: (name: string) => void
  onAddExisting: (project: DiscoveredProject) => void
  onResumeSession: (project: DiscoveredProject, sessionId: string) => void
  onNewSessionInProject: (project: DiscoveredProject) => void
}

function AddProjectModal({ onClose, onCreateNew, onAddExisting, onResumeSession, onNewSessionInProject }: AddProjectModalProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<'new' | 'existing'>('new')
  const [name, setName] = useState('')
  const [search, setSearch] = useState('')
  const [discovered, setDiscovered] = useState<DiscoveredProject[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedExisting, setSelectedExisting] = useState<DiscoveredProject | null>(null)
  const [discoveryError, setDiscoveryError] = useState(false)
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null)

  // Choose-action step state
  const [step, setStep] = useState<ModalStep>('browse')
  const [confirmedProject, setConfirmedProject] = useState<DiscoveredProject | null>(null)
  const [projectSessions, setProjectSessions] = useState<SessionState[]>([])
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [hoveredAction, setHoveredAction] = useState<string | null>(null)

  // Discover projects when "Existing" tab is first opened
  useEffect(() => {
    if (activeTab === 'existing' && discovered.length === 0 && !loading) {
      setLoading(true)
      window.electronAPI
        .discoverProjects('')
        .then((projects) => {
          setDiscovered(projects)
          setLoading(false)
        })
        .catch(() => {
          setDiscoveryError(true)
          setLoading(false)
        })
    }
  }, [activeTab, discovered.length, loading])

  const filteredProjects = discovered.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.slug.toLowerCase().includes(search.toLowerCase()),
  )

  // Handle "Add to Canvas" — register the project and move to choose-action step
  function handleAddExisting(): void {
    if (!selectedExisting) return
    setLoadingSessions(true)
    setConfirmedProject(selectedExisting)

    window.electronAPI
      .registerProject(selectedExisting.slug, selectedExisting.path, selectedExisting.name)
      .then((result) => {
        setProjectSessions(result.sessions ?? [])
        setLoadingSessions(false)
        setStep('choose-action')
      })
      .catch(() => {
        setLoadingSessions(false)
        // Fall back to old behavior if registration fails
        onAddExisting(selectedExisting)
      })
  }

  const ROW_STYLE: React.CSSProperties = {
    padding: '10px 12px',
    borderRadius: 4,
    cursor: 'pointer',
    border: '1px solid transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  }

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
          width: 460,
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

        {/* Tabs — only shown in browse step */}
        {step === 'browse' && (
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
        )}

        {/* Tab content */}
        <div style={{ marginTop: 16 }}>

          {/* === NEW TAB === */}
          {step === 'browse' && activeTab === 'new' && (
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

          {/* === EXISTING TAB — Browse step === */}
          {step === 'browse' && activeTab === 'existing' && (
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
                {!loading && discoveryError && (
                  <div
                    data-testid="discovery-error"
                    style={{
                      fontSize: 12,
                      color: 'var(--text-muted)',
                      padding: '12px 0',
                      textAlign: 'center',
                    }}
                  >
                    Could not scan for projects. Please try again.
                  </div>
                )}
                {!loading && !discoveryError && filteredProjects.length === 0 && (
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
                    onMouseEnter={() => setHoveredSlug(project.slug)}
                    onMouseLeave={() => setHoveredSlug(null)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      backgroundColor:
                        selectedExisting?.slug === project.slug
                          ? 'rgba(0,0,0,0.06)'
                          : hoveredSlug === project.slug
                            ? 'rgba(0,0,0,0.03)'
                            : 'transparent',
                      border:
                        selectedExisting?.slug === project.slug
                          ? '1px solid var(--border)'
                          : '1px solid transparent',
                    }}
                  >
                    <div
                      style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                    >
                      <span>{project.name}</span>
                      {selectedExisting?.slug === project.slug && (
                        <span style={{ color: 'var(--amber)', fontSize: 14 }}>{'\u2713'}</span>
                      )}
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
                  onClick={handleAddExisting}
                  disabled={!selectedExisting || loadingSessions}
                  style={{
                    padding: '7px 14px',
                    border: '1px solid #3A3530',
                    background: '#2F2B24',
                    color: '#FFFFFF',
                    fontSize: 13,
                    borderRadius: 4,
                    cursor: selectedExisting && !loadingSessions ? 'pointer' : 'default',
                    fontFamily: 'var(--font-ui)',
                    opacity: selectedExisting && !loadingSessions ? 1 : 0.5,
                  }}
                >
                  {loadingSessions ? 'Loading...' : 'Add Project \u2192'}
                </button>
              </div>
            </>
          )}

          {/* === CHOOSE ACTION STEP === */}
          {step === 'choose-action' && confirmedProject && (
            <>
              {/* Selected project banner */}
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 4,
                  backgroundColor: 'rgba(0,0,0,0.04)',
                  border: '1px solid var(--border)',
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {confirmedProject.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-very-muted)', marginTop: 2 }}>
                    {confirmedProject.path}
                  </div>
                </div>
                <span style={{ color: 'var(--amber)', fontSize: 14 }}>{'\u2713'}</span>
              </div>

              {/* New session option */}
              <div
                data-testid="action-new-session"
                onClick={() => onNewSessionInProject(confirmedProject)}
                onMouseEnter={() => setHoveredAction('new')}
                onMouseLeave={() => setHoveredAction(null)}
                style={{
                  ...ROW_STYLE,
                  backgroundColor: hoveredAction === 'new' ? 'rgba(0,0,0,0.03)' : 'transparent',
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                    New session
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-very-muted)', marginTop: 2 }}>
                    Start a fresh Amplifier session
                  </div>
                </div>
                <span style={{ color: 'var(--amber)', fontSize: 12 }}>{'\u2192'}</span>
              </div>

              {/* Resume section — only if sessions exist */}
              {projectSessions.length > 0 && (
                <>
                  <div
                    style={{
                      fontSize: 10,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--text-very-muted)',
                      padding: '14px 0 6px',
                    }}
                  >
                    Resume
                  </div>
                  {projectSessions
                    .filter((s) => s.status === 'done' || s.status === 'stopped' || s.status === 'failed')
                    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
                    .slice(0, 3)
                    .map((session) => (
                      <div
                        key={session.id}
                        data-testid="action-resume-session"
                        onClick={() => onResumeSession(confirmedProject, session.id)}
                        onMouseEnter={() => setHoveredAction(session.id)}
                        onMouseLeave={() => setHoveredAction(null)}
                        style={{
                          ...ROW_STYLE,
                          backgroundColor: hoveredAction === session.id ? 'rgba(0,0,0,0.03)' : 'transparent',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-primary)' }}>
                            {session.title || session.id.slice(0, 8)}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-very-muted)', marginTop: 2 }}>
                            {formatRelativeTime(session.endedAt || session.startedAt)}
                          </div>
                        </div>
                        <span style={{ color: 'var(--amber)', fontSize: 12 }}>{'\u2192'}</span>
                      </div>
                    ))}
                  {projectSessions.length > 3 && (
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--amber)',
                        padding: '8px 12px',
                        cursor: 'pointer',
                      }}
                    >
                      See more...
                    </div>
                  )}
                </>
              )}

              {/* Footer — just Cancel */}
              <div
                style={{
                  marginTop: 16,
                  display: 'flex',
                  justifyContent: 'flex-start',
                  gap: 12,
                  alignItems: 'center',
                }}
              >
                <button
                  onClick={() => {
                    setStep('browse')
                    setConfirmedProject(null)
                    setProjectSessions([])
                  }}
                  style={{
                    fontSize: 13,
                    color: 'var(--text-muted)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-ui)',
                  }}
                >
                  {'\u2190'} Back
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return `${Math.floor(diffDays / 7)}w ago`
}

export default AddProjectModal
