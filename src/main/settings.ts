import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { CanvasSettings } from '../shared/types'

export const SETTINGS_DIR = join(homedir(), '.amplifier-canvas')
export const SETTINGS_PATH = join(SETTINGS_DIR, 'settings.json')

export function getDefaultSettings(): CanvasSettings {
  return {
    analysisModel: 'claude-sonnet-4-5',
    analysisProvider: null,
  }
}

export function getSettings(): CanvasSettings {
  try {
    const raw = readFileSync(SETTINGS_PATH, 'utf-8')
    const parsed = JSON.parse(raw)
    const defaults = getDefaultSettings()
    return {
      analysisModel:
        typeof parsed.analysisModel === 'string' ? parsed.analysisModel : defaults.analysisModel,
      analysisProvider:
        'analysisProvider' in parsed
          ? parsed.analysisProvider === null || typeof parsed.analysisProvider === 'string'
            ? parsed.analysisProvider
            : defaults.analysisProvider
          : defaults.analysisProvider,
    }
  } catch {
    return getDefaultSettings()
  }
}

export function saveSettings(settings: CanvasSettings): { success: boolean } {
  try {
    if (!existsSync(SETTINGS_DIR)) {
      mkdirSync(SETTINGS_DIR, { recursive: true })
    }
    writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2))
    return { success: true }
  } catch {
    return { success: false }
  }
}
