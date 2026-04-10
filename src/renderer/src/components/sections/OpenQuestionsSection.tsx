import type { OpenQuestionsContent } from '../../../../shared/analysisTypes'

type OpenQuestionsSectionProps = {
  content: OpenQuestionsContent
}

function OpenQuestionsSection({ content }: OpenQuestionsSectionProps): React.ReactElement {
  return (
    <div data-testid="section-open-questions">
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
        {content.questions.map((question, i) => (
          <li
            key={i}
            style={{
              fontSize: '13px',
              color: 'var(--text-primary)',
              lineHeight: 1.5,
            }}
          >
            {question}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default OpenQuestionsSection
