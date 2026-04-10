import { getDatabase } from './db'

export interface WorkspaceState {
  selectedProjectSlug: string | null
  expandedProjectSlugs: string[]
  selectedSessionId: string | null
  sidebarCollapsed: boolean
}

type WorkspaceRow = { key: string; value: string }

export function getWorkspaceState(): WorkspaceState {
  const db = getDatabase()
  const rows = db.prepare('SELECT key, value FROM workspace_state').all() as WorkspaceRow[]
  const map = new Map(rows.map((r) => [r.key, r.value]))

  const expandedRaw = map.get('expandedProjectSlugs')
  let expandedProjectSlugs: string[] = []
  if (expandedRaw) {
    try {
      expandedProjectSlugs = JSON.parse(expandedRaw) as string[]
    } catch {
      // Corrupted value — silently fall back to empty list
      expandedProjectSlugs = []
    }
  }

  const sidebarRaw = map.get('sidebarCollapsed')
  const sidebarCollapsed: boolean = sidebarRaw === 'true'

  return {
    selectedProjectSlug: map.get('selectedProjectSlug') ?? null,
    expandedProjectSlugs,
    selectedSessionId: map.get('selectedSessionId') ?? null,
    sidebarCollapsed,
  }
}

export function saveWorkspaceState(state: WorkspaceState): void {
  const db = getDatabase()
  const upsert = db.prepare(
    'INSERT INTO workspace_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  )
  const deleteKey = db.prepare('DELETE FROM workspace_state WHERE key = ?')

  const transaction = db.transaction(() => {
    if (state.selectedProjectSlug != null) {
      upsert.run('selectedProjectSlug', state.selectedProjectSlug)
    } else {
      deleteKey.run('selectedProjectSlug')
    }

    if (state.expandedProjectSlugs.length > 0) {
      upsert.run('expandedProjectSlugs', JSON.stringify(state.expandedProjectSlugs))
    } else {
      deleteKey.run('expandedProjectSlugs')
    }

    if (state.selectedSessionId != null) {
      upsert.run('selectedSessionId', state.selectedSessionId)
    } else {
      deleteKey.run('selectedSessionId')
    }

    if (state.sidebarCollapsed) {
      upsert.run('sidebarCollapsed', 'true')
    } else {
      deleteKey.run('sidebarCollapsed')
    }
  })

  transaction()
}
