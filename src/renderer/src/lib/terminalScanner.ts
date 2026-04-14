const ANSI_ESCAPE = /\x1b\[[0-9;]*[a-zA-Z]/g

// Amplifier CLI prints tool calls as two lines:
//   🔧 Using tool: read_file
//      file_path: VISION.md
// We need stateful matching: detect the tool line, then capture the path on the next line.

const TOOL_LINE_PATTERN = /Using tool:\s*(read_file|write_file|edit_file|create_file|apply_patch)/
const FILE_PATH_LINE_PATTERN = /file_path:\s*(.+)/
const PATH_PARAM_PATTERN = /(?:file_path|path):\s*(.+)/

// Full URL: http://localhost:3000
const LOCALHOST_URL_PATTERN = /https?:\/\/localhost:(\d{2,5})/

// Bare port — only on lines that smell like a dev server
const LOCALHOST_BARE_PATTERN = /localhost:(\d{2,5})/

const SKIP_EXTENSIONS =
  /\.(png|jpe?g|gif|svg|ico|webp|woff2?|ttf|eot|otf|lock|node_modules)/i

interface ScannerCallbacks {
  onFileOpen: (filePath: string) => void
  onAppPreview: (url: string) => void
}

export function createTerminalScanner(
  callbacks: ScannerCallbacks,
): (data: string) => void {
  let lineBuffer = ''
  let detectedAppUrl: string | null = null
  let pendingToolName: string | null = null // State: waiting for file_path line

  return function scan(data: string): void {
    lineBuffer += data
    const lines = lineBuffer.split(/\r?\n/)
    lineBuffer = lines.pop() ?? ''

    for (const raw of lines) {
      const line = raw.replace(ANSI_ESCAPE, '').trim()
      if (!line) continue

      // ── Two-line tool call detection ──────────────────────────
      // Step 1: Detect "🔧 Using tool: read_file"
      const toolMatch = line.match(TOOL_LINE_PATTERN)
      if (toolMatch) {
        pendingToolName = toolMatch[1]
        continue
      }

      // Step 2: If we saw a tool line, the next non-empty line with file_path captures the path
      if (pendingToolName) {
        const pathMatch = line.match(PATH_PARAM_PATTERN)
        if (pathMatch) {
          const filePath = pathMatch[1].trim()
          if (!SKIP_EXTENSIONS.test(filePath)) {
            callbacks.onFileOpen(filePath)
          }
          pendingToolName = null
          continue
        }
        // If we see a non-path line after a tool line, cancel the pending state
        // (unless it's a parameter line we don't care about)
        if (!line.startsWith('//') && !line.match(/^\w+:/)) {
          pendingToolName = null
        }
      }

      // ── Dev server URL (one-shot per session) ─────────────────
      if (!detectedAppUrl) {
        const urlMatch = line.match(LOCALHOST_URL_PATTERN)
        if (urlMatch) {
          detectedAppUrl = urlMatch[0]
          callbacks.onAppPreview(detectedAppUrl)
          continue
        }

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
