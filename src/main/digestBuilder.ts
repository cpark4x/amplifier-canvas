import type { ParsedEvent } from './events-parser'
import {
  extractAllPrompts,
  extractErrors,
  extractTestResults,
  extractGitOperations,
  WRITE_OPERATIONS,
} from './events-parser'
import type { SessionDigest, FileChange } from '../shared/analysisTypes'

export function buildSessionDigest(
  sessionId: string,
  projectSlug: string,
  events: ParsedEvent[],
): SessionDigest {
  // Find session:start and session:end for timestamps
  const startEvent = events.find((e) => e.type === 'session:start')
  const endEvent = events.find((e) => e.type === 'session:end')

  // Fallback: use first/last event timestamps, then new Date().toISOString()
  const startedAt = startEvent?.timestamp ?? events[0]?.timestamp ?? new Date().toISOString()
  const endedAt =
    endEvent?.timestamp ?? events[events.length - 1]?.timestamp ?? new Date().toISOString()

  // Build toolCalls from tool_call events and track file changes
  const toolCalls: SessionDigest['toolCalls'] = []
  const filesChangedMap = new Map<string, FileChange>()

  for (const event of events) {
    if (event.type !== 'tool_call') continue

    const data = event.data as Record<string, unknown>
    const tool = data.tool as string | undefined
    if (!tool) continue

    const args = data.args as Record<string, unknown> | undefined
    const filePath = (args?.path ?? args?.file_path) as string | undefined

    toolCalls.push({ tool, path: filePath, timestamp: event.timestamp })

    // Track file changes via Map for WRITE_OPERATIONS
    if (WRITE_OPERATIONS.has(tool) && filePath) {
      let changeType: FileChange['changeType']
      if (tool === 'create_file') {
        changeType = 'created'
      } else if (tool === 'delete_file') {
        changeType = 'deleted'
      } else {
        changeType = 'modified'
      }
      filesChangedMap.set(filePath, { path: filePath, changeType })
    }
  }

  return {
    sessionId,
    projectSlug,
    duration: { startedAt, endedAt },
    prompts: extractAllPrompts(events),
    toolCalls,
    errors: extractErrors(events),
    testResults: extractTestResults(events),
    filesChanged: Array.from(filesChangedMap.values()),
    gitOperations: extractGitOperations(events),
  }
}
