import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'

test('app launches and shows window', async () => {
  const app = await electron.launch({
    args: ['.'],
    cwd: process.cwd()
  })

  const window = await app.firstWindow()
  const title = await window.title()
  expect(title).toBe('Amplifier Canvas')

  await app.close()
})
