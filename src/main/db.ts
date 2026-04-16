import Database from 'better-sqlite3'
import type BetterSqlite3 from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { join } from 'path'
import os from 'os'

let db: BetterSqlite3.Database | null = null

function getAmplifierHome(): string {
  return process.env['AMPLIFIER_HOME'] || join(os.homedir(), '.amplifier')
}

export function getCanvasDbPath(): string {
  const canvasDir = join(getAmplifierHome(), 'canvas')
  mkdirSync(canvasDir, { recursive: true })
  return join(canvasDir, 'canvas.db')
}

export function initDatabase(dbPath?: string): BetterSqlite3.Database {
  const resolvedPath = dbPath || getCanvasDbPath()
  db = new Database(resolvedPath)
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      slug TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      name TEXT NOT NULL,
      addedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      projectSlug TEXT NOT NULL,
      startedBy TEXT NOT NULL DEFAULT 'external',
      startedAt TEXT NOT NULL,
      endedAt TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      byteOffset INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (projectSlug) REFERENCES projects(slug)
    );

    CREATE TABLE IF NOT EXISTS workspace_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  // Additive column migrations — safe to run on existing databases.
  // Each block checks whether the column exists before attempting ADD COLUMN.

  // Projects table migrations
  const existingProjectColumns = (
    db.pragma('table_info(projects)') as Array<{ name: string }>
  ).map((col) => col.name)

  const projectMigrations: Array<{ column: string; ddl: string }> = [
    {
      column: 'registered',
      ddl: 'ALTER TABLE projects ADD COLUMN registered INTEGER NOT NULL DEFAULT 0',
    },
  ]

  for (const { column, ddl } of projectMigrations) {
    if (!existingProjectColumns.includes(column)) {
      db.exec(ddl)
    }
  }

  // Sessions table migrations
  const existingSessionColumns = (
    db.pragma('table_info(sessions)') as Array<{ name: string }>
  ).map((col) => col.name)

  const sessionMigrations: Array<{ column: string; ddl: string }> = [
    { column: 'title', ddl: 'ALTER TABLE sessions ADD COLUMN title TEXT' },
    { column: 'exitCode', ddl: 'ALTER TABLE sessions ADD COLUMN exitCode INTEGER' },
    { column: 'firstPrompt', ddl: 'ALTER TABLE sessions ADD COLUMN firstPrompt TEXT' },
    {
      column: 'promptCount',
      ddl: 'ALTER TABLE sessions ADD COLUMN promptCount INTEGER DEFAULT 0',
    },
    {
      column: 'toolCallCount',
      ddl: 'ALTER TABLE sessions ADD COLUMN toolCallCount INTEGER DEFAULT 0',
    },
    {
      column: 'filesChangedCount',
      ddl: 'ALTER TABLE sessions ADD COLUMN filesChangedCount INTEGER DEFAULT 0',
    },
    { column: 'test_status', ddl: 'ALTER TABLE sessions ADD COLUMN test_status TEXT' },
    { column: 'prompt_history', ddl: 'ALTER TABLE sessions ADD COLUMN prompt_history TEXT' },
    { column: 'files_changed', ddl: 'ALTER TABLE sessions ADD COLUMN files_changed TEXT' },
    { column: 'git_operations', ddl: 'ALTER TABLE sessions ADD COLUMN git_operations TEXT' },
    { column: 'analysis_json', ddl: 'ALTER TABLE sessions ADD COLUMN analysis_json TEXT' },
    {
      column: 'analysis_generated_at',
      ddl: 'ALTER TABLE sessions ADD COLUMN analysis_generated_at TEXT',
    },
    {
      column: 'analysis_status',
      ddl: "ALTER TABLE sessions ADD COLUMN analysis_status TEXT DEFAULT 'none'",
    },
    {
      column: 'hidden',
      ddl: 'ALTER TABLE sessions ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0',
    },
  ]

  for (const { column, ddl } of sessionMigrations) {
    if (!existingSessionColumns.includes(column)) {
      db.exec(ddl)
    }
  }

  return db
}

export function getDatabase(): BetterSqlite3.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

export function upsertProject(slug: string, path: string, name: string): void {
  const d = getDatabase()
  d.prepare(`
    INSERT INTO projects (slug, path, name) VALUES (?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET path = excluded.path, name = excluded.name
  `).run(slug, path, name)
}

export function upsertSession(session: {
  id: string
  projectSlug: string
  startedBy: string
  startedAt: string
  status: string
  byteOffset: number
  hidden?: boolean
  title?: string | null
}): void {
  const d = getDatabase()
  const hidden = session.hidden ? 1 : 0
  d.prepare(`
    INSERT INTO sessions (id, projectSlug, startedBy, startedAt, status, byteOffset, hidden, title)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      byteOffset = excluded.byteOffset,
      title = COALESCE(excluded.title, sessions.title)
  `).run(session.id, session.projectSlug, session.startedBy, session.startedAt, session.status, session.byteOffset, hidden, session.title ?? null)
}

export function unhideSession(id: string): void {
  const d = getDatabase()
  d.prepare('UPDATE sessions SET hidden = 0 WHERE id = ?').run(id)
}

export function updateSessionStatus(id: string, status: string): void {
  const d = getDatabase()
  d.prepare('UPDATE sessions SET status = ? WHERE id = ?').run(status, id)
}

export function updateSessionTitle(id: string, title: string): void {
  const d = getDatabase()
  d.prepare('UPDATE sessions SET title = ? WHERE id = ?').run(title, id)
}

export function getSessionsWithoutTitles(projectSlug: string): Array<{ id: string; byteOffset: number }> {
  const d = getDatabase()
  return d.prepare(
    'SELECT id, byteOffset FROM sessions WHERE projectSlug = ? AND title IS NULL'
  ).all(projectSlug) as Array<{ id: string; byteOffset: number }>
}

export function updateByteOffset(id: string, offset: number): void {
  const d = getDatabase()
  d.prepare('UPDATE sessions SET byteOffset = ? WHERE id = ?').run(offset, id)
}

export function finalizeSession(
  id: string,
  data: {
    status: string
    endedAt: string | null
    exitCode: number | null
    title: string | null
    firstPrompt: string | null
    promptCount: number
    toolCallCount: number
    filesChangedCount: number
  },
): void {
  const d = getDatabase()
  d.prepare(`
    UPDATE sessions SET
      status = ?,
      endedAt = ?,
      exitCode = ?,
      title = ?,
      firstPrompt = ?,
      promptCount = ?,
      toolCallCount = ?,
      filesChangedCount = ?
    WHERE id = ?
  `).run(
    data.status,
    data.endedAt,
    data.exitCode,
    data.title,
    data.firstPrompt,
    data.promptCount,
    data.toolCallCount,
    data.filesChangedCount,
    id,
  )
}

export interface ProjectRow {
  slug: string
  path: string
  name: string
  addedAt: string
  registered: number
}

export interface SessionRow {
  id: string
  projectSlug: string
  startedBy: string
  startedAt: string
  endedAt: string | null
  status: string
  byteOffset: number
  title: string | null
  exitCode: number | null
  firstPrompt: string | null
  promptCount: number
  toolCallCount: number
  filesChangedCount: number
  test_status: string | null
  prompt_history: string | null
  files_changed: string | null
  git_operations: string | null
  analysis_json: string | null
  analysis_generated_at: string | null
  analysis_status: string | null
  hidden: number
}

export function getAllProjects(): ProjectRow[] {
  const d = getDatabase()
  return d.prepare('SELECT * FROM projects ORDER BY name').all() as ProjectRow[]
}

export function getProjectSessions(slug: string): SessionRow[] {
  const d = getDatabase()
  return d.prepare('SELECT * FROM sessions WHERE projectSlug = ? ORDER BY startedAt DESC').all(slug) as SessionRow[]
}

export function getAllSessions(): SessionRow[] {
  const d = getDatabase()
  return d.prepare('SELECT * FROM sessions ORDER BY startedAt DESC').all() as SessionRow[]
}

export function getSessionById(id: string): SessionRow | null {
  const d = getDatabase()
  return (d.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined) ?? null
}

export function saveMechanicalData(
  id: string,
  data: {
    test_status: string | null
    prompt_history: string | null
    files_changed: string | null
    git_operations: string | null
  },
): void {
  const d = getDatabase()
  d.prepare(`
    UPDATE sessions SET
      test_status = ?,
      prompt_history = ?,
      files_changed = ?,
      git_operations = ?
    WHERE id = ?
  `).run(data.test_status, data.prompt_history, data.files_changed, data.git_operations, id)
}

export function saveAnalysisResult(
  id: string,
  data: {
    analysis_json: string | null
    analysis_generated_at: string | null
    analysis_status: string
  },
): void {
  const d = getDatabase()
  d.prepare(`
    UPDATE sessions SET
      analysis_json = ?,
      analysis_generated_at = ?,
      analysis_status = ?
    WHERE id = ?
  `).run(data.analysis_json, data.analysis_generated_at, data.analysis_status, id)
}

export function updateAnalysisStatus(id: string, status: string): void {
  const d = getDatabase()
  d.prepare('UPDATE sessions SET analysis_status = ? WHERE id = ?').run(status, id)
}

export function getProjectBySlug(slug: string): ProjectRow | undefined {
  const d = getDatabase()
  return d.prepare('SELECT * FROM projects WHERE slug = ?').get(slug) as ProjectRow | undefined
}

export function getRegisteredProjects(): ProjectRow[] {
  const d = getDatabase()
  return d.prepare('SELECT * FROM projects WHERE registered = 1 ORDER BY name').all() as ProjectRow[]
}

export function setProjectRegistered(slug: string, registered: number): void {
  const d = getDatabase()
  d.prepare('UPDATE projects SET registered = ? WHERE slug = ?').run(registered, slug)
}

export function getVisibleProjectSessions(projectSlug: string): SessionRow[] {
  const d = getDatabase()
  return d
    .prepare('SELECT * FROM sessions WHERE projectSlug = ? AND hidden = 0 ORDER BY startedAt DESC')
    .all(projectSlug) as SessionRow[]
}

export function getProjectOverviewStats(projectSlug: string): {
  sessionCount: number
  totalPrompts: number
  totalToolCalls: number
  totalFilesChanged: number
  activeSessionCount: number
  lastActivityAt: string | null
} {
  const d = getDatabase()
  const row = d.prepare(`
    SELECT
      COUNT(*) as sessionCount,
      COALESCE(SUM(promptCount), 0) as totalPrompts,
      COALESCE(SUM(toolCallCount), 0) as totalToolCalls,
      COALESCE(SUM(filesChangedCount), 0) as totalFilesChanged,
      SUM(CASE WHEN status IN ('active', 'running') THEN 1 ELSE 0 END) as activeSessionCount,
      MAX(COALESCE(endedAt, startedAt)) as lastActivityAt
    FROM sessions
    WHERE projectSlug = ? AND hidden = 0
  `).get(projectSlug) as {
    sessionCount: number
    totalPrompts: number
    totalToolCalls: number
    totalFilesChanged: number
    activeSessionCount: number
    lastActivityAt: string | null
  }
  return row
}

export function setSessionHidden(id: string, hidden: number): void {
  const d = getDatabase()
  d.prepare('UPDATE sessions SET hidden = ? WHERE id = ?').run(hidden, id)
}

export function getRegisteredProjectCount(): number {
  const d = getDatabase()
  const row = d.prepare('SELECT COUNT(*) as count FROM projects WHERE registered = 1').get() as { count: number }
  return row.count
}

/**
 * On app startup, mark all 'active'/'running' sessions as 'done'.
 * No PTY survives an app restart, so any session still marked active is stale.
 * Also hide any sessions with status 'failed' so they don't clutter the sidebar.
 */
export function reconcileStaleActiveSessions(): void {
  const d = getDatabase()
  const result = d.prepare(
    "UPDATE sessions SET status = 'done' WHERE status IN ('active', 'running')"
  ).run()
  if (result.changes > 0) {
    console.log(`[db] Reconciled ${result.changes} stale active sessions → done`)
  }

  // Hide failed sessions on restart — they shouldn't persist as visible across app launches.
  const hiddenResult = d.prepare(
    "UPDATE sessions SET hidden = 1 WHERE status = 'failed' AND hidden = 0"
  ).run()
  if (hiddenResult.changes > 0) {
    console.log(`[db] Hid ${hiddenResult.changes} failed sessions`)
  }
}
