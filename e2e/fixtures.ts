import { test as base, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { resolve } from 'path'

const FIXTURES_DIR = resolve(__dirname, 'fixtures', 'amplifier-home')

const ELECTRON_LAUNCH_OPTIONS = {
  args: ['.'],
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: 'test',
    AMPLIFIER_HOME: FIXTURES_DIR,
  }
} as const

type ElectronFixtures = {
  electronApp: ElectronApplication
  appWindow: Page
}

export const test = base.extend<{}, ElectronFixtures>({
  electronApp: [
    async ({}, use) => {
      const electronApp = await electron.launch(ELECTRON_LAUNCH_OPTIONS)

      try {
        await use(electronApp)
      } finally {
        await electronApp.close()
      }
    },
    { scope: 'worker' }
  ],
  appWindow: [
    async ({ electronApp }, use) => {
      const appWindow = await electronApp.firstWindow()
      await appWindow.waitForLoadState('domcontentloaded')
      await use(appWindow)
    },
    { scope: 'worker' }
  ]
})

export { expect } from '@playwright/test'
export { FIXTURES_DIR }
