/**
 * Tests for task-2: settings module with read/write/defaults for persistent user settings
 * Tests getDefaultSettings(), getSettings(), and saveSettings()
 */

import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

// Import the functions under test
import { getDefaultSettings, getSettings, saveSettings } from '../src/main/settings.ts'

const SETTINGS_DIR = join(homedir(), '.amplifier-canvas')
const SETTINGS_PATH = join(SETTINGS_DIR, 'settings.json')

/** Helper: save raw JSON content to the settings file for testing */
function writeSettingsFile(content: string): void {
  if (!existsSync(SETTINGS_DIR)) mkdirSync(SETTINGS_DIR, { recursive: true })
  writeFileSync(SETTINGS_PATH, content)
}

/** Helper: delete settings file if it exists */
function removeSettingsFile(): void {
  if (existsSync(SETTINGS_PATH)) rmSync(SETTINGS_PATH)
}

// ─── getDefaultSettings ───────────────────────────────────────────────────────

describe('getDefaultSettings', () => {
  test('returns analysisModel as claude-sonnet-4-5', () => {
    const defaults = getDefaultSettings()
    assert.equal(defaults.analysisModel, 'claude-sonnet-4-5')
  })

  test('returns analysisProvider as null', () => {
    const defaults = getDefaultSettings()
    assert.equal(defaults.analysisProvider, null)
  })

  test('returns an object with exactly analysisModel and analysisProvider fields', () => {
    const defaults = getDefaultSettings()
    assert.deepEqual(Object.keys(defaults).sort(), ['analysisModel', 'analysisProvider'].sort())
  })
})

// ─── getSettings – fallback to defaults ───────────────────────────────────────

describe('getSettings – returns defaults when file is missing or corrupt', () => {
  afterEach(() => {
    // Restore a clean valid settings file after each test
    writeSettingsFile(JSON.stringify(getDefaultSettings(), null, 2))
  })

  test('returns default analysisModel when settings file does not exist', () => {
    removeSettingsFile()
    const settings = getSettings()
    assert.equal(settings.analysisModel, 'claude-sonnet-4-5')
  })

  test('returns default analysisProvider (null) when settings file does not exist', () => {
    removeSettingsFile()
    const settings = getSettings()
    assert.equal(settings.analysisProvider, null)
  })

  test('returns defaults when file contains invalid JSON', () => {
    writeSettingsFile('not valid json {{{{')
    const settings = getSettings()
    assert.equal(settings.analysisModel, 'claude-sonnet-4-5')
    assert.equal(settings.analysisProvider, null)
  })

  test('falls back to default analysisModel when field is missing from file', () => {
    writeSettingsFile(JSON.stringify({ analysisProvider: 'anthropic' }, null, 2))
    const settings = getSettings()
    assert.equal(settings.analysisModel, 'claude-sonnet-4-5')
  })

  test('falls back to default analysisProvider (null) when field is missing from file', () => {
    writeSettingsFile(JSON.stringify({ analysisModel: 'claude-opus-4' }, null, 2))
    const settings = getSettings()
    assert.equal(settings.analysisProvider, null)
  })

  test('returns valid CanvasSettings shape with both required fields', () => {
    removeSettingsFile()
    const settings = getSettings()
    assert.ok('analysisModel' in settings, 'should have analysisModel')
    assert.ok('analysisProvider' in settings, 'should have analysisProvider')
  })
})

// ─── saveSettings ─────────────────────────────────────────────────────────────

describe('saveSettings', () => {
  afterEach(() => {
    // Restore defaults after each test
    writeSettingsFile(JSON.stringify(getDefaultSettings(), null, 2))
  })

  test('returns { success: true } when saving valid settings', () => {
    const result = saveSettings({ analysisModel: 'claude-sonnet-4-5', analysisProvider: null })
    assert.deepEqual(result, { success: true })
  })

  test('creates settings directory if it does not exist', () => {
    // Remove the directory entirely to test mkdirSync recursive creation
    if (existsSync(SETTINGS_PATH)) rmSync(SETTINGS_PATH)
    if (existsSync(SETTINGS_DIR)) rmSync(SETTINGS_DIR, { recursive: true })
    const result = saveSettings({ analysisModel: 'claude-sonnet-4-5', analysisProvider: null })
    assert.equal(result.success, true)
    assert.ok(existsSync(SETTINGS_DIR), 'settings directory should be created')
    assert.ok(existsSync(SETTINGS_PATH), 'settings file should be created')
  })

  test('writes JSON with 2-space indentation', () => {
    saveSettings({ analysisModel: 'claude-haiku-3', analysisProvider: null })
    const content = readFileSync(SETTINGS_PATH, 'utf-8')
    assert.ok(content.includes('  "analysisModel"'), 'should use 2-space indent for analysisModel')
    assert.ok(content.includes('  "analysisProvider"'), 'should use 2-space indent for analysisProvider')
  })

  test('writes valid JSON that can be parsed', () => {
    saveSettings({ analysisModel: 'claude-sonnet-4-5', analysisProvider: 'anthropic' })
    const content = readFileSync(SETTINGS_PATH, 'utf-8')
    assert.doesNotThrow(() => JSON.parse(content), 'written content should be valid JSON')
  })

  test('saved analysisModel can be read back by getSettings', () => {
    saveSettings({ analysisModel: 'claude-opus-4', analysisProvider: null })
    const settings = getSettings()
    assert.equal(settings.analysisModel, 'claude-opus-4')
  })

  test('saved analysisProvider can be read back by getSettings', () => {
    saveSettings({ analysisModel: 'claude-sonnet-4-5', analysisProvider: 'vertex' })
    const settings = getSettings()
    assert.equal(settings.analysisProvider, 'vertex')
  })

  test('saved null analysisProvider can be read back by getSettings', () => {
    saveSettings({ analysisModel: 'claude-sonnet-4-5', analysisProvider: null })
    const settings = getSettings()
    assert.equal(settings.analysisProvider, null)
  })
})
