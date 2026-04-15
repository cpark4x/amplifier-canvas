import { useEffect, useState } from 'react'
import type { ProjectOverview } from '../../../shared/types'

interface ProjectOverviewTabProps {
  projectSlug: string
}

function ProjectOverviewTab({ projectSlug }: ProjectOverviewTabProps): React.ReactElement {
  const [overview, setOverview] = useState<ProjectOverview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    if (window.electronAPI) {
      window.electronAPI.getProjectOverview(projectSlug).then((data) => {
        setOverview(data)
        setLoading(false)
      })
    }
  }, [projectSlug])

  if (loading) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '12px 0' }}>
        Loading overview…
      </div>
    )
  }

  if (!overview) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '12px 0' }}>
        No overview available for this project.
      </div>
    )
  }

  return (
    <div data-testid="project-overview-tab">
      {/* Quick stats row */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <StatCard value={overview.sessionCount} label="Sessions" />
        <StatCard value={overview.totalPrompts} label="Prompts" />
        <StatCard value={overview.totalFilesChanged} label="Files Changed" />
      </div>

      {/* Assessment card */}
      {overview.assessment && (
        <div
          style={{
            background: 'var(--bg-sidebar)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: 16,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              marginBottom: 8,
            }}
          >
            <span style={{ color: 'var(--amber)', fontSize: 11 }}>&#x2736;</span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.08em',
                color: 'var(--amber)',
              }}
            >
              AI Assessment
            </span>
          </div>
          <div
            style={{
              fontSize: 13,
              lineHeight: 1.5,
              color: 'var(--text-primary)',
            }}
          >
            {overview.assessment}
          </div>
        </div>
      )}

      {/* Outcomes section */}
      {overview.outcomes && overview.outcomes.length > 0 && (
        <div>
          <div
            style={{
              fontSize: 11,
              textTransform: 'uppercase' as const,
              letterSpacing: '0.06em',
              color: 'var(--text-muted)',
              fontWeight: 600,
              marginBottom: 10,
            }}
          >
            Key Outcomes
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {overview.outcomes.map((outcome, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 10,
                  padding: '8px 0',
                  borderBottom:
                    i < overview.outcomes!.length - 1
                      ? '1px solid var(--border)'
                      : 'none',
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--amber)',
                    flexShrink: 0,
                    position: 'relative',
                    top: -1,
                  }}
                />
                <span
                  style={{
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: 'var(--text-primary)',
                  }}
                >
                  {outcome}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------- Stat card sub-component ---------- */

function StatCard({
  value,
  label,
}: {
  value: number
  label: string
}): React.ReactElement {
  return (
    <div
      style={{
        flex: 1,
        background: 'var(--bg-sidebar)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: 16,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: 'var(--text-primary)',
          lineHeight: 1,
          marginBottom: 4,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 11,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.06em',
          color: 'var(--text-muted)',
          fontWeight: 500,
        }}
      >
        {label}
      </div>
    </div>
  )
}

export default ProjectOverviewTab
