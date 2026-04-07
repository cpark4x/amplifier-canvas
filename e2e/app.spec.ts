import { test, expect } from './fixtures'
import { APP_NAME } from '../src/shared/constants'

test('app launches and shows window', async ({ appWindow }) => {
  const title = await appWindow.title()
  expect(title).toBe(APP_NAME)
})
