import type { ChangesContent } from '../../../../shared/analysisTypes'

type ChangesSectionProps = {
  content: ChangesContent
}

const CHANGE_INDICATORS: Record<string, { label: string; color: string }> = {
  created: { label: 'A', color: 'var(--green)' },
  modified: { label: 'M', color: 'var(--amber)' },
  deleted: { label: 'D', color: 'var(--red)' },
}

function ChangesSection({ content }: ChangesSectionProps): React.ReactElement {
  return (
    <div data-testid="section-changes">
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        {content.files.map((file, i) => {
          const indicator = CHANGE_INDICATORS[file.changeType]
          return (
            <li
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
              }}
            >
              <span
                style={{
                  color: indicator.color,
                  fontWeight: 600,
                  minWidth: '12px',
                }}
              >
                {indicator.label}
              </span>
              <span style={{ color: 'var(--text-primary)' }}>{file.path}</span>
            </li>
          )
        })}
      </ul>
      {content.prUrl && (
        <div style={{ marginTop: '8px' }}>
          <a
            href={content.prUrl}
            style={{
              color: 'var(--amber)',
              fontSize: '12px',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span>→</span>
            <span>{content.prUrl}</span>
          </a>
        </div>
      )}
    </div>
  )
}

export default ChangesSection
