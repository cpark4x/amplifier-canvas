import { readFileSync, statSync } from 'fs'
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

  const buffer = Buffer.alloc(fileSize - fromByte)
  const fd = require('fs').openSync(filePath, 'r')
  try {
    require('fs').readSync(fd, buffer, 0, buffer.length, fromByte)
  } finally {
    require('fs').closeSync(fd)
  }

  const text = buffer.toString('utf-8')
  const lines = text.split('\n').filter((line) => line.trim().length > 0)
  const events: ParsedEvent[] = []

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as ParsedEvent
      if (parsed.type && parsed.timestamp) {
        events.push(parsed)
      }
    } catch {
      // Skip malformed JSON lines — log and continue
      console.warn(`[events-parser] Skipping malformed line in ${filePath}: ${line.substring(0, 80)}`)
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
