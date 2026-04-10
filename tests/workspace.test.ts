import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { initDatabase, closeDatabase } from '../src/main/db'
import { getWorkspaceState, saveWorkspaceState } from '../src/main/workspace'

function setupDb() {
  return initDatabase(':memory:')
}

describe('getWorkspaceState', () => {
  beforeEach(() => setupDb())
  afterEach(() => closeDatabase())

  test('returns null/default values when no state saved', async () => {
    const state = getWorkspaceState()
    assert.equal(state.selectedProjectSlug, null)
    assert.deepEqual(state.expandedProjectSlugs, [])
    assert.equal(state.selectedSessionId, null)
    assert.equal(state.sidebarCollapsed, false)
  })

  test('returns saved state after saveWorkspaceState', async () => {
    saveWorkspaceState({
      selectedProjectSlug: 'my-project',
      expandedProjectSlugs: ['project-a', 'project-b'],
      selectedSessionId: 'session-123',
      sidebarCollapsed: true,
    })
    const state = getWorkspaceState()
    assert.equal(state.selectedProjectSlug, 'my-project')
    assert.deepEqual(state.expandedProjectSlugs, ['project-a', 'project-b'])
    assert.equal(state.selectedSessionId, 'session-123')
    assert.equal(state.sidebarCollapsed, true)
  })

  test('overwrites previous state correctly', async () => {
    saveWorkspaceState({
      selectedProjectSlug: 'project-old',
      expandedProjectSlugs: ['project-old'],
      selectedSessionId: 'session-old',
      sidebarCollapsed: false,
    })
    saveWorkspaceState({
      selectedProjectSlug: 'project-new',
      expandedProjectSlugs: ['project-new', 'project-extra'],
      selectedSessionId: 'session-new',
      sidebarCollapsed: true,
    })
    const state = getWorkspaceState()
    assert.equal(state.selectedProjectSlug, 'project-new')
    assert.deepEqual(state.expandedProjectSlugs, ['project-new', 'project-extra'])
    assert.equal(state.selectedSessionId, 'session-new')
    assert.equal(state.sidebarCollapsed, true)
  })

  test('handles partial updates: null values delete the key', async () => {
    saveWorkspaceState({
      selectedProjectSlug: 'my-project',
      expandedProjectSlugs: ['project-a'],
      selectedSessionId: 'session-123',
      sidebarCollapsed: true,
    })
    saveWorkspaceState({
      selectedProjectSlug: null,
      expandedProjectSlugs: [],
      selectedSessionId: null,
      sidebarCollapsed: false,
    })
    const state = getWorkspaceState()
    assert.equal(state.selectedProjectSlug, null)
    assert.deepEqual(state.expandedProjectSlugs, [])
    assert.equal(state.selectedSessionId, null)
    assert.equal(state.sidebarCollapsed, false)
  })
})
