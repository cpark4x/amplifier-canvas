import { test, expect, _electron as electron } from '@playwright/test'
import { resolve } from 'path'
import { existsSync } from 'fs'
import { APP_NAME } from '../src/shared/constants'

test('T4: bin entry point exists', async () => {
  const binPath = resolve(__dirname, '..', 'bin', 'canvas.js')
  expect(existsSync(binPath)).toBe(true)
})

test('T4: app can be launched with electron directly', async () => {
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, NODE_ENV: 'test' },
  })
  const page = await app.firstWindow()
  const title = await page.title()
  expect(title).toBe(APP_NAME)
  await app.close()
})