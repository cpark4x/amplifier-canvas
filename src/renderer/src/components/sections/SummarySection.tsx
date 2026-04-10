import type { SummaryContent } from '../../../../shared/analysisTypes'

type SummarySectionProps = {
  content: SummaryContent
}

function SummarySection({ content }: SummarySectionProps): React.ReactElement {
  return (
    <div data-testid="section-summary">
      <p
        style={{
          margin: 0,
          fontStyle: 'italic',
          color: 'var(--text-primary)',
          lineHeight: 1.6,
        }}
      >
        {content.text}
      </p>
    </div>
  )
}

export default SummarySection
