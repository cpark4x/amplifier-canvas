import * as pty from 'node-pty'
import type { IPty } from 'node-pty'
import os from 'os'

const ptyProcesses = new Map<string, IPty>()

// Per-session output buffers for replay on terminal switch
// Stores the last MAX_BUFFER_SIZE bytes of output per session
const MAX_BUFFER_SIZE = 100_000  // ~100KB per session
const outputBuffers = new Map<string, string>()

export function spawnPty(
  sessionId: string,
  cols: number,
  rows: number,
  cwd?: string,
): IPty {
  // Kill existing PTY for this session if any
  const existing = ptyProcesses.get(sessionId)
  if (existing) {
    existing.kill()
    ptyProcesses.delete(sessionId)
  }

  const shell =
    process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : '/bin/zsh')

  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: cwd || process.env.HOME || os.homedir(),
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    } as Record<string, string>,
  })

  ptyProcesses.set(sessionId, ptyProcess)

  // Initialize output buffer for this session
  outputBuffers.set(sessionId, '')

  return ptyProcess
}

export function getPty(sessionId: string): IPty | null {
  return ptyProcesses.get(sessionId) || null
}

export function hasPty(sessionId: string): boolean {
  return ptyProcesses.has(sessionId)
}

export function appendToBuffer(sessionId: string, data: string): void {
  const existing = outputBuffers.get(sessionId) ?? ''
  const combined = existing + data
  // Keep only the tail if buffer exceeds max size
  if (combined.length > MAX_BUFFER_SIZE) {
    outputBuffers.set(sessionId, combined.slice(-MAX_BUFFER_SIZE))
  } else {
    outputBuffers.set(sessionId, combined)
  }
}

export function getBuffer(sessionId: string): string {
  return outputBuffers.get(sessionId) ?? ''
}

export function writeToPty(sessionId: string, data: string): void {
  const ptyProcess = ptyProcesses.get(sessionId)
  if (ptyProcess) {
    try {
      ptyProcess.write(data)
    } catch {
      // EIO = shell exited or pipe broke — remove dead process
      ptyProcesses.delete(sessionId)
    }
  }
}

export function resizePty(sessionId: string, cols: number, rows: number): void {
  const ptyProcess = ptyProcesses.get(sessionId)
  if (ptyProcess) {
    ptyProcess.resize(cols, rows)
  }
}

export function killPty(sessionId: string): void {
  const ptyProcess = ptyProcesses.get(sessionId)
  if (ptyProcess) {
    ptyProcess.kill()
    ptyProcesses.delete(sessionId)
  }
  outputBuffers.delete(sessionId)
}

export function killAllPtys(): void {
  for (const [sessionId, ptyProcess] of ptyProcesses) {
    ptyProcess.kill()
    ptyProcesses.delete(sessionId)
  }
  outputBuffers.clear()
}
