// Type-checking test file — exercising all analysis types and new IPC channels added in task-1-types-and-schema
// This file MUST fail to compile before the implementation and MUST pass after.
// It is NOT meant to be run — it is a compile-time assertion.

import type {
  AnalysisSectionType,
  AnalysisSection,
  AnalysisSectionContent,
  SummaryContent,
  ChangesContent,
  KeyMomentsContent,
  NextStepsContent,
  DecisionsContent,
  ActionItemsContent,
  OpenQuestionsContent,
  AnalysisResult,
  AnalysisStatus,
  PromptEntry,
  TestStatus,
  GitOperation,
  FileChange,
  MechanicalData,
  SessionAnalysisData,
  SessionDigest,
} from '../analysisTypes'
import type { IPC_CHANNELS } from '../types'

// --- AnalysisSectionType union ---
const _sectionTypes: AnalysisSectionType[] = [
  'summary',
  'changes',
  'key-moments',
  'next-steps',
  'decisions',
  'action-items',
  'open-questions',
]

// --- SummaryContent ---
const _summaryContent: SummaryContent = { text: 'This session did X and Y.' }

// --- ChangesContent ---
const _changesContent: ChangesContent = {
  files: [
    { path: 'src/main.ts', changeType: 'modified', linesAdded: 10, linesRemoved: 2 },
    { path: 'src/new.ts', changeType: 'created' },
    { path: 'src/old.ts', changeType: 'deleted' },
  ],
  prUrl: 'https://github.com/org/repo/pull/42',
}
const _changesContentNoPr: ChangesContent = {
  files: [{ path: 'src/a.ts', changeType: 'modified' }],
}

// --- KeyMomentsContent ---
const _keyMomentsContent: KeyMomentsContent = {
  moments: [{ timestamp: '2024-01-01T00:00:00Z', description: 'Fixed critical bug' }],
}

// --- NextStepsContent ---
const _nextStepsContent: NextStepsContent = { items: ['Review PR', 'Write tests'] }

// --- DecisionsContent ---
const _decisionsContent: DecisionsContent = {
  decisions: [{ decision: 'Use Postgres', rationale: 'Better for structured data' }],
}

// --- ActionItemsContent ---
const _actionItemsContent: ActionItemsContent = {
  items: [
    { text: 'Deploy to staging', completed: false },
    { text: 'Update docs', completed: true },
  ],
}

// --- OpenQuestionsContent ---
const _openQuestionsContent: OpenQuestionsContent = {
  questions: ['Should we cache this?', 'What about auth?'],
}

// --- AnalysisSectionContent is a union of all content types ---
const _sectionContents: AnalysisSectionContent[] = [
  _summaryContent,
  _changesContent,
  _keyMomentsContent,
  _nextStepsContent,
  _decisionsContent,
  _actionItemsContent,
  _openQuestionsContent,
]

// --- AnalysisSection ---
const _analysisSection: AnalysisSection = {
  type: 'summary',
  title: 'Session Summary',
  content: _summaryContent,
}

// --- AnalysisResult ---
const _analysisResult: AnalysisResult = {
  sections: [_analysisSection],
}

// --- AnalysisStatus ---
const _statuses: AnalysisStatus[] = ['none', 'loading', 'ready', 'failed']

// --- PromptEntry ---
const _promptEntry: PromptEntry = { text: 'Fix the bug in auth', timestamp: '2024-01-01T00:00:00Z' }

// --- TestStatus ---
const _testStatusPass: TestStatus = { passed: 10, failed: 0 }
const _testStatusFail: TestStatus = { passed: 7, failed: 3, failedTests: ['test_a', 'test_b'] }

// --- GitOperation ---
const _gitCommit: GitOperation = {
  type: 'commit',
  timestamp: '2024-01-01T00:00:00Z',
  message: 'feat: add feature',
  sha: 'abc1234',
}
const _gitPush: GitOperation = { type: 'push', timestamp: '2024-01-01T00:00:00Z' }
const _gitPr: GitOperation = {
  type: 'pr-create',
  timestamp: '2024-01-01T00:00:00Z',
  prUrl: 'https://github.com/org/repo/pull/1',
}

// --- FileChange ---
const _fileChange: FileChange = { path: 'src/main.ts', changeType: 'modified' }

// --- MechanicalData ---
const _mechanicalData: MechanicalData = {
  testStatus: _testStatusPass,
  promptHistory: [_promptEntry],
  filesChanged: [_fileChange],
  gitOperations: [_gitCommit, _gitPush, _gitPr],
}
const _mechanicalDataNullTest: MechanicalData = {
  testStatus: null,
  promptHistory: [],
  filesChanged: [],
  gitOperations: [],
}

// --- SessionAnalysisData ---
const _sessionAnalysisData: SessionAnalysisData = {
  sessionId: 'session-123',
  mechanical: _mechanicalData,
  analysisStatus: 'ready',
  analysisResult: _analysisResult,
  analysisGeneratedAt: '2024-01-01T00:00:00Z',
}
const _sessionAnalysisDataNulls: SessionAnalysisData = {
  sessionId: 'session-456',
  mechanical: _mechanicalDataNullTest,
  analysisStatus: 'none',
  analysisResult: null,
  analysisGeneratedAt: null,
}

// --- SessionDigest ---
const _sessionDigest: SessionDigest = {
  sessionId: 'session-789',
  projectSlug: 'my-project',
  duration: { startedAt: '2024-01-01T00:00:00Z', endedAt: '2024-01-01T01:00:00Z' },
  prompts: [_promptEntry],
  toolCalls: [
    { tool: 'bash', path: 'src/main.ts', timestamp: '2024-01-01T00:05:00Z' },
    { tool: 'read_file', timestamp: '2024-01-01T00:10:00Z' },
  ],
  errors: [{ message: 'Build failed', timestamp: '2024-01-01T00:15:00Z' }],
  testResults: _testStatusFail,
  filesChanged: [_fileChange],
  gitOperations: [_gitCommit],
}
const _sessionDigestNullResults: SessionDigest = {
  sessionId: 'session-000',
  projectSlug: 'other-project',
  duration: { startedAt: '2024-01-01T00:00:00Z', endedAt: '2024-01-01T00:30:00Z' },
  prompts: [],
  toolCalls: [],
  errors: [],
  testResults: null,
  filesChanged: [],
  gitOperations: [],
}

// --- New IPC Channels in IPC_CHANNELS ---
type _HasGetAnalysis = typeof IPC_CHANNELS extends { GET_ANALYSIS: 'analysis:get' } ? true : never
type _HasTriggerAnalysis = typeof IPC_CHANNELS extends { TRIGGER_ANALYSIS: 'analysis:trigger' }
  ? true
  : never
type _HasAnalysisReady = typeof IPC_CHANNELS extends { ANALYSIS_READY: 'analysis:ready' }
  ? true
  : never

const _checkGetAnalysis: _HasGetAnalysis = true
const _checkTriggerAnalysis: _HasTriggerAnalysis = true
const _checkAnalysisReady: _HasAnalysisReady = true

// Silence "declared but never read" lint warnings
void _sectionTypes
void _summaryContent
void _changesContent
void _changesContentNoPr
void _keyMomentsContent
void _nextStepsContent
void _decisionsContent
void _actionItemsContent
void _openQuestionsContent
void _sectionContents
void _analysisSection
void _analysisResult
void _statuses
void _promptEntry
void _testStatusPass
void _testStatusFail
void _gitCommit
void _gitPush
void _gitPr
void _fileChange
void _mechanicalData
void _mechanicalDataNullTest
void _sessionAnalysisData
void _sessionAnalysisDataNulls
void _sessionDigest
void _sessionDigestNullResults
void _checkGetAnalysis
void _checkTriggerAnalysis
void _checkAnalysisReady
