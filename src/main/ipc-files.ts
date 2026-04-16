import { ipcMain } from 'electron'
import { readdir, stat, readFile } from 'fs/promises'
import { join, resolve, normalize } from 'path'
import { IPC_CHANNELS } from '../shared/types'
import type { FileEntry } from '../shared/types'

// Track allowed directories for file access security
let allowedDirs: string[] = []

export function setAllowedDirs(dirs: string[]): void {
  allowedDirs = dirs.map((d) => resolve(normalize(d)))
}

export function addAllowedDir(dir: string): void {
  const resolved = resolve(normalize(dir))
  if (!allowedDirs.includes(resolved)) {
    allowedDirs.push(resolved)
  }
}

export function isPathAllowed(requestedPath: string): boolean {
  const resolved = resolve(normalize(requestedPath))
  return allowedDirs.some((dir) => resolved.startsWith(dir))
}

export function registerFileHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.LIST_DIR, async (_event, { path: dirPath }: { path: string }): Promise<FileEntry[]> => {
    if (!isPathAllowed(dirPath)) {
      console.error('[ipc] Blocked file access to disallowed path:', dirPath)
      return []
    }

    try {
      const entries = await readdir(dirPath, { withFileTypes: true })
      const results: FileEntry[] = []
      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name)
        let size = 0
        let modifiedAt = new Date().toISOString()

        try {
          const s = await stat(fullPath)
          size = s.size
          modifiedAt = s.mtime.toISOString()
        } catch {
          // stat failed — return defaults
        }

        results.push({
          name: entry.name,
          path: fullPath,
          isDirectory: entry.isDirectory(),
          size,
          modifiedAt,
        })
      }
      return results
    } catch {
      console.error('[ipc] Failed to list directory:', dirPath)
      return []
    }
  })

  ipcMain.handle(IPC_CHANNELS.READ_TEXT, async (_event, { path: filePath }: { path: string }): Promise<string> => {
    if (!isPathAllowed(filePath)) {
      console.error('[ipc] Blocked file access to disallowed path:', filePath)
      return ''
    }

    try {
      return await readFile(filePath, 'utf-8')
    } catch {
      console.error('[ipc] Failed to read file:', filePath)
      return ''
    }
  })
}