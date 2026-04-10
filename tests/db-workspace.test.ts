import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  initDatabase,
  closeDatabase,
  upsertProject,
  upsertSession,
  getDatabase,
} from '../src/main/db'

function setupDb() {
  return initDatabase(':memory:')
}

function createTestProject(slug = 'test-project') {
  upsertProject(slug, `/some/path/${slug}`, 'Test Project')
}

function createTestSession(id = 'test-session-1', projectSlug = 'test-project') {
  upsertSession({
    id,
    projectSlug,
    startedBy: 'external',
    startedAt: '2024-01-01T00:00:00Z',
    status: 'active',
    byteOffset: 0,
  })
}

describe('Workspace model schema migrations', () => {
  beforeEach(() => setupDb())
  afterEach(() => closeDatabase())

  test('projects table has registered column with default 0', () => {
    createTestProject()
    const d = getDatabase()
    const row = d.prepare('SELECT registered FROM projects WHERE slug = ?').get('test-project') as { registered: number }
    assert.equal(row.registered, 0, 'registered should default to 0')
  })

  test('sessions table has hidden column with default 0', () => {
    createTestProject()
    createTestSession()
    const d = getDatabase()
    const row = d.prepare('SELECT hidden FROM sessions WHERE id = ?').get('test-session-1') as { hidden: number }
    assert.equal(row.hidden, 0, 'hidden should default to 0')
  })

  test('workspace_state table exists', () => {
    const d = getDatabase()
    const tables = d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workspace_state'").all()
    assert.equal(tables.length, 1, 'workspace_state table should exist')
  })

  test('workspace_state supports key-value insert and retrieval', () => {
    const d = getDatabase()
    d.prepare('INSERT INTO workspace_state (key, value) VALUES (?, ?)').run('selectedProjectSlug', 'my-project')
    const row = d.prepare('SELECT value FROM workspace_state WHERE key = ?').get('selectedProjectSlug') as { value: string } | undefined
    assert.equal(row?.value, 'my-project')
  })

  test('workspace_state supports upsert on conflict', () => {
    const d = getDatabase()
    d.prepare('INSERT INTO workspace_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('selectedProjectSlug', 'project-a')
    d.prepare('INSERT INTO workspace_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('selectedProjectSlug', 'project-b')
    const row = d.prepare('SELECT value FROM workspace_state WHERE key = ?').get('selectedProjectSlug') as { value: string }
    assert.equal(row.value, 'project-b')
  })
})
