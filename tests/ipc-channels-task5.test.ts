/**
 * Tests for task-5: New IPC Channel Constants
 * Verifies that all new IPC channels are present in IPC_CHANNELS
 * and that SessionStatus includes 'stopped'.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { IPC_CHANNELS } from '../src/shared/types.ts'
import type { SessionStatus } from '../src/shared/types.ts'

describe('IPC_CHANNELS — new workspace model channels', () => {
  test('PROJECT_DISCOVER is defined', () => {
    assert.equal(IPC_CHANNELS.PROJECT_DISCOVER, 'project:discover')
  })

  test('PROJECT_REGISTER is defined', () => {
    assert.equal(IPC_CHANNELS.PROJECT_REGISTER, 'project:register')
  })

  test('PROJECT_UNREGISTER is defined', () => {
    assert.equal(IPC_CHANNELS.PROJECT_UNREGISTER, 'project:unregister')
  })

  test('SESSION_HIDE is defined', () => {
    assert.equal(IPC_CHANNELS.SESSION_HIDE, 'session:hide')
  })

  test('SESSION_STOP is defined', () => {
    assert.equal(IPC_CHANNELS.SESSION_STOP, 'session:stop')
  })

  test('WORKSPACE_SAVE is defined', () => {
    assert.equal(IPC_CHANNELS.WORKSPACE_SAVE, 'workspace:save-state')
  })

  test('WORKSPACE_GET is defined', () => {
    assert.equal(IPC_CHANNELS.WORKSPACE_GET, 'workspace:get-state')
  })

  test('WORKSPACE_STATE is defined', () => {
    assert.equal(IPC_CHANNELS.WORKSPACE_STATE, 'workspace:state')
  })

  test('RUNNING_SESSIONS_TOAST is defined', () => {
    assert.equal(IPC_CHANNELS.RUNNING_SESSIONS_TOAST, 'app:running-sessions-toast')
  })
})

describe('SessionStatus — includes stopped', () => {
  test('"stopped" is a valid SessionStatus value', () => {
    // Type-level check: assign 'stopped' to a SessionStatus variable
    const status: SessionStatus = 'stopped'
    assert.equal(status, 'stopped')
  })
})
