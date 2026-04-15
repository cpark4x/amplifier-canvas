/**
 * Mock electronAPI for browser dev mode.
 *
 * Injects a fake `window.electronAPI` so the renderer can run in a
 * plain browser (npm run dev:browser) with realistic fixture data.
 * No Electron required — just Vite + React.
 */

import type { SessionState, FileEntry, WorkspaceState, CanvasSettings, FileActivity, ProjectOverview } from '../../shared/types'
import type { SessionAnalysisData, AnalysisResult } from '../../shared/analysisTypes'

// ---------------------------------------------------------------------------
// Fixture data — realistic enough to render every UI state
// ---------------------------------------------------------------------------

const MOCK_PROJECTS: Array<{ slug: string; name: string; path: string }> = [
  { slug: 'amplifier-canvas', name: 'Amplifier Canvas', path: '/Users/dev/Projects/amplifier-canvas' },
  { slug: 'team-pulse', name: 'Team Pulse', path: '/Users/dev/Projects/team-pulse' },
  { slug: 'ridecast', name: 'Ridecast', path: '/Users/dev/Projects/ridecast' },
]

const MOCK_SESSIONS: SessionState[] = [
  {
    id: 'session-001',
    projectSlug: 'amplifier-canvas',
    projectName: 'Amplifier Canvas',
    status: 'running',
    startedAt: new Date(Date.now() - 1000 * 60 * 23).toISOString(),
    startedBy: 'canvas',
    byteOffset: 4200,
    recentFiles: [
      { path: 'src/renderer/src/App.tsx', operation: 'edit', timestamp: new Date().toISOString() },
      { path: 'src/renderer/src/store.ts', operation: 'edit', timestamp: new Date().toISOString() },
    ],
    title: 'Implement browser dev mode',
    promptCount: 12,
    toolCallCount: 47,
    filesChangedCount: 6,
    worktree: 'main',
    branch: 'main',
  },
  {
    id: 'session-002',
    projectSlug: 'amplifier-canvas',
    projectName: 'Amplifier Canvas',
    status: 'done',
    startedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    endedAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    startedBy: 'external',
    byteOffset: 18000,
    recentFiles: [],
    title: 'Fix sidebar layout',
    promptCount: 5,
    toolCallCount: 18,
    filesChangedCount: 3,
    worktree: 'main',
    branch: 'main',
    commitHash: 'a3f2b1c',
  },
  {
    id: 'session-005',
    projectSlug: 'amplifier-canvas',
    projectName: 'Amplifier Canvas',
    status: 'running',
    startedAt: new Date(Date.now() - 1000 * 60 * 64).toISOString(),
    startedBy: 'canvas',
    byteOffset: 9200,
    recentFiles: [
      { path: 'src/styles/dark-tokens.ts', operation: 'create', timestamp: new Date().toISOString() },
      { path: 'src/styles/theme.ts', operation: 'edit', timestamp: new Date().toISOString() },
    ],
    title: 'Dark mode',
    promptCount: 6,
    toolCallCount: 22,
    filesChangedCount: 4,
    worktree: 'worktree/dark-mode',
    branch: 'feat/dark-mode',
  },
  {
    id: 'session-003',
    projectSlug: 'team-pulse',
    projectName: 'Team Pulse',
    status: 'needs_input',
    startedAt: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    startedBy: 'canvas',
    byteOffset: 2100,
    recentFiles: [],
    title: 'Add dashboard charts',
    promptCount: 3,
    toolCallCount: 9,
    filesChangedCount: 2,
  },
  {
    id: 'session-004',
    projectSlug: 'ridecast',
    projectName: 'Ridecast',
    status: 'failed',
    startedAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    endedAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    startedBy: 'external',
    byteOffset: 900,
    recentFiles: [],
    title: 'Database migration',
    exitCode: 1,
    promptCount: 2,
    toolCallCount: 5,
    filesChangedCount: 0,
  },
]

const MOCK_ANALYSIS: AnalysisResult = {
  sections: [
    { type: 'summary', title: 'Summary', content: { text: 'Implemented browser dev mode with mock electronAPI. The renderer can now run in a plain browser for fast visual iteration.' } },
    { type: 'changes', title: 'Changes', content: { files: [{ path: 'src/renderer/src/mock-api.ts', changeType: 'created', linesAdded: 170 }, { path: 'vite.config.browser.ts', changeType: 'created', linesAdded: 25 }] } },
    { type: 'next-steps', title: 'Next Steps', content: { items: ['Wire up hot-reload for mock data changes', 'Add more fixture sessions for edge case testing'] } },
  ],
}

const MOCK_FILES: FileEntry[] = [
  { name: 'src', path: '/Users/dev/Projects/amplifier-canvas/src', isDirectory: true, size: 0, modifiedAt: new Date().toISOString() },
  { name: 'package.json', path: '/Users/dev/Projects/amplifier-canvas/package.json', isDirectory: false, size: 2400, modifiedAt: new Date().toISOString() },
  { name: 'README.md', path: '/Users/dev/Projects/amplifier-canvas/README.md', isDirectory: false, size: 1200, modifiedAt: new Date().toISOString() },
  { name: 'tsconfig.json', path: '/Users/dev/Projects/amplifier-canvas/tsconfig.json', isDirectory: false, size: 500, modifiedAt: new Date().toISOString() },
  { name: 'VISION.md', path: '/Users/dev/Projects/amplifier-canvas/VISION.md', isDirectory: false, size: 3800, modifiedAt: new Date().toISOString() },
  { name: 'ARCHITECTURE.md', path: '/Users/dev/Projects/amplifier-canvas/ARCHITECTURE.md', isDirectory: false, size: 6200, modifiedAt: new Date().toISOString() },
]

// ---------------------------------------------------------------------------
// Noop cleanup function returned by all event subscriptions
// ---------------------------------------------------------------------------
const noop = (): void => {}

// ---------------------------------------------------------------------------
// The mock API — matches the shape of preload/index.ts `api` exactly
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Project-level aggregation helpers
// ---------------------------------------------------------------------------

const ACTIVE_STATUSES = new Set(['running', 'active', 'needs_input'])

function getProjectOverview(slug: string): ProjectOverview | null {
  const project = MOCK_PROJECTS.find((p) => p.slug === slug)
  if (!project) return null

  const sessions = MOCK_SESSIONS.filter((s) => s.projectSlug === slug)
  const activeSessions = sessions.filter((s) => ACTIVE_STATUSES.has(s.status))

  let lastActivityAt = ''
  for (const s of sessions) {
    const ts = s.endedAt ?? s.startedAt
    if (ts && ts > lastActivityAt) lastActivityAt = ts
  }

  const assessments: Record<string, string> = {
    'amplifier-canvas': 'Project is healthy with active development across 3 sessions. Browser dev mode feature recently completed. Dark mode work in progress on a separate worktree.',
    'team-pulse': 'Single active session awaiting user input. Dashboard charts feature is in progress with 2 files changed so far.',
    'ridecast': 'Last session failed during database migration. No active sessions. Needs attention before further development.',
  }

  const outcomeMap: Record<string, string[]> = {
    'amplifier-canvas': [
      'Browser dev mode implemented and working',
      'Sidebar layout issues fixed and committed (a3f2b1c)',
      'Dark mode feature branch in progress',
    ],
    'team-pulse': [
      'Dashboard charts feature started',
    ],
    'ridecast': [
      'Database migration attempted but failed',
    ],
  }

  return {
    slug: project.slug,
    name: project.name,
    path: project.path,
    sessionCount: sessions.length,
    totalPrompts: sessions.reduce((sum, s) => sum + (s.promptCount ?? 0), 0),
    totalToolCalls: sessions.reduce((sum, s) => sum + (s.toolCallCount ?? 0), 0),
    totalFilesChanged: sessions.reduce((sum, s) => sum + (s.filesChangedCount ?? 0), 0),
    activeSessionCount: activeSessions.length,
    lastActivityAt: lastActivityAt || new Date().toISOString(),
    assessment: assessments[slug],
    outcomes: outcomeMap[slug],
  }
}

const mockAPI = {
  // PTY lifecycle (no-ops in browser)
  spawnPty: async (): Promise<{ success: boolean }> => ({ success: true }),
  killPty: async (): Promise<{ success: boolean }> => ({ success: true }),
  getPtyBuffer: async (): Promise<string> => '\x1b[33m[browser dev mode]\x1b[0m Terminal is not available in browser mode.\r\n',

  // Terminal I/O (no-ops)
  sendTerminalInput: (): void => {},
  sendTerminalResize: (): void => {},

  // Push events — fire callbacks with fixture data, then return cleanup fn
  onTerminalData: (): (() => void) => noop,
  onTerminalExit: (): (() => void) => noop,

  onSessionsChanged: (cb: (sessions: SessionState[]) => void): (() => void) => {
    // Simulate sessions arriving after 100ms (like real IPC push)
    setTimeout(() => cb(MOCK_SESSIONS), 100)
    return noop
  },

  onProjectsChanged: (cb: (projects: Array<{ slug: string; name: string; path: string }>) => void): (() => void) => {
    setTimeout(() => cb(MOCK_PROJECTS), 80)
    return noop
  },

  onFilesChanged: (): (() => void) => noop,
  onRunningSessionsToast: (): (() => void) => noop,
  onWorkspaceState: (): (() => void) => noop,
  onAnalysisReady: (): (() => void) => noop,

  // Invoke/handle — return fixture data
  getWorkspaceState: async (): Promise<{ state: WorkspaceState; isFirstTime: boolean }> => ({
    state: {
      selectedProjectSlug: 'amplifier-canvas',
      expandedProjectSlugs: ['amplifier-canvas'],
      selectedSessionId: 'session-001',
      sidebarCollapsed: false,
    },
    isFirstTime: false,
  }),

  saveWorkspaceState: async (): Promise<{ success: boolean }> => ({ success: true }),

  discoverProjects: async (): Promise<Array<{ slug: string; name: string; path: string }>> => MOCK_PROJECTS,

  registerProject: async (_slug: string, _path: string, _name: string): Promise<{ success: boolean; sessions?: SessionState[] }> => ({
    success: true,
    sessions: [],
  }),

  unregisterProject: async (): Promise<{ success: boolean }> => ({ success: true }),
  hideSession: async (): Promise<{ success: boolean }> => ({ success: true }),
  stopSession: async (): Promise<{ success: boolean }> => ({ success: true }),
  resumeSession: async (): Promise<{ success: boolean }> => ({ success: true }),

  listDir: async (): Promise<FileEntry[]> => MOCK_FILES,
  readTextFile: async (path: string): Promise<string> =>
    `// Mock file content for: ${path}\n// This is browser dev mode — file system access is simulated.\n`,

  getAnalysis: async (_sessionId: string): Promise<SessionAnalysisData> => ({
    sessionId: _sessionId,
    mechanical: {
      testStatus: { passed: 42, failed: 0 },
      promptHistory: [{ text: 'Implement browser dev mode', timestamp: new Date().toISOString() }],
      filesChanged: [{ path: 'src/mock-api.ts', changeType: 'created' }],
      gitOperations: [{ type: 'commit', timestamp: new Date().toISOString(), message: 'feat: add browser dev mode', sha: 'abc1234' }],
    },
    analysisStatus: 'ready',
    analysisResult: MOCK_ANALYSIS,
    analysisGeneratedAt: new Date().toISOString(),
  }),

  triggerAnalysis: async (_sessionId: string): Promise<SessionAnalysisData | null> => null,

  getSettings: async (): Promise<CanvasSettings> => ({
    analysisModel: 'claude-sonnet-4-5',
    analysisProvider: null,
  }),

  saveSettings: async (): Promise<{ success: boolean }> => ({ success: true }),

  getProjectOverview: async (slug: string): Promise<ProjectOverview | null> => getProjectOverview(slug),
}

// ---------------------------------------------------------------------------
// Inject onto window — only when running outside Electron
// ---------------------------------------------------------------------------

if (typeof window !== 'undefined' && !window.electronAPI) {
  ;(window as Record<string, unknown>).electronAPI = mockAPI
  console.log('%c[browser dev mode]%c Mock electronAPI injected', 'color: #b38600; font-weight: bold', 'color: inherit')
}