import { test, expect } from './fixtures'
import { execSync } from 'child_process'
import { join } from 'path'
import { FIXTURES_DIR } from './fixtures'

function getSessionColumns(): string[] {
  const dbPath = join(FIXTURES_DIR, 'canvas', 'canvas.db')
  // Use sqlite3 CLI (available on macOS/Linux) to read schema.
  // WAL mode allows concurrent readers, so this is safe while the app has the DB open.
  const output = execSync(`sqlite3 "${dbPath}" "pragma table_info(sessions);"`, {
    encoding: 'utf-8',
  })
  // Each line format: cid|name|type|notnull|dflt_value|pk
  return output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('|')[1])
}

// --- D7: DB schema migration ---

test('D7: sessions table has new metadata columns after initDatabase migration', async ({
  electronApp: _electronApp,
}) => {
  // The fixture uses the `electronApp` fixture which starts the app and calls initDatabase().
  // After startup, we query the DB directly to verify migration columns were added.
  const columns = getSessionColumns()

  expect(columns).toContain('title')
  expect(columns).toContain('exitCode')
  expect(columns).toContain('firstPrompt')
  expect(columns).toContain('promptCount')
  expect(columns).toContain('toolCallCount')
  expect(columns).toContain('filesChangedCount')
})

// --- D8: finalizeSession contract ---

test('D8: migration columns are writable (finalizeSession contract)', async ({
  electronApp: _electronApp,
}) => {
  // Verify that the new columns exist and accept values by writing directly via sqlite3 CLI.
  // This tests the DB contract that finalizeSession relies on.
  const dbPath = join(FIXTURES_DIR, 'canvas', 'canvas.db')

  // Get first session ID
  const firstId = execSync(
    `sqlite3 "${dbPath}" "SELECT id FROM sessions LIMIT 1;"`,
    { encoding: 'utf-8' },
  ).trim()

  expect(firstId).toBeTruthy()

  // Write values to the new columns
  execSync(
    `sqlite3 "${dbPath}" "UPDATE sessions SET title='D8 test', exitCode=99, firstPrompt='hello', promptCount=7, toolCallCount=21, filesChangedCount=4 WHERE id='${firstId}';"`,
  )

  // Read back and verify
  const row = execSync(
    `sqlite3 "${dbPath}" "SELECT title,exitCode,firstPrompt,promptCount,toolCallCount,filesChangedCount FROM sessions WHERE id='${firstId}';"`,
    { encoding: 'utf-8' },
  ).trim()

  // Format: title|exitCode|firstPrompt|promptCount|toolCallCount|filesChangedCount
  const [title, exitCode, firstPrompt, promptCount, toolCallCount, filesChangedCount] =
    row.split('|')

  expect(title).toBe('D8 test')
  expect(exitCode).toBe('99')
  expect(firstPrompt).toBe('hello')
  expect(promptCount).toBe('7')
  expect(toolCallCount).toBe('21')
  expect(filesChangedCount).toBe('4')
})
