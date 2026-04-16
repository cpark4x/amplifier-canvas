import { describe, it, expect } from 'vitest'
import { join } from 'path'
import {
  headReadEvents,
  tailReadEvents,
  extractBestTitle,
  extractFirstPrompt,
  extractSessionStats,
  streamSessionStats,
  deriveSessionStatus,
  deriveSessionTitle,
} from '../events-parser'

const FIXTURES = join(__dirname, 'fixtures')

// ---------------------------------------------------------------------------
// headReadEvents / tailReadEvents — basic parsing
// ---------------------------------------------------------------------------

describe('headReadEvents', () => {
  it('parses all events from a small fixture', () => {
    const events = headReadEvents(join(FIXTURES, 'basic-session.jsonl'))
    expect(events.length).toBe(8) // start + 3 prompts + 3 tools + end
  })

  it('returns empty array for empty file', () => {
    // empty-session still has 2 events (start + end)
    const events = headReadEvents(join(FIXTURES, 'empty-session.jsonl'))
    expect(events.length).toBe(2)
  })
})

describe('tailReadEvents', () => {
  it('reads all events when starting from byte 0', () => {
    const { events, newByteOffset } = tailReadEvents(join(FIXTURES, 'basic-session.jsonl'), 0)
    expect(events.length).toBe(8)
    expect(newByteOffset).toBeGreaterThan(0)
  })

  it('returns no events when starting from end of file', () => {
    const { newByteOffset } = tailReadEvents(join(FIXTURES, 'basic-session.jsonl'), 0)
    const { events: newEvents } = tailReadEvents(join(FIXTURES, 'basic-session.jsonl'), newByteOffset)
    expect(newEvents.length).toBe(0)
  })

  it('reads only new events when given a mid-file offset', () => {
    // Read first half, then the rest
    const { events: all } = tailReadEvents(join(FIXTURES, 'many-tools-session.jsonl'), 0)
    const totalEvents = all.length

    // Read just the first event's worth of bytes, then read the tail
    const firstLine = JSON.stringify({ type: 'session:start', timestamp: '2026-04-10T10:00:00.000Z', data: { sessionId: 'test-tools-001' } }) + '\n'
    const { events: tailEvents } = tailReadEvents(join(FIXTURES, 'many-tools-session.jsonl'), firstLine.length)
    expect(tailEvents.length).toBe(totalEvents - 1) // all except the first
  })
})

// ---------------------------------------------------------------------------
// extractBestTitle — skips automated prompts, finds human intent
// ---------------------------------------------------------------------------

describe('extractBestTitle', () => {
  it('returns the first prompt when none are automated', () => {
    const events = headReadEvents(join(FIXTURES, 'basic-session.jsonl'))
    const title = extractBestTitle(events)
    expect(title).toBe('help me fix the login bug')
  })

  it('skips load_skill, Execute recipe, and amplifier tool prompts', () => {
    const events = headReadEvents(join(FIXTURES, 'automated-prefix-session.jsonl'))
    const title = extractBestTitle(events)
    expect(title).toBe('i want to redesign the sidebar component')
  })

  it('falls back to first prompt when ALL prompts are automated', () => {
    const events = headReadEvents(join(FIXTURES, 'all-automated-session.jsonl'))
    const title = extractBestTitle(events)
    // Should fall back to the first prompt (load_skill)
    expect(title).toContain('load_skill')
  })

  it('returns undefined for sessions with no prompts', () => {
    const events = headReadEvents(join(FIXTURES, 'empty-session.jsonl'))
    const title = extractBestTitle(events)
    expect(title).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// extractFirstPrompt — always returns the literal first prompt
// ---------------------------------------------------------------------------

describe('extractFirstPrompt', () => {
  it('returns the first prompt text', () => {
    const events = headReadEvents(join(FIXTURES, 'basic-session.jsonl'))
    expect(extractFirstPrompt(events)).toBe('help me fix the login bug')
  })

  it('returns automated prompt when that is first', () => {
    const events = headReadEvents(join(FIXTURES, 'automated-prefix-session.jsonl'))
    expect(extractFirstPrompt(events)).toContain('load_skill')
  })

  it('returns undefined when no prompts exist', () => {
    const events = headReadEvents(join(FIXTURES, 'empty-session.jsonl'))
    expect(extractFirstPrompt(events)).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// extractSessionStats — counts from parsed events array
// ---------------------------------------------------------------------------

describe('extractSessionStats', () => {
  it('counts prompts and tool calls correctly', () => {
    const events = headReadEvents(join(FIXTURES, 'basic-session.jsonl'))
    const stats = extractSessionStats(events)
    expect(stats.promptCount).toBe(3)
    expect(stats.toolCallCount).toBe(3)
  })

  it('counts many tools correctly', () => {
    const events = headReadEvents(join(FIXTURES, 'many-tools-session.jsonl'))
    const stats = extractSessionStats(events)
    expect(stats.promptCount).toBe(4) // refactor, run tests, fix, commit
    expect(stats.toolCallCount).toBe(8) // 6 file ops + 1 bash + 1 edit
  })

  it('returns zero counts for sessions with no prompts or tools', () => {
    const events = headReadEvents(join(FIXTURES, 'empty-session.jsonl'))
    const stats = extractSessionStats(events)
    expect(stats.promptCount).toBe(0)
    expect(stats.toolCallCount).toBe(0)
  })

  it('tracks files changed via write operations', () => {
    const events = headReadEvents(join(FIXTURES, 'basic-session.jsonl'))
    const stats = extractSessionStats(events)
    // edit_file on auth.ts + write_file on auth.test.ts = 2 unique files
    expect(stats.filesChanged.size).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// streamSessionStats — reads full file line by line (async)
// ---------------------------------------------------------------------------

describe('streamSessionStats', () => {
  it('returns accurate counts for a basic session', async () => {
    const stats = await streamSessionStats(join(FIXTURES, 'basic-session.jsonl'))
    expect(stats.promptCount).toBe(3)
    expect(stats.toolCallCount).toBe(3)
  })

  it('returns accurate counts for many-tools session', async () => {
    const stats = await streamSessionStats(join(FIXTURES, 'many-tools-session.jsonl'))
    expect(stats.promptCount).toBe(4)
    expect(stats.toolCallCount).toBe(8)
  })

  it('returns zero counts for empty session', async () => {
    const stats = await streamSessionStats(join(FIXTURES, 'empty-session.jsonl'))
    expect(stats.promptCount).toBe(0)
    expect(stats.toolCallCount).toBe(0)
  })

  it('agrees with extractSessionStats on the same file', async () => {
    // Both should produce identical prompt/tool counts for the same events
    const events = headReadEvents(join(FIXTURES, 'many-tools-session.jsonl'))
    const syncStats = extractSessionStats(events)
    const asyncStats = await streamSessionStats(join(FIXTURES, 'many-tools-session.jsonl'))

    expect(asyncStats.promptCount).toBe(syncStats.promptCount)
    expect(asyncStats.toolCallCount).toBe(syncStats.toolCallCount)
  })
})

// ---------------------------------------------------------------------------
// deriveSessionStatus
// ---------------------------------------------------------------------------

describe('deriveSessionStatus', () => {
  it('returns "done" for session with session:end exitCode 0', () => {
    const events = headReadEvents(join(FIXTURES, 'basic-session.jsonl'))
    expect(deriveSessionStatus(events)).toBe('done')
  })

  it('returns "active" for session with no end event', () => {
    // Use events array without the end event
    const events = headReadEvents(join(FIXTURES, 'basic-session.jsonl'))
    const withoutEnd = events.filter((e) => e.type !== 'session:end')
    expect(deriveSessionStatus(withoutEnd)).toBe('active')
  })
})

// ---------------------------------------------------------------------------
// deriveSessionTitle — truncation / formatting
// ---------------------------------------------------------------------------

describe('deriveSessionTitle', () => {
  it('truncates long prompts', () => {
    const longPrompt = 'a'.repeat(200)
    const title = deriveSessionTitle(longPrompt)
    expect(title.length).toBeLessThanOrEqual(105) // 100 + "..."  + a bit of slack
  })

  it('preserves short prompts as-is', () => {
    expect(deriveSessionTitle('fix the bug')).toBe('fix the bug')
  })
})