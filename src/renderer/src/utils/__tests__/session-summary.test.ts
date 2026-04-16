import { describe, it, expect } from 'vitest'
import { generateSessionOneLiner, correlateCommitsToSession } from '../session-summary'
import type { SessionForSummary, CommitInfo } from '../session-summary'

function makeSession(overrides: Partial<SessionForSummary> = {}): SessionForSummary {
  return {
    title: 'test session',
    firstPrompt: 'help me',
    status: 'done',
    startedAt: '2026-04-15T10:00:00Z',
    endedAt: '2026-04-15T11:00:00Z',
    promptCount: 5,
    toolCallCount: 10,
    filesChangedCount: 0,
    ...overrides,
  }
}

function commit(hash: string, message: string, date: string): CommitInfo {
  return { hash, message, date }
}

describe('generateSessionOneLiner', () => {
  it('returns "Shipped: [message]" when one overlapping commit', () => {
    const s = makeSession()
    const commits = [commit('abc', 'feat: add login', '2026-04-15T10:30:00Z')]
    expect(generateSessionOneLiner(s, commits)).toBe('Shipped: feat: add login')
  })

  it('includes +N more when multiple commits', () => {
    const s = makeSession()
    const commits = [
      commit('a', 'feat: login', '2026-04-15T10:30:00Z'),
      commit('b', 'fix: typo', '2026-04-15T10:45:00Z'),
    ]
    const result = generateSessionOneLiner(s, commits)
    expect(result).toContain('Shipped:')
    expect(result).toContain('+1 more')
  })

  it('truncates long commit messages', () => {
    const s = makeSession()
    const commits = [commit('a', 'a'.repeat(60), '2026-04-15T10:30:00Z')]
    const result = generateSessionOneLiner(s, commits)!
    expect(result.length).toBeLessThan(60)
  })

  it('reports file changes when no commits', () => {
    const s = makeSession({ filesChangedCount: 5 })
    expect(generateSessionOneLiner(s, [])).toBe('Changed 5 files')
  })

  it('uses singular "file" for 1 file', () => {
    const s = makeSession({ filesChangedCount: 1 })
    expect(generateSessionOneLiner(s, [])).toBe('Changed 1 file')
  })

  it('shows in-progress for active sessions with many tool calls', () => {
    const s = makeSession({ status: 'active', toolCallCount: 150, promptCount: 20 })
    const result = generateSessionOneLiner(s, [])
    expect(result).toContain('In progress')
    expect(result).toContain('20 prompts')
  })

  it('shows "deep work session" for active with moderate tools', () => {
    const s = makeSession({ status: 'active', toolCallCount: 50, promptCount: 8 })
    expect(generateSessionOneLiner(s, [])).toBe('In progress — deep work session')
  })

  it('returns "Quick task" for ≤2 prompts done', () => {
    const s = makeSession({ promptCount: 2, toolCallCount: 3 })
    expect(generateSessionOneLiner(s, [])).toBe('Quick task')
  })

  it('returns error message for failed sessions', () => {
    const s = makeSession({ status: 'failed', promptCount: 1, toolCallCount: 1 })
    expect(generateSessionOneLiner(s, [])).toBe('Session ended with errors')
  })

  it('returns null when truly no info', () => {
    const s = makeSession({ promptCount: 1, toolCallCount: 1, status: 'active' })
    expect(generateSessionOneLiner(s, [])).toBeNull()
  })
})

describe('correlateCommitsToSession', () => {
  const commits = [
    commit('1', 'before session', '2026-04-15T09:00:00Z'),
    commit('2', 'just before start', '2026-04-15T09:56:00Z'),
    commit('3', 'during session', '2026-04-15T10:30:00Z'),
    commit('4', 'at session end', '2026-04-15T11:00:00Z'),
    commit('5', 'after session', '2026-04-15T12:00:00Z'),
  ]

  it('includes commits within session window', () => {
    const session = { startedAt: '2026-04-15T10:00:00Z', endedAt: '2026-04-15T11:00:00Z' }
    const correlated = correlateCommitsToSession(session, commits)
    expect(correlated.map(c => c.hash)).toContain('3')
    expect(correlated.map(c => c.hash)).toContain('4')
  })

  it('includes commits within 5-minute pre-buffer', () => {
    const session = { startedAt: '2026-04-15T10:00:00Z', endedAt: '2026-04-15T11:00:00Z' }
    const correlated = correlateCommitsToSession(session, commits)
    // commit '2' at 09:56 is within 5-min buffer of 10:00 start
    expect(correlated.map(c => c.hash)).toContain('2')
  })

  it('excludes commits outside window', () => {
    const session = { startedAt: '2026-04-15T10:00:00Z', endedAt: '2026-04-15T11:00:00Z' }
    const correlated = correlateCommitsToSession(session, commits)
    expect(correlated.map(c => c.hash)).not.toContain('1')
    expect(correlated.map(c => c.hash)).not.toContain('5')
  })

  it('handles active session (no endedAt) — uses now as end', () => {
    const session = { startedAt: '2026-01-01T00:00:00Z', endedAt: null }
    const correlated = correlateCommitsToSession(session, commits)
    // All commits after 2026-01-01 should be included
    expect(correlated.length).toBe(5)
  })

  it('returns empty when no commits match', () => {
    const session = { startedAt: '2020-01-01T00:00:00Z', endedAt: '2020-01-01T01:00:00Z' }
    const correlated = correlateCommitsToSession(session, commits)
    expect(correlated).toEqual([])
  })
})