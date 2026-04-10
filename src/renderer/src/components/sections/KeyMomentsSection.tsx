import type { KeyMomentsContent } from '../../../../shared/analysisTypes'

type KeyMomentsSectionProps = {
  content: KeyMomentsContent
}

function KeyMomentsSection({ content }: KeyMomentsSectionProps): React.ReactElement {
  return (
    <div data-testid="section-key-moments">
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        {content.moments.map((moment, i) => (
          <li
            key={i}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--text-muted)',
                flexShrink: 0,
                paddingTop: '1px',
              }}
            >
              {moment.timestamp}
            </span>
            <span
              style={{
                fontSize: '12px',
                color: 'var(--text-primary)',
                lineHeight: 1.5,
              }}
            >
              {moment.description}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default KeyMomentsSection
