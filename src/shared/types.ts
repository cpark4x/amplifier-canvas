// IPC channel names shared between the main process and preload bridge

export const IPC_CHANNELS = {
  // Main → Renderer (push)
  TERMINAL_DATA: 'terminal:data',
  TERMINAL_EXIT: 'terminal:exit',
  // Renderer → Main (request)
  TERMINAL_INPUT: 'terminal:input',
  TERMINAL_RESIZE: 'terminal:resize',
} as const
