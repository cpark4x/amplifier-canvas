import { useState } from 'react'
import { useCanvasStore } from '../store'
import ProjectOverviewTab from './ProjectOverviewTab'
import ProjectStatsTab from './ProjectStatsTab'
import ProjectHistoryTab from './ProjectHistoryTab'

type TabId = 'overview' | 'stats' | 'history'

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'OVERVIEW' },
  { id: 'stats', label: 'STATS' },
  { id: 'history', label: 'HISTORY' },
]

function ProjectView(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const selectedProjectSlug = useCanvasStore((s) => s.selectedProjectSlug)
  const registeredProjects = useCanvasStore((s) => s.registeredProjects)

  const project = registeredProjects.find((p) => p.slug === selectedProjectSlug)
  const projectName = project?.name ?? selectedProjectSlug ?? 'Project'
  const projectPath = project?.path ?? ''

  return (
    <div
      data-testid="project-view"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-main)',
        overflow: 'hidden',
      }}
    >
      {/* Header: project name + path */}
      <div style={{ padding: '20px 24px 0' }}>
        <div
          data-testid="project-view-name"
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: 'var(--text-primary)',
            lineHeight: 1.3,
          }}
        >
          {projectName}
        </div>
        {projectPath && (
          <div
            data-testid="project-view-path"
            style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              marginTop: 2,
              fontFamily: 'var(--font-mono)',
            }}
          >
            {projectPath}
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div
        data-testid="project-view-tabs"
        style={{
          display: 'flex',
          gap: 0,
          borderBottom: '1px solid var(--border)',
          padding: '0 24px',
          marginTop: 16,
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              data-testid={`project-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase' as const,
                color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                background: 'none',
                border: 'none',
                borderBottom: isActive ? '2px solid var(--amber)' : '2px solid transparent',
                padding: '8px 16px',
                cursor: 'pointer',
                transition: 'color 0.12s ease',
                fontFamily: 'var(--font-ui)',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'
                }
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content area */}
      <div
        data-testid="project-view-content"
        style={{
          flex: 1,
          padding: '20px 24px',
          overflowY: 'auto',
        }}
      >
        {activeTab === 'overview' && selectedProjectSlug && (
          <ProjectOverviewTab projectSlug={selectedProjectSlug} />
        )}
        {activeTab === 'stats' && selectedProjectSlug && (
          <ProjectStatsTab projectSlug={selectedProjectSlug} />
        )}
        {activeTab === 'history' && selectedProjectSlug && (
          <ProjectHistoryTab projectSlug={selectedProjectSlug} />
        )}
      </div>
    </div>
  )
}

export default ProjectView
