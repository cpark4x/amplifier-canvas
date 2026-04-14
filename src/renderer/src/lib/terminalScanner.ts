/**
 * Scans terminal output for patterns that trigger viewer actions.
 * Called with each chunk of PTY data as it arrives.
 *
 * Handles:
 * - ANSI escape code stripping
 * - Partial-line buffering (PTY data arrives in chunks, not full lines)
 * - File tool call detection (read_file, write_file, edit_file, create_file)
 * - Explicit viewer signal detection ("Opening X in viewer")
 * - Dev server URL detection (localhost:PORT)
 */

// ANSI escape sequences (e.g. \x1b[31m, \x1b[0m)
const ANSI_ESCAPE = /\x1b\[[0-9;]*[a-zA-Z]/g

// Amplifier CLI tool call pattern: optional "▸ " prefix + tool name + path
// Matches: "▸ read_file src/foo.ts" or "read_file src/foo.ts"
const FILE_TOOL_PATTERN =
  /(?:▸\s*)?(?:read_file|write_file|edit_file|create_file)\s+(.+)/

// Explicit viewer signal from Amplifier: "Opening VISION.md in viewer"
const VIEWER_SIGNAL_PATTERN = /Opening\s+(.+?)\s+in\s+(?:viewer|panel)/i

// Full URL: http://localhost:3000 or https://localhost:3000
const LOCALHOST_URL_PATTERN = /https?:\/\/localhost:(\d{2,5})/

// Bare port: localhost:3000 — only trigger on lines that look like dev server output
const LOCALHOST_BARE_PATTERN = /localhost:(\d{2,5})/

// Binary/large files that shouldn't auto-open
const SKIP_EXTENSIONS =
  /\.(png|jpe?g|gif|svg|ico|webp|woff2?|ttf|eot|otf|lock|node_modules)/i

interface ScannerCallbacks {
  onFileOpen: (filePath: string) => void
  onAppPreview: (url: string) => void
}

/**
 * Creates a terminal scanner for a single session.
 * Each session gets its own scanner instance with isolated line buffer
 * and app URL state.
 *
 * @returns A scan function — call it with each PTY data chunk
 */
export function createTerminalScanner(
  callbacks: ScannerCallbacks,
): (data: string) => void {
  // Accumulates incomplete lines between PTY chunks
  let lineBuffer = ''

  // Once a dev server URL is detected, don't fire again for the same session
  let detectedAppUrl: string | null = null

  return function scan(data: string): void {
    lineBuffer += data
    const lines = lineBuffer.split(/\r?\n/)

    // The last element is either empty (data ended with \n) or an incomplete line
    lineBuffer = lines.pop() ?? ''

    for (const raw of lines) {
      const line = raw.replace(ANSI_ESCAPE, '').trim()
      if (!line) continue

      // ── File tool call ──────────────────────────────────────────────────
      const fileMatch = line.match(FILE_TOOL_PATTERN)
      if (fileMatch) {
        const filePath = fileMatch[1].trim()
        if (!SKIP_EXTENSIONS.test(filePath)) {
          callbacks.onFileOpen(filePath)
        }
        continue
      }

      // ── Explicit viewer signal ──────────────────────────────────────────
      const viewerMatch = line.match(VIEWER_SIGNAL_PATTERN)
      if (viewerMatch) {
        const filePath = viewerMatch[1].trim()
        if (!SKIP_EXTENSIONS.test(filePath)) {
          callbacks.onFileOpen(filePath)
        }
        continue
      }

      // ── Dev server URL ──────────────────────────────────────────────────
      if (!detectedAppUrl) {
        const urlMatch = line.match(LOCALHOST_URL_PATTERN)
        if (urlMatch) {
          detectedAppUrl = urlMatch[0]
          callbacks.onAppPreview(detectedAppUrl)
          continue
        }

        // Bare localhost:PORT — only trigger on lines that smell like a dev server
        if (/local|ready|running|dev|server|vite|next|webpack/i.test(line)) {
          const bareMatch = line.match(LOCALHOST_BARE_PATTERN)
          if (bareMatch) {
            detectedAppUrl = `http://localhost:${bareMatch[1]}`
            callbacks.onAppPreview(detectedAppUrl)
          }
        }
      }
    }
  }
}
