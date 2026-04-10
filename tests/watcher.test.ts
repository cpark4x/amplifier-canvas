/**
 * Tests for watcher module — specifically for removeProjectWatch (task-9)
 *
 * Strategy: use real filesystem + chokidar integration tests since the module
 * uses module-level state. stopWatching() is called in afterEach to reset
 * module state between tests.
 */

import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  initWatcher,
  addProjectWatch,
  removeProjectWatch,
  stopWatching,
} from '../src/main/watcher.ts'

let testDir: string

function setupTestDir() {
  testDir = join(tmpdir(), `canvas-watcher-test-${Date.now()}`)
  mkdirSync(join(testDir, 'projects'), { recursive: true })
}

function teardownTestDir() {
  rmSync(testDir, { recursive: true, force: true })
}

function createProjectSessions(slug: string) {
  mkdirSync(join(testDir, 'projects', slug, 'sessions'), { recursive: true })
}

describe('removeProjectWatch', () => {
  beforeEach(() => {
    setupTestDir()
  })

  afterEach(async () => {
    stopWatching()
    teardownTestDir()
    // Small delay to allow chokidar to clean up
    await new Promise((resolve) => setTimeout(resolve, 50))
  })

  test('removeProjectWatch is exported as a function', () => {
    assert.strictEqual(
      typeof removeProjectWatch,
      'function',
      'removeProjectWatch must be exported from watcher.ts'
    )
  })

  test('removeProjectWatch does not throw when watcher is not initialized', () => {
    // amplifierProjectsDir and watcher are null — should early return silently
    assert.doesNotThrow(() => {
      removeProjectWatch('some-project')
    })
  })

  test('removeProjectWatch does not throw when watcher is initialized but project was never watched', () => {
    createProjectSessions('project-a')
    initWatcher(testDir, () => {})
    addProjectWatch('project-a') // initializes the watcher

    // project-b was never added but should not throw
    assert.doesNotThrow(() => {
      removeProjectWatch('project-b')
    })
  })

  test('removeProjectWatch unwatch is called without error when project was previously watched', () => {
    createProjectSessions('my-project')
    initWatcher(testDir, () => {})
    addProjectWatch('my-project') // initializes the real chokidar watcher

    // Should complete without throwing — verifies watcher.unwatch() path
    assert.doesNotThrow(() => {
      removeProjectWatch('my-project')
    })
  })
})
