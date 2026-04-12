/**
 * Tests for task-3: settings module unit tests
 * Covers getDefaultSettings(), getSettings(), and saveSettings()
 * Uses temp HOME isolation via require.cache invalidation
 */

import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'

const _require = createRequire(import.meta.url)

let tmpDir: string
let originalHome: string | undefined

/**
 * Clear require.cache for the settings module and re-import it so that
 * the module-level SETTINGS_DIR / SETTINGS_PATH constants are recomputed
 * using the current value of process.env.HOME (set to tmpDir in beforeEach).
 */
function loadSettings(): {
  getDefaultSettings: () => { analysisModel: string; analysisProvider: string | null }
  getSettings: () => { analysisModel: string; analysisProvider: string | null }
  saveSettings: (s: {
    analysisModel: string
    analysisProvider: string | null
  }) => { success: boolean }
  SETTINGS_DIR: string
  SETTINGS_PATH: string
} {
  const key = _require.resolve('../src/main/settings.ts')
  delete _require.cache[key]
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return _require('../src/main/settings.ts')
}

beforeEach(() => {
  originalHome = process.env.HOME
  tmpDir = mkdtempSync(join(tmpdir(), 'test-settings-'))
  process.env.HOME = tmpDir
})

afterEach(() => {
  if (originalHome !== undefined) {
    process.env.HOME = originalHome
  } else {
    delete process.env.HOME
  }
  rmSync(tmpDir, { recursive: true, force: true })
})

// ─── 1: getDefaultSettings ────────────────────────────────────────────────────

test('getDefaultSettings returns expected defaults', () => {
  const { getDefaultSettings } = loadSettings()
  const defaults = getDefaultSettings()
  assert.equal(defaults.analysisModel, 'claude-sonnet-4-5')
  assert.equal(defaults.analysisProvider, null)
})

// ─── 2: getSettings – missing file ────────────────────────────────────────────

test('getSettings returns defaults when settings file is missing', () => {
  const { getSettings } = loadSettings()
  const settings = getSettings()
  assert.equal(settings.analysisModel, 'claude-sonnet-4-5')
  assert.equal(settings.analysisProvider, null)
})

// ─── 3: getSettings – corrupt JSON ────────────────────────────────────────────

test('getSettings returns defaults when settings file is corrupt JSON', () => {
  const settingsDir = join(tmpDir, '.amplifier-canvas')
  mkdirSync(settingsDir, { recursive: true })
  writeFileSync(join(settingsDir, 'settings.json'), 'not valid json {{{{')

  const { getSettings } = loadSettings()
  const settings = getSettings()
  assert.equal(settings.analysisModel, 'claude-sonnet-4-5')
  assert.equal(settings.analysisProvider, null)
})

// ─── 4: getSettings – valid file ──────────────────────────────────────────────

test('getSettings returns parsed settings from valid file', () => {
  const settingsDir = join(tmpDir, '.amplifier-canvas')
  mkdirSync(settingsDir, { recursive: true })
  writeFileSync(
    join(settingsDir, 'settings.json'),
    JSON.stringify({ analysisModel: 'claude-haiku-4-5', analysisProvider: 'bedrock' }),
  )

  const { getSettings } = loadSettings()
  const settings = getSettings()
  assert.equal(settings.analysisModel, 'claude-haiku-4-5')
  assert.equal(settings.analysisProvider, 'bedrock')
})

// ─── 5: saveSettings – creates directory and writes valid JSON ────────────────

test('saveSettings creates directory if missing and writes valid JSON', () => {
  const { saveSettings } = loadSettings()
  saveSettings({ analysisModel: 'claude-haiku-4-5', analysisProvider: 'bedrock' })

  const settingsPath = join(tmpDir, '.amplifier-canvas', 'settings.json')
  assert.ok(existsSync(settingsPath), 'settings file should exist after save')

  const parsed = JSON.parse(readFileSync(settingsPath, 'utf-8'))
  assert.equal(parsed.analysisModel, 'claude-haiku-4-5')
  assert.equal(parsed.analysisProvider, 'bedrock')
})

// ─── 6: saveSettings – overwrites existing file ───────────────────────────────

test('saveSettings overwrites existing settings file', () => {
  const { saveSettings } = loadSettings()
  saveSettings({ analysisModel: 'claude-haiku-4-5', analysisProvider: 'bedrock' })
  saveSettings({ analysisModel: 'claude-sonnet-4-5', analysisProvider: 'anthropic' })

  const settingsPath = join(tmpDir, '.amplifier-canvas', 'settings.json')
  const parsed = JSON.parse(readFileSync(settingsPath, 'utf-8'))
  assert.equal(parsed.analysisModel, 'claude-sonnet-4-5')
  assert.equal(parsed.analysisProvider, 'anthropic')
})

// ─── 7: saveSettings – returns success ────────────────────────────────────────

test('saveSettings returns { success: boolean } with success=true', () => {
  const { saveSettings } = loadSettings()
  const result = saveSettings({ analysisModel: 'claude-sonnet-4-5', analysisProvider: null })
  assert.ok('success' in result, 'result should have success property')
  assert.equal(result.success, true)
})
