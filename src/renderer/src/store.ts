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
  createdProjects: Project[] // Projects created via modal (before any session exists)
  viewerOpen: boolean

  // Actions
  setSessions: (sessions: SessionState[]) => void
  selectSession: (id: string | null) => void
  selectProject: (slug: string | null) => void
  updateFileActivity: (sessionId: string, files: FileActivity[]) => void
  createProject: (name: string) => void
  openViewer: () => void
  closeViewer: () => void

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
  createdProjects: [],
  viewerOpen: false,

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

  createProject: (name) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    set((state) => ({
      createdProjects: [...state.createdProjects, { slug, name, sessions: [] }],
      selectedProjectSlug: slug,
    }))
  },

  openViewer: () => set({ viewerOpen: true }),
  closeViewer: () => set({ viewerOpen: false }),

  // Derived
  getProjects: () => {
    const { sessions, createdProjects } = get()
    const projectMap = new Map<string, Project>()

    // Include manually created projects (from modal)
    for (const cp of createdProjects) {
      projectMap.set(cp.slug, { slug: cp.slug, name: cp.name, sessions: [] })
    }

    // Merge in session-derived projects
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