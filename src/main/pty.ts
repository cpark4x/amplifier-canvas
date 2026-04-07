import * as pty from 'node-pty'
import type { IPty } from 'node-pty'
import os from 'os'

let ptyProcess: IPty | null = null

export function spawnPty(cols: number, rows: number): IPty {
  const shell =
    process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : '/bin/zsh')

  ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: process.env.HOME || os.homedir(),
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor'
    } as Record<string, string>
  })

  return ptyProcess
}

export function getPty(): IPty | null {
  return ptyProcess
}

export function writeToPty(data: string): void {
  if (ptyProcess) {
    ptyProcess.write(data)
  }
}

export function resizePty(cols: number, rows: number): void {
  if (ptyProcess) {
    ptyProcess.resize(cols, rows)
  }
}

export function killPty(): void {
  if (ptyProcess) {
    ptyProcess.kill()
    ptyProcess = null
  }
}