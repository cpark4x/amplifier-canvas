import { test, expect } from './fixtures'

test('window.electronAPI is exposed with terminal IPC methods', async ({ appWindow }) => {
  const apiShape = await appWindow.evaluate(() => ({
    hasElectronAPI: typeof window.electronAPI !== 'undefined',
    hasSendInput: typeof window.electronAPI?.sendTerminalInput === 'function',
    hasSendResize: typeof window.electronAPI?.sendTerminalResize === 'function',
    hasOnData: typeof window.electronAPI?.onTerminalData === 'function'
  }))

  expect(apiShape.hasElectronAPI).toBe(true)
  expect(apiShape.hasSendInput).toBe(true)
  expect(apiShape.hasSendResize).toBe(true)
  expect(apiShape.hasOnData).toBe(true)
})
