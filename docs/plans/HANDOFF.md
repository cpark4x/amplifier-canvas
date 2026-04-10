# Workspace Model Implementation — Session Handoff

## Status
- **Tasks 1-11 of 15: DONE** (committed to main)
- **Tasks 12-15: NOT STARTED** (need implementation)
- **Build: PASSING** (`npm run build` succeeds)
- **Branch: main**

## What's Done

All core infrastructure and two UI tasks are implemented and committed:

| Task | Description | Commit |
|------|-------------|--------|
| 1 | DB schema migration (registered, hidden, workspace_state) | `39c7fc6` |
| 2 | DB functions (getRegisteredProjects, setProjectRegistered, etc.) | `39c7fc6` |
| 3 | Workspace state persistence (workspace.ts) | `fc77b0e` |
| 4 | On-demand discovery (discovery.ts) | `e0e75a8` |
| 5 | IPC channel constants + stopped status | `1296e93` |
| 6 | IPC handlers for all new channels | `4e2e630` |
| 7 | Preload bridge for new channels | `d2462fb` |
| 8 | Refactor startup — registered-only load | `44c4746` |
| 9 | Watcher removeProjectWatch | `e3e8486` |
| 10 | Store changes — expandedProjectSlugs, remove createdProjects | `67dd030` |
| 11 | AddProjectModal with New/Existing tabs | `98bd502`, `a439ba8` |

## What Remains

### Task 12: ContextMenu + Sidebar Integration
- **Create** `src/renderer/src/components/ContextMenu.tsx` — reusable context menu (fixed position, click-outside/Escape close, hover effects)
- **Modify** `src/renderer/src/components/Sidebar.tsx`:
  - Add context menu state and handlers
  - Project right-click: "Remove from Canvas" -> `window.electronAPI.unregisterProject(slug)`
  - Session right-click: "Remove from view" -> `window.electronAPI.hideSession(id)`; if running: "Stop" (danger) -> `window.electronAPI.stopSession(id)`
  - Add `onContextMenu` to project-item div and session row wrappers
  - Use `expandedProjectSlugs` / `toggleProjectExpanded` for expand/collapse
  - Only render sessions when project is expanded
  - Remove any remaining `createdProjects` references

### Task 13: Wire App.tsx + Delete NewProjectModal
- **Modify** `src/renderer/src/App.tsx`:
  - Replace `NewProjectModal` import with `AddProjectModal`
  - Workspace state restoration on mount via `window.electronAPI.getWorkspaceState()`
  - Save workspace state on changes via `window.electronAPI.saveWorkspaceState()`
  - First-time detection: no registered projects -> welcome screen
  - Close-with-running-sessions toast
- **Delete** `src/renderer/src/components/NewProjectModal.tsx`

### Task 14: Stopped status in Sidebar
- In Sidebar.tsx, handle `'stopped'` status with neutral gray dot (not green/done, not red/failed)
- Add to both SessionRow and HistorySessionRow

### Task 15: Final Integration Verification
- `npm run build` must pass
- `npx playwright test` must pass

## Key Files Reference

| File | Role |
|------|------|
| `src/main/db.ts` | DB schema, migrations, queries |
| `src/main/workspace.ts` | Workspace state get/save |
| `src/main/discovery.ts` | On-demand project discovery |
| `src/main/index.ts` | Startup, watcher, IPC setup |
| `src/main/ipc.ts` | IPC handler registration |
| `src/main/watcher.ts` | Chokidar filesystem watching |
| `src/shared/types.ts` | IPC channel constants, shared types |
| `src/preload/index.ts` | electronAPI bridge |
| `src/renderer/src/store.ts` | Zustand store |
| `src/renderer/src/App.tsx` | App shell |
| `src/renderer/src/components/Sidebar.tsx` | Sidebar with projects/sessions |
| `src/renderer/src/components/AddProjectModal.tsx` | Two-tab add project modal |

## Codebase Patterns
- All inline `style={{}}` — no CSS modules
- CSS vars: `var(--text-primary)`, `var(--bg-modal)`, `var(--border)`, `var(--amber)`, `var(--bg-sidebar-active)`
- Hover: `onMouseEnter/Leave` inline style mutation
- `data-testid` on every interactive element
- `window.electronAPI` for renderer -> main IPC
- Zustand v5 store, no middleware
- `node:test` + `assert/strict` for unit tests
- Playwright for E2E

## Design Document
`docs/plans/2026-04-10-workspace-model-design.md`

## Full Implementation Plan
`docs/plans/2026-04-10-workspace-model-implementation.md`
(Tasks 12-15 have complete code blocks and step-by-step instructions)

## How to Resume

In a new Amplifier session:
```
Read docs/plans/HANDOFF.md, then execute Tasks 12-15 from the implementation plan at docs/plans/2026-04-10-workspace-model-implementation.md
```
