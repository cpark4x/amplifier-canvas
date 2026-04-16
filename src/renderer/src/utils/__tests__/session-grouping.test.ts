import { describe, it, expect } from 'vitest'
import { groupRelatedSessions } from '../session-grouping'
import type { GroupableSession } from '../session-grouping'

function session(id: string, title: string | null, date: string, classification = 'deep-work'): GroupableSession {
  return { id, title, startedAt: `${date}T10:00:00Z`, classification }
}

describe('groupRelatedSessions', () => {
  it('returns empty when ≤3 sessions (not useful to group)', () => {
    const sessions = [
      session('a', 'auth feature', '2026-04-15'),
      session('b', 'auth tests', '2026-04-15'),
      session('c', 'auth refactor', '2026-04-15'),
    ]
    expect(groupRelatedSessions(sessions)).toEqual([])
  })

  it('groups sessions on same day sharing ≥2 significant words', () => {
    const sessions = [
      session('a', 'auth feature login flow', '2026-04-15'),
      session('b', 'auth feature signup flow', '2026-04-15'),
      session('c', 'database migration setup', '2026-04-15'),
      session('d', 'database migration testing', '2026-04-15'),
    ]
    const groups = groupRelatedSessions(sessions)
    expect(groups.length).toBe(2)

    const authGroup = groups.find(g => g.sessions.includes('a'))
    expect(authGroup).toBeDefined()
    expect(authGroup!.sessions).toContain('b')

    const dbGroup = groups.find(g => g.sessions.includes('c'))
    expect(dbGroup).toBeDefined()
    expect(dbGroup!.sessions).toContain('d')
  })

  it('does not group sessions on different days', () => {
    const sessions = [
      session('a', 'auth feature login flow', '2026-04-15'),
      session('b', 'auth feature signup flow', '2026-04-16'),
      session('c', 'unrelated thing one', '2026-04-15'),
      session('d', 'unrelated thing two', '2026-04-16'),
    ]
    const groups = groupRelatedSessions(sessions)
    expect(groups).toEqual([])
  })

  it('does not group sessions with only stop words in common', () => {
    const sessions = [
      session('a', 'fix the login page', '2026-04-15'),
      session('b', 'add the sidebar style', '2026-04-15'),
      session('c', 'update the readme file', '2026-04-15'),
      session('d', 'change the button color', '2026-04-15'),
    ]
    // "the" is a stop word — no significant words shared
    const groups = groupRelatedSessions(sessions)
    expect(groups).toEqual([])
  })

  it('handles null titles gracefully', () => {
    const sessions = [
      session('a', null, '2026-04-15'),
      session('b', null, '2026-04-15'),
      session('c', 'auth feature work', '2026-04-15'),
      session('d', 'auth feature tests', '2026-04-15'),
    ]
    const groups = groupRelatedSessions(sessions)
    // Null titles have no words — can't group. Auth pair should group.
    expect(groups.length).toBe(1)
    expect(groups[0].sessions).toContain('c')
    expect(groups[0].sessions).toContain('d')
  })

  it('uses earliest startedAt for group timestamp', () => {
    const sessions = [
      session('a', 'canvas renderer pipeline', '2026-04-15'),
      session('b', 'canvas renderer styling', '2026-04-15'),
      session('c', 'unrelated other work', '2026-04-15'),
      session('d', 'different topic entirely', '2026-04-15'),
    ]
    // Override startedAt to test ordering
    sessions[0].startedAt = '2026-04-15T14:00:00Z'
    sessions[1].startedAt = '2026-04-15T09:00:00Z'

    const groups = groupRelatedSessions(sessions)
    const canvasGroup = groups.find(g => g.sessions.includes('a'))
    expect(canvasGroup).toBeDefined()
    expect(canvasGroup!.startedAt).toBe('2026-04-15T09:00:00Z')
  })

  it('label contains top frequent words capitalized', () => {
    const sessions = [
      session('a', 'canvas renderer pipeline refactor', '2026-04-15'),
      session('b', 'canvas renderer styling updates', '2026-04-15'),
      session('c', 'canvas renderer testing suite', '2026-04-15'),
      session('d', 'unrelated filler session here', '2026-04-15'),
    ]
    const groups = groupRelatedSessions(sessions)
    const canvasGroup = groups.find(g => g.sessions.includes('a'))
    expect(canvasGroup).toBeDefined()
    expect(canvasGroup!.label).toContain('Canvas')
    expect(canvasGroup!.label).toContain('Renderer')
    expect(canvasGroup!.label).toMatch(/work$/)
  })
})