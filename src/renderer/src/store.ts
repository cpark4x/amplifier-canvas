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
  analysisStatusMap: Record<string, AnalysisStatus>

  // Actions
  setSessions: (sessions: SessionState[]) => void
  addSessions: (sessions: SessionState[]) => void
  registerProject: (slug: string, name: string) => void
  unregisterProject: (slug: string) => void
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
        get().addToast({
          sessionId: newSession.id,
          message: `${newSession.title || newSession.id} completed`,
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
    set({ sessions: incoming })
  },

  addSessions: (incoming) => {
    const current = get().sessions
    const existingIds = new Set(current.map((s) => s.id))
    const newSessions = incoming.filter((s) => !existingIds.has(s.id))
    if (newSessions.length > 0) {
      set({ sessions: [...current, ...newSessions] })
    }
  },

  registerProject: (slug, name) => {
    const current = get().registeredProjects
    if (!current.some((p) => p.slug === slug)) {
      set({ registeredProjects: [...current, { slug, name }] })
    }
  },

  unregisterProject: (slug) => {
    set({ registeredProjects: get().registeredProjects.filter((p) => p.slug !== slug) })
  },

  selectSession: (id) => set({ selectedSessionId: id }),

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
    return sessions.filter((s) => s.projectSlug === slug)
  },
}))
