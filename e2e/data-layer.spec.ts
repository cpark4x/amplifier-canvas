import { test, expect } from './fixtures'

// --- D1: Database initialization ---

test('D1: app starts without crashing when AMPLIFIER_HOME is set to fixtures', async ({ appWindow }) => {
  // The app launched with AMPLIFIER_HOME pointing to e2e/fixtures/amplifier-home.
  // If db.ts or scanner.ts crashes, the window won't load.
  const title = await appWindow.title()
  expect(title).toBe('Amplifier Canvas')
})