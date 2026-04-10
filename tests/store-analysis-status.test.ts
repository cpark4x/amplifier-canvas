/**
 * Unit tests for analysis status tracking in the Zustand store.
 * Tests analysisStatusMap, setAnalysisStatus, and getAnalysisStatus.
 *
 * Strategy: use Zustand's static .getState() method to access/mutate the
 * store without needing React context.
 */

import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { useCanvasStore } from '../src/renderer/src/store.ts'

// Reset store state between tests by resetting analysisStatusMap
function resetStore() {
  useCanvasStore.setState({ analysisStatusMap: {} })
}

describe('analysisStatusMap initial state', () => {
  // Test the initial state using getInitialState() — no setState mutations
  test('analysisStatusMap exists in initial state', () => {
    const initial = useCanvasStore.getInitialState()
    assert.ok('analysisStatusMap' in initial, 'analysisStatusMap should exist in initial store state')
  })

  test('analysisStatusMap initializes as empty object', () => {
    const initial = useCanvasStore.getInitialState()
    assert.deepEqual(initial.analysisStatusMap, {})
  })
})

describe('getAnalysisStatus', () => {
  beforeEach(() => resetStore())

  test('returns "none" for unknown session', () => {
    const status = useCanvasStore.getState().getAnalysisStatus('unknown-session')
    assert.equal(status, 'none')
  })

  test('returns set status for known session', () => {
    useCanvasStore.getState().setAnalysisStatus('session-abc', 'loading')
    const status = useCanvasStore.getState().getAnalysisStatus('session-abc')
    assert.equal(status, 'loading')
  })
})

describe('setAnalysisStatus', () => {
  beforeEach(() => resetStore())

  test('sets status for a session', () => {
    useCanvasStore.getState().setAnalysisStatus('session-1', 'loading')
    assert.equal(useCanvasStore.getState().analysisStatusMap['session-1'], 'loading')
  })

  test('updates status for an existing session', () => {
    useCanvasStore.getState().setAnalysisStatus('session-1', 'loading')
    useCanvasStore.getState().setAnalysisStatus('session-1', 'ready')
    assert.equal(useCanvasStore.getState().analysisStatusMap['session-1'], 'ready')
  })

  test('handles multiple sessions independently', () => {
    useCanvasStore.getState().setAnalysisStatus('session-1', 'loading')
    useCanvasStore.getState().setAnalysisStatus('session-2', 'ready')
    useCanvasStore.getState().setAnalysisStatus('session-3', 'failed')

    const map = useCanvasStore.getState().analysisStatusMap
    assert.equal(map['session-1'], 'loading')
    assert.equal(map['session-2'], 'ready')
    assert.equal(map['session-3'], 'failed')
  })

  test('does not affect other store state', () => {
    const before = useCanvasStore.getState()
    useCanvasStore.getState().setAnalysisStatus('session-x', 'loading')
    const after = useCanvasStore.getState()

    // Sessions, toasts, etc. should be unchanged
    assert.deepEqual(before.sessions, after.sessions)
    assert.deepEqual(before.toasts, after.toasts)
  })
})
