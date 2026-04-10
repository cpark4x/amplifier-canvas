// Type-checking test file — exercising all 7 typed section renderer components
// This file MUST fail to compile before the implementation and MUST pass after.
// It is NOT meant to be run — it is a compile-time assertion.

import type React from 'react'
import type {
  SummaryContent,
  ChangesContent,
  KeyMomentsContent,
  NextStepsContent,
  DecisionsContent,
  ActionItemsContent,
  OpenQuestionsContent,
} from '../../../../../shared/analysisTypes'

// Import all 7 components from the barrel index
import {
  SummarySection,
  ChangesSection,
  KeyMomentsSection,
  NextStepsSection,
  DecisionsSection,
  ActionItemsSection,
  OpenQuestionsSection,
} from '../index'

// --- Sample typed content objects ---

const summaryContent: SummaryContent = {
  text: 'Implemented the analysis pipeline with 7 section renderers.',
}

const changesContent: ChangesContent = {
  files: [
    { path: 'src/main.ts', changeType: 'modified', linesAdded: 20, linesRemoved: 5 },
    { path: 'src/new.ts', changeType: 'created' },
    { path: 'src/old.ts', changeType: 'deleted' },
  ],
  prUrl: 'https://github.com/org/repo/pull/42',
}

const keyMomentsContent: KeyMomentsContent = {
  moments: [
    { timestamp: '00:05:00', description: 'Started implementation' },
    { timestamp: '01:23:45', description: 'Fixed critical bug in parser' },
  ],
}

const nextStepsContent: NextStepsContent = {
  items: ['Review PR', 'Write tests', 'Deploy to staging'],
}

const decisionsContent: DecisionsContent = {
  decisions: [
    { decision: 'Use inline styles', rationale: 'Keeps components self-contained' },
    { decision: 'Use CSS custom properties', rationale: 'Allows theming via variables' },
  ],
}

const actionItemsContent: ActionItemsContent = {
  items: [
    { text: 'Deploy to staging', completed: false },
    { text: 'Update docs', completed: true },
  ],
}

const openQuestionsContent: OpenQuestionsContent = {
  questions: ['Should we cache the analysis result?', 'What about auth?'],
}

// --- Type assertions: each component must accept typed content prop ---
// These are compile-time assertions — they verify the components exist and accept correct prop types.

type _SummarySectionProps = React.ComponentProps<typeof SummarySection>
type _ChangesSectionProps = React.ComponentProps<typeof ChangesSection>
type _KeyMomentsSectionProps = React.ComponentProps<typeof KeyMomentsSection>
type _NextStepsSectionProps = React.ComponentProps<typeof NextStepsSection>
type _DecisionsSectionProps = React.ComponentProps<typeof DecisionsSection>
type _ActionItemsSectionProps = React.ComponentProps<typeof ActionItemsSection>
type _OpenQuestionsSectionProps = React.ComponentProps<typeof OpenQuestionsSection>

// Each component must have a content prop of the correct type
type _SummaryHasContent = _SummarySectionProps extends { content: SummaryContent } ? true : never
type _ChangesHasContent = _ChangesSectionProps extends { content: ChangesContent } ? true : never
type _KeyMomentsHasContent = _KeyMomentsSectionProps extends { content: KeyMomentsContent }
  ? true
  : never
type _NextStepsHasContent = _NextStepsSectionProps extends { content: NextStepsContent }
  ? true
  : never
type _DecisionsHasContent = _DecisionsSectionProps extends { content: DecisionsContent }
  ? true
  : never
type _ActionItemsHasContent = _ActionItemsSectionProps extends { content: ActionItemsContent }
  ? true
  : never
type _OpenQuestionsHasContent = _OpenQuestionsSectionProps extends {
  content: OpenQuestionsContent
}
  ? true
  : never

// Compile-time checks — these will error if the types don't match
const _checkSummary: _SummaryHasContent = true
const _checkChanges: _ChangesHasContent = true
const _checkKeyMoments: _KeyMomentsHasContent = true
const _checkNextSteps: _NextStepsHasContent = true
const _checkDecisions: _DecisionsHasContent = true
const _checkActionItems: _ActionItemsHasContent = true
const _checkOpenQuestions: _OpenQuestionsHasContent = true

// Silence "declared but never read" lint warnings
void summaryContent
void changesContent
void keyMomentsContent
void nextStepsContent
void decisionsContent
void actionItemsContent
void openQuestionsContent
void _checkSummary
void _checkChanges
void _checkKeyMoments
void _checkNextSteps
void _checkDecisions
void _checkActionItems
void _checkOpenQuestions
