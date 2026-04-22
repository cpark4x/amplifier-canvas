import { create } from 'zustand'
import type { SessionState, FileActivity, Toast } from '../../shared/types'
import type { AnalysisStatus } from '../../shared/analysisTypes'

interface Project {
  slug: string
  name: string
  sessions: SessionState[]
}

const ACTIVE_STATUSES = new Set(['running', 'active', 'needs_input'])
const COMPLETED_STATUSES = new Set(['done', 'failed', 'stopped'])

let toastCounter = 0

interface RegisteredProject {
  slug: string
  name: string
  path: string
}

interface CreatingSessionInfo {
  ptyId: string
  projectSlug: string
  optimisticId: string
}

interface CanvasStore {
  // State
  sessions: SessionState[]
  registeredProjects: RegisteredProject[]
  selectedSessionId: string | null
  selectedProjectSlug: string | null
  expandedProjectSlugs: string[]
  viewerOpen: boolean
  toasts: Toast[]
  viewMode: 'session' | 'project'
  analysisStatusMap: Record<string, AnalysisStatus>
  // Terminal state (moved from App.tsx local state to enable store-driven sync)
  terminalSessionId: string | null
  showTerminal: boolean
  creatingSession: CreatingSessionInfo | null


  // Actions
  setSessions: (sessions: SessionState[]) => void
  addSessions: (sessions: SessionState[]) => void
  addOptimisticSession: (projectSlug: string, projectName: string, ptyId?: string) => void
  registerProject: (slug: string, name: string, path?: string) => void
  unregisterProject: (slug: string) => void
  setViewMode: (mode: 'session' | 'project') => void
  selectSession: (id: string | null) => void
  selectProject: (slug: string | null) => void
  toggleProjectExpanded: (slug: string) => void
  setExpandedProjectSlugs: (slugs: string[]) => void
  updateFileActivity: (sessionId: string, files: FileActivity[]) => void
  openViewer: () => void
  closeViewer: () => void
  addToast: (toast: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void
  setAnalysisStatus: (sessionId: string, status: AnalysisStatus) => void
  getAnalysisStatus: (sessionId: string) => AnalysisStatus
  enterTerminalView: (sessionId: string) => void
  setShowTerminal: (show: boolean) => void
  setTerminalSessionId: (id: string | null) => void
  cancelCreatingSession: () => void
  promoteCreatingSession: (realSessionId: string) => void

  // Derived
  getProjects: () => Project[]
  getSelectedSession: () => SessionState | null
  getProjectSessions: (slug: string) => SessionState[]
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  // State
  sessions: [],
  registeredProjects: [],
  selectedSessionId: null,
  selectedProjectSlug: null,
  expandedProjectSlugs: [],
  viewMode: 'session' as const,
  viewerOpen: false,
  toasts: [],
  analysisStatusMap: {},
  terminalSessionId: null,
  showTerminal: false,
  creatingSession: null,

  // Actions
  setSessions: (incoming) => {
    const current = get().sessions
    const selectedId = get().selectedSessionId

    for (const newSession of incoming) {
      if (newSession.id === selectedId) continue
      const oldSession = current.find((s) => s.id === newSession.id)
      if (!oldSession) continue
      const wasActive = ACTIVE_STATUSES.has(oldSession.status)
      const isCompleted = COMPLETED_STATUSES.has(newSession.status)
      if (wasActive && isCompleted) {
        // Build subtitle with stats (duration, prompts, etc.)
        const parts: string[] = []
        if (newSession.startedAt && newSession.endedAt) {
          const ms = new Date(newSession.endedAt).getTime() - new Date(newSession.startedAt).getTime()
          const mins = Math.floor(ms / 60_000)
          if (mins < 60) parts.push(`${mins}m`)
          else { const h = Math.floor(mins / 60); const r = mins % 60; parts.push(r > 0 ? `${h}h ${r}m` : `${h}h`) }
        }
        if (newSession.promptCount) parts.push(`${newSession.promptCount} prompts`)

        get().addToast({
          sessionId: newSession.id,
          message: `\u2713 ${newSession.title || newSession.id} just finished`,
          subtitle: parts.length > 0 ? parts.join(' \u00B7 ') : undefined,
          projectName: newSession.projectName,
          action: {
            label: 'Review',
            onClick: () => {
              get().selectSession(newSession.id)
              get().openViewer()
            },
          },
        })
      }
    }

    // Defence-in-depth: filter out hidden sessions even if the main process leaks them.
    const visibleIncoming = incoming.filter((s) => s.hidden !== true)

    // Replace optimistic placeholder sessions with real ones.
    // Optimistic sessions have IDs like 'optimistic-{slug}-{ts}'.
    // When real sessions arrive for the same project, remove the placeholder.
    const optimistic = current.filter((s) => s.id.startsWith('optimistic-'))
    let mergedSessions = [...visibleIncoming]
    let newSelectedId = selectedId
    let newCreatingSession = get().creatingSession
    let newTerminalSessionId: string | undefined

    for (const opt of optimistic) {
      const realMatch = visibleIncoming.find(
        (s) => s.projectSlug === opt.projectSlug && !s.id.startsWith('optimistic-')
          && !current.some((c) => c.id === s.id) // truly new session
      )
      if (realMatch && selectedId === opt.id) {
        // Transfer selection from placeholder to real session
        newSelectedId = realMatch.id
      }
      if (realMatch) {
        // Session promoted from creating → real.
        // Re-key the PTY from the synthetic ID to the real session ID so
        // there's one ID everywhere. No bridge map needed.
        if (newCreatingSession?.optimisticId === opt.id) {
          const oldPtyId = newCreatingSession.ptyId
          window.electronAPI?.renamePty(oldPtyId, realMatch.id)
          // If the terminal is currently showing the synthetic PTY, switch it
          // to the real ID. The terminal remounts (React key change) but
          // replays the buffer so the user sees nothing.
          if (get().terminalSessionId === oldPtyId) {
            newTerminalSessionId = realMatch.id
          }
          newCreatingSession = null
        }
      }
      // If no real match yet, keep the placeholder visible
      if (!realMatch) {
        mergedSessions.push(opt)
      }
    }

    set({
      sessions: mergedSessions,
      selectedSessionId: newSelectedId,
      creatingSession: newCreatingSession,
      ...(newTerminalSessionId ? { terminalSessionId: newTerminalSessionId } : {}),
    })
  },

  addSessions: (incoming) => {
    const current = get().sessions
    const existingIds = new Set(current.map((s) => s.id))
    const newSessions = incoming.filter((s) => !existingIds.has(s.id))
    if (newSessions.length > 0) {
      set({ sessions: [...current, ...newSessions] })
    }
  },

  addOptimisticSession: (projectSlug, projectName, ptyId?) => {
    // Add a placeholder session immediately so it appears in the sidebar
    // before the watcher IPC arrives. The placeholder uses a synthetic ID
    // prefixed with 'optimistic-' so setSessions can replace it.
    // Look up the project path so the Viewer can browse files immediately.
    const project = get().registeredProjects.find((p) => p.slug === projectSlug)
    const placeholder: SessionState = {
      id: `optimistic-${projectSlug}-${Date.now()}`,
      projectSlug,
      projectName,
      status: 'creating',
      startedAt: new Date().toISOString(),
      startedBy: 'canvas',
      byteOffset: 0,
      recentFiles: [],
      title: 'New session',
      workDir: project?.path,
    }
    set((state) => ({
      sessions: [...state.sessions, placeholder],
      selectedSessionId: placeholder.id,
      ...(ptyId ? { creatingSession: { ptyId, projectSlug, optimisticId: placeholder.id } } : {}),
    }))
  },

  registerProject: (slug, name, path?) => {
    const current = get().registeredProjects
    if (!current.some((p) => p.slug === slug)) {
      set({ registeredProjects: [...current, { slug, name, path: path ?? '' }] })
    }
  },

  unregisterProject: (slug) => {
    set({ registeredProjects: get().registeredProjects.filter((p) => p.slug !== slug) })
  },

  setViewMode: (mode) => set({ viewMode: mode }),

  selectSession: (id) => set({ selectedSessionId: id, viewMode: 'session' as const }),

  selectProject: (slug) => set({ selectedProjectSlug: slug }),

  toggleProjectExpanded: (slug) =>
    set((state) => ({
      expandedProjectSlugs: state.expandedProjectSlugs.includes(slug)
        ? state.expandedProjectSlugs.filter((s) => s !== slug)
        : [...state.expandedProjectSlugs, slug],
    })),

  setExpandedProjectSlugs: (slugs) => set({ expandedProjectSlugs: slugs }),

  updateFileActivity: (sessionId, files) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, recentFiles: files } : s
      ),
    })),

  openViewer: () => set({ viewerOpen: true }),
  closeViewer: () => set({ viewerOpen: false }),

  addToast: (toast) => {
    const id = `toast-${++toastCounter}`
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }))
  },

  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  setAnalysisStatus: (sessionId, status) =>
    set((state) => ({
      analysisStatusMap: { ...state.analysisStatusMap, [sessionId]: status },
    })),

  getAnalysisStatus: (sessionId) => get().analysisStatusMap[sessionId] ?? 'none',

  enterTerminalView: (sessionId) => set({
    viewMode: 'session' as const,
    terminalSessionId: sessionId,
    showTerminal: true,
  }),

  setShowTerminal: (show) => set({ showTerminal: show }),
  setTerminalSessionId: (id) => set({ terminalSessionId: id }),

  cancelCreatingSession: () => {
    const creating = get().creatingSession
    if (!creating) return
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== creating.optimisticId),
      selectedSessionId: state.selectedSessionId === creating.optimisticId ? null : state.selectedSessionId,
      creatingSession: null,
      terminalSessionId: state.terminalSessionId === creating.ptyId ? null : state.terminalSessionId,
      showTerminal: state.terminalSessionId === creating.ptyId ? false : state.showTerminal,
    }))
  },

  promoteCreatingSession: (realSessionId) => {
    const creating = get().creatingSession
    if (!creating) return
    // The main process already renamed the PTY from terminal-proj-123 → realSessionId.
    // Now update the store: replace the optimistic placeholder with a real session stub,
    // transfer selection, and update terminalSessionId. One ID everywhere.
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === creating.optimisticId
          ? { ...s, id: realSessionId, status: 'active' as const, title: 'New session' }
          : s
      ),
      selectedSessionId: state.selectedSessionId === creating.optimisticId ? realSessionId : state.selectedSessionId,
      terminalSessionId: state.terminalSessionId === creating.ptyId ? realSessionId : state.terminalSessionId,
      creatingSession: null,
    }))
  },

  // Derived
  getProjects: () => {
    const { sessions, registeredProjects } = get()
    const projectMap = new Map<string, Project>()

    // Start with registered projects (ensures empty projects still appear)
    for (const rp of registeredProjects) {
      projectMap.set(rp.slug, { slug: rp.slug, name: rp.name, sessions: [] })
    }

    // Merge in sessions
    for (const session of sessions) {
      const existing = projectMap.get(session.projectSlug)
      if (existing) {
        existing.sessions.push(session)
      } else {
        projectMap.set(session.projectSlug, {
          slug: session.projectSlug,
          name: session.projectName,
          sessions: [session],
        })
      }
    }

    return Array.from(projectMap.values()).sort((a, b) => a.name.localeCompare(b.name))
  },

  getSelectedSession: () => {
    const { sessions, selectedSessionId } = get()
    if (!selectedSessionId) return null
    return sessions.find((s) => s.id === selectedSessionId) || null
  },

  getProjectSessions: (slug) => {
    const { sessions } = get()
    return sessions.filter((s) => s.projectSlug === slug && s.hidden !== true)
  },
}))
