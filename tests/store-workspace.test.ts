/**
 * Unit tests for workspace-related store state in the Zustand store.
 * Tests expandedProjectSlugs, toggleProjectExpanded, setExpandedProjectSlugs,
 * and selectProject (non-toggle) behavior.
 *
 * Strategy: use Zustand's static .getState() method to access/mutate the
 * store without needing React context.
 */

import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { useCanvasStore } from '../src/renderer/src/store.ts'

// Reset store state between tests
function resetStore() {
  useCanvasStore.setState({
    expandedProjectSlugs: [],
    selectedProjectSlug: null,
  })
}

describe('expandedProjectSlugs initial state', () => {
  test('expandedProjectSlugs exists in initial state', () => {
    const initial = useCanvasStore.getInitialState()
    assert.ok('expandedProjectSlugs' in initial, 'expandedProjectSlugs should exist in initial store state')
  })

  test('expandedProjectSlugs initializes as empty array', () => {
    const initial = useCanvasStore.getInitialState()
    assert.deepEqual(initial.expandedProjectSlugs, [])
  })
})

describe('toggleProjectExpanded', () => {
  beforeEach(() => resetStore())

  test('adds slug when not present', () => {
    useCanvasStore.getState().toggleProjectExpanded('project-alpha')
    const slugs = useCanvasStore.getState().expandedProjectSlugs
    assert.ok(slugs.includes('project-alpha'), 'slug should be added')
  })

  test('removes slug when already present', () => {
    useCanvasStore.setState({ expandedProjectSlugs: ['project-alpha'] })
    useCanvasStore.getState().toggleProjectExpanded('project-alpha')
    const slugs = useCanvasStore.getState().expandedProjectSlugs
    assert.ok(!slugs.includes('project-alpha'), 'slug should be removed')
  })

  test('only removes the toggled slug, keeps others', () => {
    useCanvasStore.setState({ expandedProjectSlugs: ['project-alpha', 'project-beta'] })
    useCanvasStore.getState().toggleProjectExpanded('project-alpha')
    const slugs = useCanvasStore.getState().expandedProjectSlugs
    assert.ok(!slugs.includes('project-alpha'), 'project-alpha should be removed')
    assert.ok(slugs.includes('project-beta'), 'project-beta should remain')
  })

  test('can add multiple slugs independently', () => {
    useCanvasStore.getState().toggleProjectExpanded('project-alpha')
    useCanvasStore.getState().toggleProjectExpanded('project-beta')
    const slugs = useCanvasStore.getState().expandedProjectSlugs
    assert.ok(slugs.includes('project-alpha'))
    assert.ok(slugs.includes('project-beta'))
  })
})

describe('setExpandedProjectSlugs', () => {
  beforeEach(() => resetStore())

  test('replaces full list', () => {
    useCanvasStore.setState({ expandedProjectSlugs: ['old-project'] })
    useCanvasStore.getState().setExpandedProjectSlugs(['new-a', 'new-b'])
    const slugs = useCanvasStore.getState().expandedProjectSlugs
    assert.deepEqual(slugs, ['new-a', 'new-b'])
  })

  test('can set to empty array', () => {
    useCanvasStore.setState({ expandedProjectSlugs: ['project-alpha'] })
    useCanvasStore.getState().setExpandedProjectSlugs([])
    const slugs = useCanvasStore.getState().expandedProjectSlugs
    assert.deepEqual(slugs, [])
  })

  test('replaces entire list, not merge', () => {
    useCanvasStore.setState({ expandedProjectSlugs: ['old-1', 'old-2'] })
    useCanvasStore.getState().setExpandedProjectSlugs(['new-1'])
    const slugs = useCanvasStore.getState().expandedProjectSlugs
    assert.equal(slugs.length, 1)
    assert.equal(slugs[0], 'new-1')
  })
})

describe('selectProject (non-toggle)', () => {
  beforeEach(() => resetStore())

  test('sets selectedProjectSlug directly', () => {
    useCanvasStore.getState().selectProject('project-alpha')
    assert.equal(useCanvasStore.getState().selectedProjectSlug, 'project-alpha')
  })

  test('calling selectProject with same slug keeps it selected (no toggle)', () => {
    useCanvasStore.getState().selectProject('project-alpha')
    useCanvasStore.getState().selectProject('project-alpha')
    assert.equal(
      useCanvasStore.getState().selectedProjectSlug,
      'project-alpha',
      'Should still be selected, not toggled to null'
    )
  })

  test('can switch to different project', () => {
    useCanvasStore.getState().selectProject('project-alpha')
    useCanvasStore.getState().selectProject('project-beta')
    assert.equal(useCanvasStore.getState().selectedProjectSlug, 'project-beta')
  })

  test('can select null to deselect', () => {
    useCanvasStore.getState().selectProject('project-alpha')
    useCanvasStore.getState().selectProject(null)
    assert.equal(useCanvasStore.getState().selectedProjectSlug, null)
  })
})
