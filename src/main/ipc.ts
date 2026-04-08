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

  ptyProcess.onExit(({ exitCode, signal }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.TERMINAL_EXIT, { exitCode, signal })
    }
  })

  const onInput = (_event: Electron.IpcMainEvent, data: string): void => {
    writeToPty(data)
  }

  const onResize = (_event: Electron.IpcMainEvent, { cols, rows }: { cols: number; rows: number }): void => {
    resizePty(cols, rows)
  }

  ipcMain.on(IPC_CHANNELS.TERMINAL_INPUT, onInput)
  ipcMain.on(IPC_CHANNELS.TERMINAL_RESIZE, onResize)

  mainWindow.on('closed', () => {
    ipcMain.removeListener(IPC_CHANNELS.TERMINAL_INPUT, onInput)
    ipcMain.removeListener(IPC_CHANNELS.TERMINAL_RESIZE, onResize)
    killPty()
  })
}