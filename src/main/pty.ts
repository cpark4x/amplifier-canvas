import * as pty from 'node-pty'
import type { IPty } from 'node-pty'
import os from 'os'

const ptyProcesses = new Map<string, IPty>()

// Track which project slug each Canvas-spawned PTY belongs to.
// Key = PTY ID (e.g. "terminal-slug-1776147353"), Value = project slug.
// Used by the watcher to determine if a new Amplifier session was Canvas-initiated.
const ptyProjectMap = new Map<string, string>()

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

/**
 * Record that a Canvas-spawned PTY belongs to a project.
 * Called when App.tsx creates a new terminal session.
 */
export function setPtyProject(ptyId: string, projectSlug: string): void {
  ptyProjectMap.set(ptyId, projectSlug)
}

/**
 * Look up the project slug for a PTY ID.
 * Returns null if the PTY wasn't Canvas-spawned or the ID is unknown.
 */
export function getPtyProject(ptyId: string): string | null {
  return ptyProjectMap.get(ptyId) ?? null
}

/**
 * Check if Canvas has an active PTY for a given project slug.
 * Used by the watcher to determine if a new Amplifier session was Canvas-initiated.
 */
export function hasCanvasPtyForProject(projectSlug: string): boolean {
  for (const [ptyId, slug] of ptyProjectMap) {
    if (slug === projectSlug && ptyProcesses.has(ptyId)) return true
  }
  return false
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

/**
 * Re-key a PTY from one ID to another. The process stays the same —
 * only the map entries move. Used when an optimistic session (terminal-proj-123)
 * gets promoted to a real Amplifier session ID (abc123) so there's one ID everywhere.
 */
export function renamePty(oldId: string, newId: string): boolean {
  const proc = ptyProcesses.get(oldId)
  if (!proc) return false
  ptyProcesses.delete(oldId)
  ptyProcesses.set(newId, proc)
  // Move output buffer
  const buf = outputBuffers.get(oldId) ?? ''
  outputBuffers.delete(oldId)
  outputBuffers.set(newId, buf)
  // Move project mapping
  const slug = ptyProjectMap.get(oldId)
  if (slug) {
    ptyProjectMap.delete(oldId)
    ptyProjectMap.set(newId, slug)
  }
  return true
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
