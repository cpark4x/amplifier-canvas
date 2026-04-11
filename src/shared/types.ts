// IPC channel names shared between the main process and preload bridge

export const IPC_CHANNELS = {
  // Main → Renderer (push)
  TERMINAL_DATA: 'terminal:data',        // payload: { sessionId: string, data: string }
  TERMINAL_EXIT: 'terminal:exit',        // payload: { sessionId: string, exitCode: number, signal: number }
  SESSIONS_CHANGED: 'state:sessions-changed',
  FILES_CHANGED: 'session:files-changed',
  // Renderer → Main (request — fire-and-forget via .on/.send)
  TERMINAL_INPUT: 'terminal:input',      // payload: { sessionId: string, data: string }
  TERMINAL_RESIZE: 'terminal:resize',    // payload: { sessionId: string, cols: number, rows: number }
  // Renderer → Main (invoke/handle)
  PTY_SPAWN: 'pty:spawn',               // payload: { sessionId: string, cwd?: string, cols: number, rows: number }
  PTY_KILL: 'pty:kill',                  // payload: { sessionId: string }
  PTY_GET_BUFFER: 'pty:get-buffer',      // payload: { sessionId: string } → returns string
  SESSION_RESUME: 'session:resume',
  LIST_DIR: 'files:list-dir',
  READ_TEXT: 'files:read-text',
  GET_ANALYSIS: 'analysis:get',
  TRIGGER_ANALYSIS: 'analysis:trigger',
  // Main → Renderer (push)
  ANALYSIS_READY: 'analysis:ready',
  // Workspace model channels
  PROJECT_DISCOVER: 'project:discover',
  PROJECT_REGISTER: 'project:register',
  PROJECT_UNREGISTER: 'project:unregister',
  SESSION_HIDE: 'session:hide',
  SESSION_STOP: 'session:stop',
  WORKSPACE_SAVE: 'workspace:save-state',
  WORKSPACE_GET: 'workspace:get-state',
  WORKSPACE_STATE: 'workspace:state',
  RUNNING_SESSIONS_TOAST: 'app:running-sessions-toast',
} as const

// --- Session types ---

export type SessionStatus = 'running' | 'needs_input' | 'done' | 'failed' | 'active' | 'loading' | 'stopped'

export interface FileActivity {
  path: string
  operation: 'read' | 'write' | 'edit' | 'create' | 'delete'
  timestamp: string
}

export interface SessionState {
  id: string
  projectSlug: string
  projectName: string
  status: SessionStatus
  startedAt: string
  startedBy: 'canvas' | 'external'
  byteOffset: number
  recentFiles: FileActivity[]
  workDir?: string
  // New optional fields added in task-1
  endedAt?: string
  exitCode?: number
  title?: string
  promptCount?: number
  toolCallCount?: number
  filesChangedCount?: number
}

// --- Toast types ---

export interface Toast {
  id: string
  sessionId: string
  message: string
  action?: {
    label: string
    onClick: () => void
  }
}

// --- Workspace state types ---

export interface WorkspaceState {
  selectedProjectSlug: string | null
  expandedProjectSlugs: string[]
  selectedSessionId: string | null
  sidebarCollapsed: boolean
}

// --- File types ---

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  size: number
  modifiedAt: string
}
