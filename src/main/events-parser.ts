import { readFileSync, statSync, openSync, readSync, closeSync } from 'fs'
import path from 'path'
import type { FileActivity, SessionStatus } from '../shared/types'
import type { PromptEntry, TestStatus, GitOperation } from '../shared/analysisTypes'

export interface ParsedEvent {
  type: string
  timestamp: string
  data: Record<string, unknown>
}

export interface TailReadResult {
  events: ParsedEvent[]
  newByteOffset: number
}

// Max bytes to read from the tail of an events.jsonl file.
// 256KB is enough for status derivation and recent file activity.
const MAX_TAIL_BYTES = 256 * 1024

// Max bytes to read from the HEAD of an events.jsonl file.
// session:start events can contain 600KB+ of context, so we need to read past
// them to reach the first prompt:submit (usually the 3rd event).
const MAX_HEAD_BYTES = 1024 * 1024 // 1MB

/**
 * Read the first few events from the HEAD of an events.jsonl file.
 * Used to extract the first user prompt for title derivation.
 * Unlike tailReadEvents, this reads from byte 0 forward.
 */
export function headReadEvents(filePath: string): ParsedEvent[] {
  let fileSize: number
  try {
    fileSize = statSync(filePath).size
  } catch {
    return []
  }
  if (fileSize === 0) return []

  const bytesToRead = Math.min(fileSize, MAX_HEAD_BYTES)
  const buffer = Buffer.alloc(bytesToRead)
  const fd = openSync(filePath, 'r')
  try {
    readSync(fd, buffer, 0, bytesToRead, 0) // read from byte 0
  } finally {
    closeSync(fd)
  }

  const text = buffer.toString('utf-8')
  const lines = text.split('\n').filter((line) => line.trim().length > 0)
  const events: ParsedEvent[] = []

  for (const line of lines) {
    try {
      const raw = JSON.parse(line) as Record<string, unknown>
      const type = (raw.type ?? raw.event) as string | undefined
      const timestamp = (raw.timestamp ?? raw.ts) as string | undefined
      if (type && timestamp) {
        events.push({ type, timestamp, data: (raw.data ?? {}) as Record<string, unknown> })
      }
    } catch {
      // Skip — last line may be truncated
    }
  }

  return events
}

export function tailReadEvents(filePath: string, fromByte: number): TailReadResult {
  let fileSize: number
  try {
    fileSize = statSync(filePath).size
  } catch {
    return { events: [], newByteOffset: fromByte }
  }

  if (fileSize <= fromByte) {
    return { events: [], newByteOffset: fromByte }
  }

  // Cap the read to MAX_TAIL_BYTES from the end of the file.
  // For initial scans (fromByte=0) on large files, we only need the tail.
  const bytesToRead = Math.min(fileSize - fromByte, MAX_TAIL_BYTES)
  const readStart = fileSize - bytesToRead

  const buffer = Buffer.alloc(bytesToRead)
  const fd = openSync(filePath, 'r')
  try {
    readSync(fd, buffer, 0, bytesToRead, readStart)
  } finally {
    closeSync(fd)
  }

  const text = buffer.toString('utf-8')
  const lines = text.split('\n').filter((line) => line.trim().length > 0)
  const events: ParsedEvent[] = []

  // If we read from mid-file, the first line is likely partial — skip it
  const startIndex = readStart > fromByte ? 1 : 0

  for (let i = startIndex; i < lines.length; i++) {
    try {
      const raw = JSON.parse(lines[i]) as Record<string, unknown>
      // Amplifier events.jsonl uses 'event' and 'ts' as field names.
      // Normalize to our internal ParsedEvent shape ('type' and 'timestamp').
      const type = (raw.type ?? raw.event) as string | undefined
      const timestamp = (raw.timestamp ?? raw.ts) as string | undefined
      if (type && timestamp) {
        events.push({ type, timestamp, data: (raw.data ?? {}) as Record<string, unknown> })
      }
    } catch {
      // Skip malformed JSON lines (common for partial first line)
    }
  }

  return { events, newByteOffset: fileSize }
}

export function deriveSessionStatus(events: ParsedEvent[]): SessionStatus {
  if (events.length === 0) {
    return 'active'
  }

  const lastEvent = events[events.length - 1]

  if (lastEvent.type === 'session:end') {
    const exitCode = (lastEvent.data as Record<string, unknown>)?.exitCode
    return exitCode !== 0 ? 'failed' : 'done'
  }

  // Amplifier events: tool:pre/tool:post = tool in progress, execution:start = running
  if (lastEvent.type === 'tool:pre' || lastEvent.type === 'tool:post' ||
      lastEvent.type === 'tool_call' || lastEvent.type === 'execution:start') {
    return 'running'
  }

  // orchestrator:complete or prompt:complete with no session:end = waiting for input
  // assistant_message (legacy format) also means waiting for input
  if (lastEvent.type === 'orchestrator:complete' || lastEvent.type === 'prompt:complete' ||
      lastEvent.type === 'assistant_message') {
    return 'needs_input'
  }

  // Default: check recency — if last event within 30s, running
  const lastTimestamp = new Date(lastEvent.timestamp).getTime()
  const now = Date.now()
  if (now - lastTimestamp < 30_000) {
    return 'running'
  }

  return 'active'
}

const TOOL_TO_OPERATION: Record<string, FileActivity['operation']> = {
  read_file: 'read',
  write_file: 'write',
  edit_file: 'edit',
  create_file: 'create',
  apply_patch: 'edit',
  delete_file: 'delete',
}

export function extractFileActivity(events: ParsedEvent[]): FileActivity[] {
  const activities: FileActivity[] = []

  for (const event of events) {
    if (event.type !== 'tool_call') continue

    const data = event.data as Record<string, unknown>
    const tool = data.tool as string | undefined
    if (!tool) continue

    const operation = TOOL_TO_OPERATION[tool]
    if (!operation) continue

    const args = data.args as Record<string, unknown> | undefined
    const filePath = args?.path as string | undefined
    if (!filePath) continue

    activities.push({
      path: filePath,
      operation,
      timestamp: event.timestamp,
    })
  }

  return activities
}

export function extractFirstPrompt(events: ParsedEvent[]): string | undefined {
  // Amplifier events use 'prompt:submit' with data.prompt for user messages.
  // Also check 'user_message' with data.text as a fallback for other formats.
  const promptSubmit = events.find((e) => e.type === 'prompt:submit')
  if (promptSubmit) {
    const prompt = promptSubmit.data.prompt
    return typeof prompt === 'string' ? prompt : undefined
  }
  const userMessage = events.find((e) => e.type === 'user_message')
  if (userMessage) {
    const text = userMessage.data.text
    return typeof text === 'string' ? text : undefined
  }
  return undefined
}

export interface SessionStats {
  promptCount: number
  toolCallCount: number
  filesChanged: Set<string>
  lastEventTimestamp: string | undefined
}

export const WRITE_OPERATIONS = new Set([
  'write_file',
  'edit_file',
  'create_file',
  'apply_patch',
  'delete_file',
])

export function extractSessionStats(events: ParsedEvent[]): SessionStats {
  let promptCount = 0
  let toolCallCount = 0
  const filesChanged = new Set<string>()
  let lastEventTimestamp: string | undefined

  for (const event of events) {
    lastEventTimestamp = event.timestamp

    if (event.type === 'user_message' || event.type === 'prompt:submit') {
      promptCount++
    } else if (event.type === 'tool_call' || event.type === 'tool:pre') {
      toolCallCount++
      const data = event.data as Record<string, unknown>
      const tool = (data.tool ?? data.name) as string | undefined
      if (tool && WRITE_OPERATIONS.has(tool)) {
        const args = data.args as Record<string, unknown> | undefined
        const filePath = args?.path as string | undefined
        if (filePath) {
          filesChanged.add(filePath)
        }
      }
    }
  }

  return { promptCount, toolCallCount, filesChanged, lastEventTimestamp }
}

export function deriveSessionTitle(firstPrompt: string): string {
  if (!firstPrompt) return ''

  // Strip markdown bold (**text**) and inline code (`text`)
  const stripped = firstPrompt
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')

  if (stripped.length <= 60) return stripped

  // Truncate at last word boundary at or before position 60
  const truncated = stripped.slice(0, 60)
  const lastSpace = truncated.lastIndexOf(' ')
  const cutPoint = lastSpace > 0 ? lastSpace : 60
  return stripped.slice(0, cutPoint) + '...'
}

export function extractWorkDir(events: ParsedEvent[], sessionDir?: string): string | undefined {
  const startEvent = events.find((e) => e.type === 'session:start')
  if (!startEvent) return undefined

  const data = startEvent.data as Record<string, unknown>
  // Check common field names for working directory
  const rawDir = (data.cwd as string) || (data.workDir as string) || (data.project_dir as string)
  if (!rawDir) return undefined

  // If the path is relative and we have a session directory, resolve against it
  if (sessionDir && !path.isAbsolute(rawDir)) {
    return path.resolve(sessionDir, rawDir)
  }

  return rawDir
}

export function extractAllPrompts(events: ParsedEvent[]): PromptEntry[] {
  const prompts: PromptEntry[] = []
  for (const event of events) {
    if (event.type === 'prompt:submit') {
      const prompt = event.data.prompt
      if (typeof prompt === 'string') {
        prompts.push({ text: prompt, timestamp: event.timestamp })
      }
    } else if (event.type === 'user_message') {
      const text = event.data.text
      if (typeof text === 'string') {
        prompts.push({ text, timestamp: event.timestamp })
      }
    }
  }
  return prompts
}

export function extractErrors(
  events: ParsedEvent[],
): Array<{ message: string; timestamp: string }> {
  const errors: Array<{ message: string; timestamp: string }> = []
  for (const event of events) {
    if (event.type === 'error') {
      const message = event.data.message
      if (typeof message === 'string') {
        errors.push({ message, timestamp: event.timestamp })
      }
    } else if (event.type === 'tool_result' || event.type === 'tool:post') {
      if (event.data.error === true) {
        const output = (event.data.output ?? event.data.result) as string | undefined
        if (typeof output === 'string') {
          errors.push({ message: output, timestamp: event.timestamp })
        }
      }
    }
  }
  return errors
}

export function extractTestResults(events: ParsedEvent[]): TestStatus | null {
  const passedPattern = /(\d+)\s+passed/
  const failedPattern = /(\d+)\s+failed/
  let lastResult: TestStatus | null = null

  for (const event of events) {
    if (event.type !== 'tool_result' && event.type !== 'tool:post') continue
    const output = (event.data.output ?? event.data.result)
    if (typeof output !== 'string') continue

    const passedMatch = passedPattern.exec(output)
    if (passedMatch) {
      const passed = parseInt(passedMatch[1], 10)
      const failedMatch = failedPattern.exec(output)
      const failed = failedMatch ? parseInt(failedMatch[1], 10) : 0
      lastResult = { passed, failed }
    }
  }

  return lastResult
}

export function extractGitOperations(events: ParsedEvent[]): GitOperation[] {
  const operations: GitOperation[] = []
  const commitPattern = /\[[\w/.-]+\s+([a-f0-9]{7,})\]\s+(.+)/
  const prUrlPattern = /(https:\/\/github\.com\/[^\s]+\/pull\/\d+)/

  for (const event of events) {
    if (event.type !== 'tool_result' && event.type !== 'tool:post') continue
    const output = (event.data.output ?? event.data.result)
    if (typeof output !== 'string') continue

    // Check for PR URL first
    const prMatch = prUrlPattern.exec(output)
    if (prMatch) {
      operations.push({
        type: 'pr-create',
        timestamp: event.timestamp,
        prUrl: prMatch[1],
      })
      continue
    }

    // Check for commit pattern
    const commitMatch = commitPattern.exec(output)
    if (commitMatch) {
      operations.push({
        type: 'commit',
        timestamp: event.timestamp,
        sha: commitMatch[1],
        message: commitMatch[2].trim(),
      })
      continue
    }

    // Check for push indicators
    if (output.includes('->') && (output.includes('git push') || output.includes('To github.com'))) {
      operations.push({
        type: 'push',
        timestamp: event.timestamp,
      })
    }
  }

  return operations
}
