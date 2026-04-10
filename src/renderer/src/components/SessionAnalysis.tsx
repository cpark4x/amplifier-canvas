import { useState, useEffect, useCallback } from 'react'
import type {
  SessionAnalysisData,
  AnalysisSection,
  SummaryContent,
  ChangesContent,
  KeyMomentsContent,
  NextStepsContent,
  DecisionsContent,
  ActionItemsContent,
  OpenQuestionsContent,
} from '../../../shared/analysisTypes'
import {
  SummarySection,
  ChangesSection,
  KeyMomentsSection,
  NextStepsSection,
  DecisionsSection,
  ActionItemsSection,
  OpenQuestionsSection,
} from './sections'

// --- Helper: format duration from ISO timestamps ---

export function formatDuration(startedAt: string, endedAt?: string): string {
  if (!startedAt) return '--'
  const start = new Date(startedAt).getTime()
  const end = endedAt ? new Date(endedAt).getTime() : Date.now()
  const diffMs = end - start
  if (isNaN(diffMs) || diffMs < 0) return '--'
  const totalSeconds = Math.floor(diffMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }
  return `${seconds}s`
}

// --- Helper: render appropriate section component ---

function renderSection(section: AnalysisSection): React.ReactElement {
  switch (section.type) {
    case 'summary':
      return <SummarySection content={section.content as SummaryContent} />
    case 'changes':
      return <ChangesSection content={section.content as ChangesContent} />
    case 'key-moments':
      return <KeyMomentsSection content={section.content as KeyMomentsContent} />
    case 'next-steps':
      return <NextStepsSection content={section.content as NextStepsContent} />
    case 'decisions':
      return <DecisionsSection content={section.content as DecisionsContent} />
    case 'action-items':
      return <ActionItemsSection content={section.content as ActionItemsContent} />
    case 'open-questions':
      return <OpenQuestionsSection content={section.content as OpenQuestionsContent} />
    default:
      return <div />
  }
}

// --- Props ---

export interface SessionAnalysisProps {
  sessionId: string
  title?: string
  duration?: string
  promptCount?: number
  toolCallCount?: number
}

// --- Main component ---

export function SessionAnalysis({
  sessionId,
  title,
  promptCount,
  toolCallCount,
}: SessionAnalysisProps): React.ReactElement {
  const [data, setData] = useState<SessionAnalysisData | null>(null)
  const [loading, setLoading] = useState(true)
  const [promptsExpanded, setPromptsExpanded] = useState(false)

  const fetchAnalysis = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const result = await window.electronAPI.getAnalysis(sessionId)
      if (result && result.analysisStatus === 'none') {
        // Auto-trigger analysis when none exists
        void window.electronAPI.triggerAnalysis(sessionId)
      }
      setData(result)
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    void fetchAnalysis()

    // Register for push updates when analysis is ready
    const cleanup = window.electronAPI.onAnalysisReady((updatedData) => {
      if (updatedData.sessionId === sessionId) {
        setData(updatedData)
        setLoading(false)
      }
    })

    return cleanup
  }, [sessionId, fetchAnalysis])

  const handleRegenerate = (): void => {
    // Optimistically set status to loading
    setData((prev) => (prev ? { ...prev, analysisStatus: 'loading' } : prev))
    void window.electronAPI.triggerAnalysis(sessionId)
  }

  // Derived display values
  const promptHistory = data?.mechanical?.promptHistory ?? []
  const displayPromptCount = promptHistory.length > 0 ? promptHistory.length : (promptCount ?? 0)
  const displayToolCallCount = toolCallCount ?? 0
  const testStatus = data?.mechanical?.testStatus ?? null
  const displayTitle = title ?? sessionId
  const isLoadingOrGenerating = loading || data?.analysisStatus === 'loading'

  return (
    <div
      data-testid="session-analysis"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '12px',
        fontFamily: 'var(--font-ui)',
        color: 'var(--text-primary)',
      }}
    >
      {/* 1. Mechanical Header */}
      <div
        data-testid="analysis-header"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: '15px',
            fontWeight: 'bold',
            color: 'var(--text-primary)',
          }}
        >
          {displayTitle}
        </h2>
        <div
          style={{
            fontSize: '12px',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span>{displayPromptCount} prompts</span>
          <span>·</span>
          <span>{displayToolCallCount} tool calls</span>
          {testStatus !== null && (
            <>
              <span>·</span>
              <span
                style={{
                  color: testStatus.failed > 0 ? 'var(--red)' : 'var(--green)',
                }}
              >
                {testStatus.failed > 0
                  ? `${testStatus.failed} test${testStatus.failed !== 1 ? 's' : ''} failing`
                  : 'tests pass'}
              </span>
            </>
          )}
        </div>
      </div>

      {/* 2. Prompt History (collapsible) */}
      <div
        data-testid="prompt-history"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        <button
          data-testid="prompt-history-toggle"
          onClick={() => setPromptsExpanded((prev) => !prev)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: '12px',
            padding: '0',
            fontFamily: 'var(--font-ui)',
            textAlign: 'left',
          }}
        >
          <span style={{ fontSize: '9px' }}>{promptsExpanded ? '▼' : '▶'}</span>
          <span>Prompts ({displayPromptCount})</span>
        </button>

        {promptsExpanded && (
          <ol
            style={{
              margin: 0,
              padding: '0 0 0 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            {promptHistory.map((prompt, i) => (
              <li
                key={i}
                data-testid="prompt-entry"
                style={{
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  lineHeight: 1.4,
                }}
              >
                {prompt.text.length > 100
                  ? `${prompt.text.slice(0, 100)}...`
                  : prompt.text}
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* 3. AI Sections */}
      <div
        data-testid="ai-sections"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {isLoadingOrGenerating ? (
          <div
            data-testid="analysis-skeleton"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            {/* 3 placeholder bars */}
            <div
              style={{
                height: '12px',
                borderRadius: '3px',
                background: 'var(--border)',
                width: '80%',
                opacity: 0.6,
              }}
            />
            <div
              style={{
                height: '12px',
                borderRadius: '3px',
                background: 'var(--border)',
                width: '65%',
                opacity: 0.5,
              }}
            />
            <div
              style={{
                height: '12px',
                borderRadius: '3px',
                background: 'var(--border)',
                width: '72%',
                opacity: 0.4,
              }}
            />
            <span
              style={{
                fontSize: '11px',
                color: 'var(--text-very-muted)',
                marginTop: '4px',
              }}
            >
              Generating analysis...
            </span>
          </div>
        ) : (
          data?.analysisResult?.sections?.map((section, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {/* Section title header — omit for summary type */}
              {section.type !== 'summary' && (
                <div
                  style={{
                    fontSize: '12px',
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                    fontWeight: 600,
                    letterSpacing: '0.05em',
                  }}
                >
                  {section.title}
                </div>
              )}
              {renderSection(section)}
            </div>
          ))
        )}
      </div>

      {/* 4. Regenerate button — visible only when status is 'ready' */}
      {data?.analysisStatus === 'ready' && (
        <button
          data-testid="regenerate-btn"
          onClick={handleRegenerate}
          style={{
            alignSelf: 'flex-start',
            fontSize: '11px',
            color: 'var(--text-muted)',
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: '3px',
            padding: '3px 8px',
            cursor: 'pointer',
            fontFamily: 'var(--font-ui)',
          }}
        >
          Regenerate
        </button>
      )}
    </div>
  )
}

export default SessionAnalysis
