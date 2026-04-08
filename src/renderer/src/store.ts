import { create } from 'zustand'
import type { SessionState, FileActivity } from '../../shared/types'

interface Project {
  slug: string
  name: string
  sessions: SessionState[]
}

interface CanvasStore {
  // State
  sessions: SessionState[]
  selectedSessionId: string | null
  selectedProjectSlug: string | null

  // Actions
  setSessions: (sessions: SessionState[]) => void
  selectSession: (id: string | null) => void
  selectProject: (slug: string | null) => void
  updateFileActivity: (sessionId: string, files: FileActivity[]) => void

  // Derived
  getProjects: () => Project[]
  getSelectedSession: () => SessionState | null
  getProjectSessions: (slug: string) => SessionState[]
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  // State
  sessions: [],
  selectedSessionId: null,
  selectedProjectSlug: null,

  // Actions
  setSessions: (sessions) => set({ sessions }),

  selectSession: (id) => set({ selectedSessionId: id }),

  selectProject: (slug) =>
    set((state) => ({
      selectedProjectSlug: state.selectedProjectSlug === slug ? null : slug,
    })),

  updateFileActivity: (sessionId, files) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, recentFiles: files } : s
      ),
    })),

  // Derived
  getProjects: () => {
    const { sessions } = get()
    const projectMap = new Map<string, Project>()

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