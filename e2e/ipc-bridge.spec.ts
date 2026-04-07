import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'

test('window.electronAPI is exposed with terminal IPC methods', async () => {
  const app = await electron.launch({
    args: ['.'],
    cwd: process.cwd()
  })

  const window = await app.firstWindow()

  // electronAPI should be exposed on window (not the old 'api')
  const hasElectronAPI = await window.evaluate(() => typeof window.electronAPI !== 'undefined')
  expect(hasElectronAPI).toBe(true)

  // All three terminal IPC methods must exist
  const hasSendInput = await window.evaluate(() => typeof window.electronAPI?.sendTerminalInput === 'function')
  expect(hasSendInput).toBe(true)

  const hasSendResize = await window.evaluate(() => typeof window.electronAPI?.sendTerminalResize === 'function')
  expect(hasSendResize).toBe(true)

  const hasOnData = await window.evaluate(() => typeof window.electronAPI?.onTerminalData === 'function')
  expect(hasOnData).toBe(true)

  await app.close()
})
