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

  // Actions
  setSessions: (sessions: SessionState[]) => void
  addSessions: (sessions: SessionState[]) => void
  addOptimisticSession: (projectSlug: string, projectName: string) => void
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

    for (const opt of optimistic) {
      const realMatch = visibleIncoming.find(
        (s) => s.projectSlug === opt.projectSlug && !s.id.startsWith('optimistic-')
          && !current.some((c) => c.id === s.id) // truly new session
      )
      if (realMatch && selectedId === opt.id) {
        // Transfer selection from placeholder to real session
        newSelectedId = realMatch.id
      }
      // If no real match yet, keep the placeholder visible
      if (!realMatch) {
        mergedSessions.push(opt)
      }
    }

    set({ sessions: mergedSessions, selectedSessionId: newSelectedId })
  },

  addSessions: (incoming) => {
    const current = get().sessions
    const existingIds = new Set(current.map((s) => s.id))
    const newSessions = incoming.filter((s) => !existingIds.has(s.id))
    if (newSessions.length > 0) {
      set({ sessions: [...current, ...newSessions] })
    }
  },

  addOptimisticSession: (projectSlug, projectName) => {
    // Add a placeholder session immediately so it appears in the sidebar
    // before the watcher IPC arrives. The placeholder uses a synthetic ID
    // prefixed with 'optimistic-' so setSessions can replace it.
    // Look up the project path so the Viewer can browse files immediately.
    const project = get().registeredProjects.find((p) => p.slug === projectSlug)
    const placeholder: SessionState = {
      id: `optimistic-${projectSlug}-${Date.now()}`,
      projectSlug,
      projectName,
      status: 'active',
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
