import { test as base, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { resolve, join } from 'path'
import { readdirSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { execSync } from 'child_process'

const FIXTURES_DIR = resolve(__dirname, 'fixtures', 'amplifier-home')

/**
 * Seed the test canvas.db with registered projects and sessions discovered
 * from the fixture's projects/ directory. This ensures tests that depend on
 * projects being visible in the sidebar work with a clean database.
 *
 * The app's main process only pushes sessions for REGISTERED projects
 * (projects.registered = 1), so the test database must have them pre-populated.
 *
 * Uses the sqlite3 CLI to avoid native module compatibility issues between
 * Node.js and Electron builds of better-sqlite3.
 */
function seedTestDatabase(): void {
  const canvasDir = join(FIXTURES_DIR, 'canvas')
  if (!existsSync(canvasDir)) {
    mkdirSync(canvasDir, { recursive: true })
  }

  const dbPath = join(canvasDir, 'canvas.db')

  const sql = (statement: string): void => {
    execSync(`sqlite3 "${dbPath}" "${statement}"`)
  }

  // Create schema (mirrors src/main/db.ts initDatabase)
  const schema = `
    CREATE TABLE IF NOT EXISTS projects (
      slug TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      name TEXT NOT NULL,
      addedAt TEXT NOT NULL DEFAULT (datetime('now')),
      registered INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      projectSlug TEXT NOT NULL,
      startedBy TEXT NOT NULL DEFAULT 'external',
      startedAt TEXT NOT NULL,
      endedAt TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      byteOffset INTEGER NOT NULL DEFAULT 0,
      title TEXT,
      exitCode INTEGER,
      firstPrompt TEXT,
      promptCount INTEGER DEFAULT 0,
      toolCallCount INTEGER DEFAULT 0,
      filesChangedCount INTEGER DEFAULT 0,
      test_status TEXT,
      prompt_history TEXT,
      files_changed TEXT,
      git_operations TEXT,
      analysis_json TEXT,
      analysis_generated_at TEXT,
      hidden INTEGER DEFAULT 0,
      FOREIGN KEY (projectSlug) REFERENCES projects(slug)
    );

    CREATE TABLE IF NOT EXISTS workspace_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `
  execSync(`sqlite3 "${dbPath}" "${schema.replace(/"/g, '\\"')}"`)

  // Discover and seed projects from the fixture directory
  const projectsDir = join(FIXTURES_DIR, 'projects')
  if (!existsSync(projectsDir)) return

  const slugToName: Record<string, string> = {
    'team-pulse': 'Team Pulse',
    ridecast: 'Ridecast',
  }

  const projectSlugs = readdirSync(projectsDir).filter((entry) => {
    return existsSync(join(projectsDir, entry, 'sessions'))
  })

  const statements: string[] = []

  for (const slug of projectSlugs) {
    const projPath = join(projectsDir, slug)
    const name =
      slugToName[slug] || slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

    statements.push(
      `INSERT OR REPLACE INTO projects (slug, path, name, registered) VALUES ('${slug}', '${projPath}', '${name}', 1)`,
    )

    // Discover sessions within this project
    const sessionsDir = join(projPath, 'sessions')
    if (!existsSync(sessionsDir)) continue

    const sessionDirs = readdirSync(sessionsDir).filter((entry) => {
      return existsSync(join(sessionsDir, entry, 'events.jsonl'))
    })

    for (const sessionId of sessionDirs) {
      // Determine status by checking for session:end event
      const eventsPath = join(sessionsDir, sessionId, 'events.jsonl')
      let status = 'active'
      try {
        const content = readFileSync(eventsPath, 'utf-8')
        if (content.includes('"session:end"') || content.includes('"session:stop"')) {
          status = 'done'
        }
      } catch {
        // Default to active if we can't read
      }

      const now = new Date().toISOString()
      statements.push(
        `INSERT OR REPLACE INTO sessions (id, projectSlug, startedAt, status) VALUES ('${sessionId}', '${slug}', '${now}', '${status}')`,
      )
    }
  }

  // Clear workspace state so tests start fresh
  statements.push('DELETE FROM workspace_state')

  // Execute all statements in a single sqlite3 call
  if (statements.length > 0) {
    const combined = statements.join('; ')
    execSync(`sqlite3 "${dbPath}" "${combined}"`)
  }
}

const ELECTRON_LAUNCH_OPTIONS = {
  args: ['.'],
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: 'test',
    AMPLIFIER_HOME: FIXTURES_DIR,
  },
} as const

type ElectronFixtures = {
  electronApp: ElectronApplication
  appWindow: Page
}

export const test = base.extend<{}, ElectronFixtures>({
  electronApp: [
    async ({}, use) => {
      // Seed the database before launching Electron so the app finds
      // registered projects and sessions on startup.
      seedTestDatabase()

      const electronApp = await electron.launch(ELECTRON_LAUNCH_OPTIONS)

      try {
        await use(electronApp)
      } finally {
        await electronApp.close()
      }
    },
    { scope: 'worker' },
  ],
  appWindow: [
    async ({ electronApp }, use) => {
      const appWindow = await electronApp.firstWindow()
      await appWindow.waitForLoadState('domcontentloaded')
      await use(appWindow)
    },
    { scope: 'worker' },
  ],
})

export { expect } from '@playwright/test'
export { FIXTURES_DIR }
