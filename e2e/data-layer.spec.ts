import { test, expect } from './fixtures'

// --- D1: Database initialization ---

test('D1: app starts without crashing when AMPLIFIER_HOME is set to fixtures', async ({ appWindow }) => {
  // The app launched with AMPLIFIER_HOME pointing to e2e/fixtures/amplifier-home.
  // If db.ts or scanner.ts crashes, the window won't load.
  const title = await appWindow.title()
  expect(title).toBe('Amplifier Canvas')
})

// --- D2: IPC bridge exposes new methods ---

test('D2: electronAPI exposes session and file IPC methods', async ({ appWindow }) => {
  const apiShape = await appWindow.evaluate(() => ({
    hasOnSessionsChanged: typeof window.electronAPI?.onSessionsChanged === 'function',
    hasOnFilesChanged: typeof window.electronAPI?.onFilesChanged === 'function',
    hasListDir: typeof window.electronAPI?.listDir === 'function',
    hasReadTextFile: typeof window.electronAPI?.readTextFile === 'function',
  }))

  expect(apiShape.hasOnSessionsChanged).toBe(true)
  expect(apiShape.hasOnFilesChanged).toBe(true)
  expect(apiShape.hasListDir).toBe(true)
  expect(apiShape.hasReadTextFile).toBe(true)
})