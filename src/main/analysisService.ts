import { join } from 'path'
import {
  getSessionById,
  saveMechanicalData,
  saveAnalysisResult,
  updateAnalysisStatus,
  type SessionRow,
} from './db'
import {
  tailReadEvents,
  extractAllPrompts,
  extractTestResults,
  extractGitOperations,
  WRITE_OPERATIONS,
} from './events-parser'
import { buildSessionDigest } from './digestBuilder'
import { getAmplifierHome } from './scanner'
import type {
  SessionAnalysisData,
  SessionDigest,
  AnalysisResult,
  MechanicalData,
  AnalysisStatus,
  PromptEntry,
  TestStatus,
  FileChange,
  GitOperation,
} from '../shared/analysisTypes'

// --- Public API ---

export function getAnalysis(sessionId: string): SessionAnalysisData | null {
  const row = getSessionById(sessionId)
  if (!row) return null

  const mechanical = parseMechanicalData(row)
  const analysisStatus: AnalysisStatus = (row.analysis_status as AnalysisStatus) ?? 'none'
  const analysisResult = parseJSON<AnalysisResult>(row.analysis_json)
  const analysisGeneratedAt = row.analysis_generated_at ?? null

  return {
    sessionId,
    mechanical,
    analysisStatus,
    analysisResult,
    analysisGeneratedAt,
  }
}

export async function triggerAnalysis(sessionId: string): Promise<SessionAnalysisData | null> {
  const row = getSessionById(sessionId)
  if (!row) return null

  try {
    updateAnalysisStatus(sessionId, 'loading')

    // Read events once — reused for mechanical population and digest building
    const { events } = tailReadEvents(buildEventsPath(row.projectSlug, sessionId), 0)

    // Populate mechanical data on first trigger
    if (!row.prompt_history) {
      populateMechanicalData(sessionId, row, events)
    }

    const digest = buildSessionDigest(sessionId, row.projectSlug, events)
    const analysisResult = generateMockAnalysis(digest)

    saveAnalysisResult(sessionId, {
      analysis_json: JSON.stringify(analysisResult),
      analysis_generated_at: new Date().toISOString(),
      analysis_status: 'ready',
    })
  } catch (err) {
    console.error(`[analysisService] triggerAnalysis failed for ${sessionId}:`, err)
    updateAnalysisStatus(sessionId, 'failed')
  }

  return getAnalysis(sessionId)
}

// --- Private helpers ---

function buildEventsPath(projectSlug: string, sessionId: string): string {
  return join(getAmplifierHome(), 'projects', projectSlug, 'sessions', sessionId, 'events.jsonl')
}

function populateMechanicalData(sessionId: string, row: SessionRow, events: ReturnType<typeof tailReadEvents>['events']): void {
  const prompts = extractAllPrompts(events)
  const testResults = extractTestResults(events)
  const gitOps = extractGitOperations(events)

  // Track file changes from write operations
  const filesChangedMap = new Map<string, FileChange>()
  for (const event of events) {
    if (event.type !== 'tool_call') continue
    const data = event.data as Record<string, unknown>
    const tool = data.tool as string | undefined
    if (!tool || !WRITE_OPERATIONS.has(tool)) continue
    const args = data.args as Record<string, unknown> | undefined
    const filePath = (args?.path ?? args?.file_path) as string | undefined
    if (!filePath) continue

    let changeType: FileChange['changeType']
    if (tool === 'create_file') changeType = 'created'
    else if (tool === 'delete_file') changeType = 'deleted'
    else changeType = 'modified'

    filesChangedMap.set(filePath, { path: filePath, changeType })
  }

  saveMechanicalData(sessionId, {
    test_status: testResults ? JSON.stringify(testResults) : null,
    prompt_history: JSON.stringify(prompts),
    files_changed: JSON.stringify(Array.from(filesChangedMap.values())),
    git_operations: JSON.stringify(gitOps),
  })
}

function parseMechanicalData(row: SessionRow): MechanicalData {
  return {
    testStatus: parseJSON<TestStatus>(row.test_status),
    promptHistory: parseJSON<PromptEntry[]>(row.prompt_history) ?? [],
    filesChanged: parseJSON<FileChange[]>(row.files_changed) ?? [],
    gitOperations: parseJSON<GitOperation[]>(row.git_operations) ?? [],
  }
}

function parseJSON<T>(json: string | null | undefined): T | null {
  if (!json) return null
  try {
    return JSON.parse(json) as T
  } catch {
    return null
  }
}

function generateMockAnalysis(digest: SessionDigest): AnalysisResult {
  const sections: AnalysisResult['sections'] = []

  // Always include summary section
  const promptTexts = digest.prompts.map((p) => p.text).join(', ')
  const summaryText =
    digest.prompts.length > 0
      ? `Session focused on: ${promptTexts.slice(0, 200)}${promptTexts.length > 200 ? '...' : ''}`
      : 'Session completed with no recorded prompts.'

  sections.push({
    type: 'summary',
    title: 'Summary',
    content: { text: summaryText },
  })

  // Include changes section if files were modified
  if (digest.filesChanged.length > 0) {
    const prUrl = digest.gitOperations.find((op) => op.type === 'pr-create')?.prUrl
    sections.push({
      type: 'changes',
      title: 'Changes',
      content: {
        files: digest.filesChanged.map((f) => ({
          path: f.path,
          changeType: f.changeType,
        })),
        ...(prUrl ? { prUrl } : {}),
      },
    })
  }

  // Include key-moments if errors or test results present
  if (digest.errors.length > 0 || digest.testResults !== null) {
    const moments: Array<{ timestamp: string; description: string }> = []

    if (digest.testResults !== null) {
      const ts = digest.testResults
      moments.push({
        timestamp: digest.duration.endedAt,
        description: `Tests: ${ts.passed} passed, ${ts.failed} failed`,
      })
    }

    for (const error of digest.errors.slice(0, 3)) {
      moments.push({
        timestamp: error.timestamp,
        description: `Error: ${error.message.slice(0, 100)}`,
      })
    }

    sections.push({
      type: 'key-moments',
      title: 'Key Moments',
      content: { moments },
    })
  }

  // Always include next-steps
  sections.push({
    type: 'next-steps',
    title: 'Next Steps',
    content: {
      items: [
        'Review the changes made in this session',
        'Run the full test suite to verify nothing is broken',
      ],
    },
  })

  return { sections }
}
