import * as pty from 'node-pty'
import type { IPty } from 'node-pty'
import os from 'os'

const ptyProcesses = new Map<string, IPty>()

const DEFAULT_SESSION_ID = 'default'

export function spawnPty(sessionId: string, cols: number, rows: number): IPty
export function spawnPty(cols: number, rows: number): IPty
export function spawnPty(
  sessionIdOrCols: string | number,
  colsOrRows: number,
  maybeRows?: number
): IPty {
  let sessionId: string
  let cols: number
  let rows: number

  if (typeof sessionIdOrCols === 'string') {
    sessionId = sessionIdOrCols
    cols = colsOrRows
    rows = maybeRows!
  } else {
    sessionId = DEFAULT_SESSION_ID
    cols = sessionIdOrCols
    rows = colsOrRows
  }

  const shell =
    process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : '/bin/zsh')

  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: process.env.HOME || os.homedir(),
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    } as Record<string, string>,
  })

  ptyProcesses.set(sessionId, ptyProcess)
  return ptyProcess
}

export function getPty(sessionId: string = DEFAULT_SESSION_ID): IPty | null {
  return ptyProcesses.get(sessionId) || null
}

export function writeToPty(data: string): void
export function writeToPty(sessionId: string, data: string): void
export function writeToPty(sessionIdOrData: string, maybeData?: string): void {
  let sessionId: string
  let data: string

  if (maybeData !== undefined) {
    sessionId = sessionIdOrData
    data = maybeData
  } else {
    sessionId = DEFAULT_SESSION_ID
    data = sessionIdOrData
  }

  const ptyProcess = ptyProcesses.get(sessionId)
  if (ptyProcess) {
    ptyProcess.write(data)
  }
}

export function resizePty(cols: number, rows: number): void
export function resizePty(sessionId: string, cols: number, rows: number): void
export function resizePty(
  sessionIdOrCols: string | number,
  colsOrRows: number,
  maybeRows?: number
): void {
  let sessionId: string
  let cols: number
  let rows: number

  if (typeof sessionIdOrCols === 'string') {
    sessionId = sessionIdOrCols
    cols = colsOrRows
    rows = maybeRows!
  } else {
    sessionId = DEFAULT_SESSION_ID
    cols = sessionIdOrCols
    rows = colsOrRows
  }

  const ptyProcess = ptyProcesses.get(sessionId)
  if (ptyProcess) {
    ptyProcess.resize(cols, rows)
  }
}

export function killPty(sessionId: string = DEFAULT_SESSION_ID): void {
  const ptyProcess = ptyProcesses.get(sessionId)
  if (ptyProcess) {
    ptyProcess.kill()
    ptyProcesses.delete(sessionId)
  }
}

export function killAllPtys(): void {
  for (const [sessionId, ptyProcess] of ptyProcesses) {
    ptyProcess.kill()
    ptyProcesses.delete(sessionId)
  }
}
