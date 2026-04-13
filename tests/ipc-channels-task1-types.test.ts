/**
 * Tests for task-1: CanvasSettings interface and SETTINGS IPC channels
 * Verifies that SETTINGS_GET and SETTINGS_SAVE are present in IPC_CHANNELS
 * and that CanvasSettings interface has the correct fields.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { IPC_CHANNELS } from '../src/shared/types.ts'
import type { CanvasSettings } from '../src/shared/types.ts'

describe('IPC_CHANNELS — settings channels', () => {
  test('SETTINGS_GET is defined with correct value', () => {
    assert.equal(IPC_CHANNELS.SETTINGS_GET, 'settings:get')
  })

  test('SETTINGS_SAVE is defined with correct value', () => {
    assert.equal(IPC_CHANNELS.SETTINGS_SAVE, 'settings:save')
  })
})

describe('CanvasSettings interface', () => {
  test('accepts valid CanvasSettings with analysisModel and analysisProvider as string', () => {
    const settings: CanvasSettings = {
      analysisModel: 'claude-sonnet-4-5',
      analysisProvider: 'anthropic',
    }
    assert.equal(settings.analysisModel, 'claude-sonnet-4-5')
    assert.equal(settings.analysisProvider, 'anthropic')
  })

  test('accepts valid CanvasSettings with analysisProvider as null', () => {
    const settings: CanvasSettings = {
      analysisModel: 'claude-sonnet-4-5',
      analysisProvider: null,
    }
    assert.equal(settings.analysisModel, 'claude-sonnet-4-5')
    assert.equal(settings.analysisProvider, null)
  })
})
