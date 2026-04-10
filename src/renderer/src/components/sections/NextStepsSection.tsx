import type { NextStepsContent } from '../../../../shared/analysisTypes'

type NextStepsSectionProps = {
  content: NextStepsContent
}

function NextStepsSection({ content }: NextStepsSectionProps): React.ReactElement {
  return (
    <div data-testid="section-next-steps">
      <ul
        style={{
          listStyle: 'disc',
          margin: 0,
          padding: '0 0 0 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        {content.items.map((item, i) => (
          <li
            key={i}
            style={{
              fontSize: '13px',
              color: 'var(--text-primary)',
              lineHeight: 1.5,
            }}
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default NextStepsSection
