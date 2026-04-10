import type { ActionItemsContent } from '../../../../shared/analysisTypes'

type ActionItemsSectionProps = {
  content: ActionItemsContent
}

function ActionItemsSection({ content }: ActionItemsSectionProps): React.ReactElement {
  return (
    <div data-testid="section-action-items">
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
        {content.items.map((item, i) => (
          <li
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span
              style={{
                width: '14px',
                height: '14px',
                border: '1px solid var(--border)',
                borderRadius: '2px',
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '10px',
                color: 'var(--green)',
              }}
            >
              {item.completed ? '✓' : ''}
            </span>
            <span
              style={{
                fontSize: '13px',
                color: 'var(--text-primary)',
                textDecoration: item.completed ? 'line-through' : 'none',
                opacity: item.completed ? 0.6 : 1,
              }}
            >
              {item.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default ActionItemsSection
