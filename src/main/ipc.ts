import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../shared/types'
import { spawnPty, writeToPty, resizePty, killPty } from './pty'

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  const ptyProcess = spawnPty(80, 24)

  ptyProcess.onData((data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.TERMINAL_DATA, data)
    }
  })

  ipcMain.on(IPC_CHANNELS.TERMINAL_INPUT, (_event, data: string) => {
    writeToPty(data)
  })

  ipcMain.on(IPC_CHANNELS.TERMINAL_RESIZE, (_event, { cols, rows }: { cols: number; rows: number }) => {
    resizePty(cols, rows)
  })

  mainWindow.on('closed', () => {
    killPty()
  })
}