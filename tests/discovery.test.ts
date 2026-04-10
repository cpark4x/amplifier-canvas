import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { discoverProjects } from '../src/main/discovery'
import { initDatabase, closeDatabase, upsertProject, setProjectRegistered, getDatabase } from '../src/main/db'

let testDir: string

function setupTestDir() {
  testDir = join(tmpdir(), `canvas-discovery-test-${Date.now()}`)
  mkdirSync(join(testDir, 'projects'), { recursive: true })
}

function teardownTestDir() {
  rmSync(testDir, { recursive: true, force: true })
}

function createFakeProject(slug: string) {
  const projectDir = join(testDir, 'projects', slug)
  mkdirSync(join(projectDir, 'sessions', 'fake-session'), { recursive: true })
  writeFileSync(join(projectDir, 'sessions', 'fake-session', 'events.jsonl'), '{}')
}

describe('discoverProjects', () => {
  beforeEach(() => {
    setupTestDir()
    initDatabase(':memory:')
  })
  afterEach(() => {
    closeDatabase()
    teardownTestDir()
  })

  test('discovers project directories under ~/.amplifier/projects/', () => {
    createFakeProject('alpha')
    createFakeProject('beta')

    const discovered = discoverProjects(testDir)
    assert.equal(discovered.length, 2)
    const slugs = discovered.map((p) => p.slug).sort()
    assert.deepEqual(slugs, ['alpha', 'beta'])
  })

  test('returns slug, name, and path for each project', () => {
    createFakeProject('my-project')

    const discovered = discoverProjects(testDir)
    assert.equal(discovered.length, 1)
    assert.equal(discovered[0].slug, 'my-project')
    assert.equal(discovered[0].name, 'My Project')
    assert.ok(discovered[0].path.includes('my-project'))
  })

  test('excludes projects that are already registered', () => {
    createFakeProject('registered-project')
    createFakeProject('unregistered-project')

    upsertProject('registered-project', join(testDir, 'projects', 'registered-project'), 'Registered Project')
    setProjectRegistered('registered-project', 1)

    const discovered = discoverProjects(testDir)
    assert.equal(discovered.length, 1)
    assert.equal(discovered[0].slug, 'unregistered-project')
  })

  test('returns empty array when projects directory does not exist', () => {
    rmSync(join(testDir, 'projects'), { recursive: true, force: true })
    const discovered = discoverProjects(testDir)
    assert.deepEqual(discovered, [])
  })

  test('does not write to the database', () => {
    createFakeProject('new-project')
    discoverProjects(testDir)

    const d = getDatabase()
    const rows = d.prepare('SELECT * FROM projects').all()
    assert.equal(rows.length, 0, 'discoverProjects should not upsert projects into DB')
  })
})
