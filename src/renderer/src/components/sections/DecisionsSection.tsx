import type { DecisionsContent } from '../../../../shared/analysisTypes'

type DecisionsSectionProps = {
  content: DecisionsContent
}

function DecisionsSection({ content }: DecisionsSectionProps): React.ReactElement {
  return (
    <div data-testid="section-decisions">
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        {content.decisions.map((item, i) => (
          <li key={i}>
            <div
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                marginBottom: '2px',
              }}
            >
              {item.decision}
            </div>
            <div
              style={{
                fontSize: '12px',
                color: 'var(--text-muted)',
                lineHeight: 1.5,
              }}
            >
              {item.rationale}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default DecisionsSection
