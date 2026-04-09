import { readFileSync, statSync, openSync, readSync, closeSync } from 'fs'
import path from 'path'
import type { FileActivity, SessionStatus } from '../shared/types'

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
      const parsed = JSON.parse(lines[i]) as ParsedEvent
      if (parsed.type && parsed.timestamp) {
        events.push(parsed)
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

  // If last event is a tool_call, session is running
  if (lastEvent.type === 'tool_call') {
    return 'running'
  }

  // If last event is an assistant message with no pending tool calls
  if (lastEvent.type === 'assistant_message') {
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
  const firstUserMessage = events.find((e) => e.type === 'user_message')
  if (!firstUserMessage) return undefined
  const text = firstUserMessage.data.text
  return typeof text === 'string' ? text : undefined
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
