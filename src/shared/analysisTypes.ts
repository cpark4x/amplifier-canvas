// Analysis type system for Phase 2 — AI-curated session summaries

// --- Section type union ---

export type AnalysisSectionType =
  | 'summary'
  | 'changes'
  | 'key-moments'
  | 'next-steps'
  | 'decisions'
  | 'action-items'
  | 'open-questions'

// --- Section content interfaces ---

export interface SummaryContent {
  text: string
}

export interface ChangesContent {
  files: Array<{
    path: string
    changeType: 'created' | 'modified' | 'deleted'
    linesAdded?: number
    linesRemoved?: number
  }>
  prUrl?: string
}

export interface KeyMomentsContent {
  moments: Array<{
    timestamp: string
    description: string
  }>
}

export interface NextStepsContent {
  items: string[]
}

export interface DecisionsContent {
  decisions: Array<{
    decision: string
    rationale: string
  }>
}

export interface ActionItemsContent {
  items: Array<{
    text: string
    completed: boolean
  }>
}

export interface OpenQuestionsContent {
  questions: string[]
}

export type AnalysisSectionContent =
  | SummaryContent
  | ChangesContent
  | KeyMomentsContent
  | NextStepsContent
  | DecisionsContent
  | ActionItemsContent
  | OpenQuestionsContent

// --- Section and result ---

export interface AnalysisSection {
  type: AnalysisSectionType
  title: string
  content: AnalysisSectionContent
}

export interface AnalysisResult {
  sections: AnalysisSection[]
}

// --- Status ---

export type AnalysisStatus = 'none' | 'loading' | 'ready' | 'failed'

// --- Mechanical data types ---

export interface PromptEntry {
  text: string
  timestamp: string
}

export interface TestStatus {
  passed: number
  failed: number
  failedTests?: string[]
}

export interface GitOperation {
  type: 'commit' | 'push' | 'pr-create'
  timestamp: string
  message?: string
  sha?: string
  prUrl?: string
}

export interface FileChange {
  path: string
  changeType: 'created' | 'modified' | 'deleted'
}

export interface MechanicalData {
  testStatus: TestStatus | null
  promptHistory: PromptEntry[]
  filesChanged: FileChange[]
  gitOperations: GitOperation[]
}

// --- Session-level aggregates ---

export interface SessionAnalysisData {
  sessionId: string
  mechanical: MechanicalData
  analysisStatus: AnalysisStatus
  analysisResult: AnalysisResult | null
  analysisGeneratedAt: string | null
}

export interface SessionDigest {
  sessionId: string
  projectSlug: string
  duration: {
    startedAt: string
    endedAt: string
  }
  prompts: PromptEntry[]
  toolCalls: Array<{
    tool: string
    path?: string
    timestamp: string
  }>
  errors: Array<{
    message: string
    timestamp: string
  }>
  testResults: TestStatus | null
  filesChanged: FileChange[]
  gitOperations: GitOperation[]
}
