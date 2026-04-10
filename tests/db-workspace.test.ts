import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  initDatabase,
  closeDatabase,
  upsertProject,
  upsertSession,
  getDatabase,
  getRegisteredProjects,
  setProjectRegistered,
  getVisibleProjectSessions,
  setSessionHidden,
  getRegisteredProjectCount,
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

describe('getRegisteredProjects', () => {
  beforeEach(() => setupDb())
  afterEach(() => closeDatabase())

  test('returns only registered=1 projects', () => {
    upsertProject('project-a', '/path/a', 'Project A')
    upsertProject('project-b', '/path/b', 'Project B')
    setProjectRegistered('project-a', 1)
    const registered = getRegisteredProjects()
    assert.equal(registered.length, 1)
    assert.equal(registered[0].slug, 'project-a')
  })

  test('returns empty array when no projects are registered', () => {
    upsertProject('project-a', '/path/a', 'Project A')
    const registered = getRegisteredProjects()
    assert.equal(registered.length, 0)
  })

  test('returns projects sorted by name', () => {
    upsertProject('slug-z', '/path/z', 'Zebra Project')
    upsertProject('slug-a', '/path/a', 'Apple Project')
    upsertProject('slug-m', '/path/m', 'Mango Project')
    setProjectRegistered('slug-z', 1)
    setProjectRegistered('slug-a', 1)
    setProjectRegistered('slug-m', 1)
    const registered = getRegisteredProjects()
    assert.equal(registered.length, 3)
    assert.equal(registered[0].name, 'Apple Project')
    assert.equal(registered[1].name, 'Mango Project')
    assert.equal(registered[2].name, 'Zebra Project')
  })
})

describe('setProjectRegistered', () => {
  beforeEach(() => setupDb())
  afterEach(() => closeDatabase())

  test('sets registered to 1', () => {
    createTestProject()
    setProjectRegistered('test-project', 1)
    const registered = getRegisteredProjects()
    assert.equal(registered.length, 1)
    assert.equal(registered[0].slug, 'test-project')
  })

  test('sets registered back to 0', () => {
    createTestProject()
    setProjectRegistered('test-project', 1)
    setProjectRegistered('test-project', 0)
    const registered = getRegisteredProjects()
    assert.equal(registered.length, 0)
  })
})

describe('getVisibleProjectSessions', () => {
  beforeEach(() => setupDb())
  afterEach(() => closeDatabase())

  test('returns only hidden=0 sessions', () => {
    createTestProject()
    createTestSession('session-1')
    createTestSession('session-2')
    setSessionHidden('session-1', 1)
    const visible = getVisibleProjectSessions('test-project')
    assert.equal(visible.length, 1)
    assert.equal(visible[0].id, 'session-2')
  })

  test('returns empty when all sessions are hidden', () => {
    createTestProject()
    createTestSession('session-1')
    setSessionHidden('session-1', 1)
    const visible = getVisibleProjectSessions('test-project')
    assert.equal(visible.length, 0)
  })
})

describe('setSessionHidden', () => {
  beforeEach(() => setupDb())
  afterEach(() => closeDatabase())

  test('hides a session', () => {
    createTestProject()
    createTestSession()
    setSessionHidden('test-session-1', 1)
    const visible = getVisibleProjectSessions('test-project')
    assert.equal(visible.length, 0)
  })

  test('unhides a session', () => {
    createTestProject()
    createTestSession()
    setSessionHidden('test-session-1', 1)
    setSessionHidden('test-session-1', 0)
    const visible = getVisibleProjectSessions('test-project')
    assert.equal(visible.length, 1)
  })
})

describe('getRegisteredProjectCount', () => {
  beforeEach(() => setupDb())
  afterEach(() => closeDatabase())

  test('returns count of registered projects', () => {
    upsertProject('project-a', '/path/a', 'Project A')
    upsertProject('project-b', '/path/b', 'Project B')
    setProjectRegistered('project-a', 1)
    const count = getRegisteredProjectCount()
    assert.equal(count, 1)
  })

  test('returns 0 when no projects are registered', () => {
    createTestProject()
    const count = getRegisteredProjectCount()
    assert.equal(count, 0)
  })
})
