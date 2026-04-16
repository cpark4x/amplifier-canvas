import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  initDatabase,
  closeDatabase,
  upsertProject,
  upsertSession,
  getKnownSessionIds,
  getActiveSessionIds,
  incrementSessionStats,
  getSessionsNeedingBackfill,
  getSessionsWithZeroStats,
  updateSessionStats,
  finalizeSession,
  getVisibleProjectSessions,
  getSessionById,
} from '../db'

const TEST_PROJECT = 'test-project-slug'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'canvas-db-test-'))
  initDatabase(join(tmpDir, 'test.db'))
  upsertProject(TEST_PROJECT, '/fake/path', 'Test Project')
})

afterEach(() => {
  closeDatabase()
  rmSync(tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// getKnownSessionIds — returns all session IDs for a project
// ---------------------------------------------------------------------------

describe('getKnownSessionIds', () => {
  it('returns empty set for project with no sessions', () => {
    const ids = getKnownSessionIds(TEST_PROJECT)
    expect(ids.size).toBe(0)
  })

  it('returns all session IDs after upserts', () => {
    upsertSession({ id: 'sess-a', projectSlug: TEST_PROJECT, startedBy: 'external', startedAt: '2026-01-01T00:00:00Z', status: 'done', byteOffset: 100, hidden: true })
    upsertSession({ id: 'sess-b', projectSlug: TEST_PROJECT, startedBy: 'external', startedAt: '2026-01-02T00:00:00Z', status: 'active', byteOffset: 200, hidden: false })
    upsertSession({ id: 'sess-c', projectSlug: TEST_PROJECT, startedBy: 'canvas', startedAt: '2026-01-03T00:00:00Z', status: 'failed', byteOffset: 50, hidden: true })

    const ids = getKnownSessionIds(TEST_PROJECT)
    expect(ids.size).toBe(3)
    expect(ids.has('sess-a')).toBe(true)
    expect(ids.has('sess-b')).toBe(true)
    expect(ids.has('sess-c')).toBe(true)
  })

  it('does not return sessions from other projects', () => {
    upsertProject('other-project', '/other/path', 'Other')
    upsertSession({ id: 'sess-mine', projectSlug: TEST_PROJECT, startedBy: 'external', startedAt: '2026-01-01T00:00:00Z', status: 'done', byteOffset: 100, hidden: true })
    upsertSession({ id: 'sess-other', projectSlug: 'other-project', startedBy: 'external', startedAt: '2026-01-01T00:00:00Z', status: 'done', byteOffset: 100, hidden: true })

    const ids = getKnownSessionIds(TEST_PROJECT)
    expect(ids.size).toBe(1)
    expect(ids.has('sess-mine')).toBe(true)
    expect(ids.has('sess-other')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// getActiveSessionIds — returns only active session IDs
// ---------------------------------------------------------------------------

describe('getActiveSessionIds', () => {
  it('returns only sessions with active status', () => {
    upsertSession({ id: 'sess-done', projectSlug: TEST_PROJECT, startedBy: 'external', startedAt: '2026-01-01T00:00:00Z', status: 'done', byteOffset: 100, hidden: true })
    upsertSession({ id: 'sess-active', projectSlug: TEST_PROJECT, startedBy: 'external', startedAt: '2026-01-02T00:00:00Z', status: 'active', byteOffset: 200, hidden: false })
    upsertSession({ id: 'sess-failed', projectSlug: TEST_PROJECT, startedBy: 'external', startedAt: '2026-01-03T00:00:00Z', status: 'failed', byteOffset: 50, hidden: true })

    const ids = getActiveSessionIds(TEST_PROJECT)
    expect(ids.size).toBe(1)
    expect(ids.has('sess-active')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// incrementSessionStats — additive accumulation
// ---------------------------------------------------------------------------

describe('incrementSessionStats', () => {
  it('adds to existing stats', () => {
    upsertSession({
      id: 'sess-inc', projectSlug: TEST_PROJECT, startedBy: 'external',
      startedAt: '2026-01-01T00:00:00Z', status: 'active', byteOffset: 100, hidden: false,
      promptCount: 5, toolCallCount: 10,
    })

    incrementSessionStats('sess-inc', 3, 7, 2)

    const row = getSessionById('sess-inc')!
    expect(row.promptCount).toBe(8) // 5 + 3
    expect(row.toolCallCount).toBe(17) // 10 + 7
    expect(row.filesChangedCount).toBe(2) // 0 + 2
  })

  it('accumulates across multiple increments', () => {
    upsertSession({
      id: 'sess-multi', projectSlug: TEST_PROJECT, startedBy: 'external',
      startedAt: '2026-01-01T00:00:00Z', status: 'active', byteOffset: 100, hidden: false,
    })

    incrementSessionStats('sess-multi', 2, 5, 1)
    incrementSessionStats('sess-multi', 3, 2, 0)
    incrementSessionStats('sess-multi', 1, 1, 3)

    const row = getSessionById('sess-multi')!
    expect(row.promptCount).toBe(6) // 2+3+1
    expect(row.toolCallCount).toBe(8) // 5+2+1
    expect(row.filesChangedCount).toBe(4) // 1+0+3
  })

  it('works when initial stats are zero/null', () => {
    upsertSession({
      id: 'sess-zero', projectSlug: TEST_PROJECT, startedBy: 'external',
      startedAt: '2026-01-01T00:00:00Z', status: 'active', byteOffset: 100, hidden: false,
    })

    incrementSessionStats('sess-zero', 5, 10, 3)

    const row = getSessionById('sess-zero')!
    expect(row.promptCount).toBe(5)
    expect(row.toolCallCount).toBe(10)
    expect(row.filesChangedCount).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// getSessionsNeedingBackfill — finds sessions with suspicious stats
// ---------------------------------------------------------------------------

describe('getSessionsNeedingBackfill', () => {
  it('returns sessions with promptCount <= 1 and large byteOffset', () => {
    // Large file, low stats — needs backfill
    upsertSession({ id: 'sess-big', projectSlug: TEST_PROJECT, startedBy: 'external', startedAt: '2026-01-01T00:00:00Z', status: 'done', byteOffset: 500000, hidden: true, promptCount: 1 })
    // Large file, good stats — no backfill needed
    upsertSession({ id: 'sess-ok', projectSlug: TEST_PROJECT, startedBy: 'external', startedAt: '2026-01-02T00:00:00Z', status: 'done', byteOffset: 500000, hidden: true, promptCount: 50 })
    // Small file, low stats — no backfill (probably genuinely small)
    upsertSession({ id: 'sess-small', projectSlug: TEST_PROJECT, startedBy: 'external', startedAt: '2026-01-03T00:00:00Z', status: 'done', byteOffset: 5000, hidden: true, promptCount: 0 })

    const needsBackfill = getSessionsNeedingBackfill(TEST_PROJECT)
    const ids = needsBackfill.map((r) => r.id)

    expect(ids).toContain('sess-big')
    expect(ids).not.toContain('sess-ok')
    expect(ids).not.toContain('sess-small')
  })
})

// ---------------------------------------------------------------------------
// getSessionsWithZeroStats
// ---------------------------------------------------------------------------

describe('getSessionsWithZeroStats', () => {
  it('returns sessions with promptCount = 0', () => {
    upsertSession({ id: 'sess-zero', projectSlug: TEST_PROJECT, startedBy: 'external', startedAt: '2026-01-01T00:00:00Z', status: 'done', byteOffset: 100, hidden: true })
    upsertSession({ id: 'sess-has', projectSlug: TEST_PROJECT, startedBy: 'external', startedAt: '2026-01-02T00:00:00Z', status: 'done', byteOffset: 200, hidden: true, promptCount: 5 })

    const zeros = getSessionsWithZeroStats(TEST_PROJECT)
    const ids = zeros.map((r) => r.id)
    expect(ids).toContain('sess-zero')
    expect(ids).not.toContain('sess-has')
  })
})

// ---------------------------------------------------------------------------
// updateSessionStats — overwrites (used for backfill with accurate data)
// ---------------------------------------------------------------------------

describe('updateSessionStats', () => {
  it('overwrites stats with new values', () => {
    upsertSession({ id: 'sess-upd', projectSlug: TEST_PROJECT, startedBy: 'external', startedAt: '2026-01-01T00:00:00Z', status: 'done', byteOffset: 100, hidden: true, promptCount: 10 })

    updateSessionStats('sess-upd', 20, 30)
    let row = getSessionById('sess-upd')!
    expect(row.promptCount).toBe(20)
    expect(row.toolCallCount).toBe(30)

    // Overwrites — does NOT use MAX semantics
    // This is intentional: used by backfill with accurate full-file counts
    updateSessionStats('sess-upd', 5, 5)
    row = getSessionById('sess-upd')!
    expect(row.promptCount).toBe(5)
    expect(row.toolCallCount).toBe(5)
  })
})