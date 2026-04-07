// Shared types between main and renderer processes
// IPC channel names defined in ARCHITECTURE.md

export const IPC_CHANNELS = {
  // Main → Renderer (push)
  TERMINAL_DATA: 'terminal:data',
  // Renderer → Main (request)
  TERMINAL_INPUT: 'terminal:input',
  TERMINAL_RESIZE: 'terminal:resize',
} as const
