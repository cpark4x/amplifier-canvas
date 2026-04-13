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
import { buildAnalysisPrompt } from './prompts/analysis'
import { invokeLLM } from './llm'
import { getSettings } from './settings'
import { getAmplifierHome } from './scanner'
import type {
  SessionAnalysisData,
  AnalysisResult,
  MechanicalData,
  AnalysisStatus,
  PromptEntry,
  TestStatus,
  FileChange,
  GitOperation,
  AnalysisSection,
  AnalysisSectionType,
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
      populateMechanicalData(sessionId, events)
    }

    const digest = buildSessionDigest(sessionId, row.projectSlug, events)
    const prompt = buildAnalysisPrompt(digest)
    const settings = getSettings()
    const raw = await invokeLLM(prompt, {
      model: settings.analysisModel,
      provider: settings.analysisProvider ?? undefined,
    })
    const analysisResult = parseAnalysisResponse(raw)

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

function populateMechanicalData(sessionId: string, events: ReturnType<typeof tailReadEvents>['events']): void {
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

const VALID_SECTION_TYPES = new Set<AnalysisSectionType>([
  'summary',
  'changes',
  'key-moments',
  'next-steps',
  'decisions',
  'action-items',
  'open-questions',
])

export function parseAnalysisResponse(raw: string): AnalysisResult {
  // Strip markdown code fences if present
  let text = raw
  if (text.startsWith('```')) {
    const lines = text.split('\n')
    text = lines.slice(1, lines.length - 1).join('\n')
  }

  // Parse JSON
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`LLM response is not valid JSON: ${raw.slice(0, 200)}`)
  }

  // Validate top-level structure
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as Record<string, unknown>)['sections'])
  ) {
    throw new Error('LLM response missing "sections" array')
  }

  const sections = (parsed as Record<string, unknown>)['sections'] as unknown[]

  // Validate each section
  for (const section of sections) {
    const s = section as Record<string, unknown>

    if (typeof s['type'] !== 'string') {
      throw new Error('Section missing "type" field')
    }

    const type = s['type']
    if (!VALID_SECTION_TYPES.has(type as AnalysisSectionType)) {
      throw new Error(`Invalid section type: "${type}"`)
    }

    if (typeof s['title'] !== 'string') {
      throw new Error(`Section "${type}" missing "title" field`)
    }

    if (s['content'] === null || s['content'] === undefined) {
      throw new Error(`Section "${type}" missing "content" field`)
    }
  }

  const validatedSections = sections as AnalysisSection[]
  return { sections: validatedSections }
}

