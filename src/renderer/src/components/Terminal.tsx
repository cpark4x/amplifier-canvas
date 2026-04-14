import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

// Padding applied around the terminal
const PAD_V = 12
const PAD_H = 16

interface TerminalProps {
  sessionId: string
}

function TerminalComponent({ sessionId }: TerminalProps): React.ReactElement {
  const outerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return

    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'SFMono-Regular', Menlo, Consolas, monospace",
      lineHeight: 1.65,
      theme: {
        background: '#0F0E0C',
        foreground: '#C8C4BC',
        cursor: '#F59E0B',
        cursorAccent: '#0F0E0C',
        selectionBackground: 'rgba(245, 158, 11, 0.25)',
      },
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    xterm.loadAddon(fitAddon)

    xterm.open(terminalRef.current)
    fitAddon.fit()

    xtermRef.current = xterm
    fitAddonRef.current = fitAddon

    const handleResize = (): void => {
      fitAddon.fit()
    }
    window.addEventListener('resize', handleResize)

    const ro = new ResizeObserver(() => {
      fitAddon.fit()
    })
    if (terminalRef.current) {
      ro.observe(terminalRef.current)
    }

    // Wire up IPC if available
    if (window.electronAPI) {
      // Sync initial size to this session's PTY
      window.electronAPI.sendTerminalResize(sessionId, xterm.cols, xterm.rows)

      // Replay buffered output from this session's PTY
      window.electronAPI.getPtyBuffer(sessionId).then((buffer) => {
        if (buffer && xterm) {
          xterm.write(buffer)
        }
      })

      // Route keystrokes to this session's PTY
      xterm.onData((data) => {
        window.electronAPI.sendTerminalInput(sessionId, data)
      })

      // Receive data — only write data for OUR session
      const cleanupData = window.electronAPI.onTerminalData((payload) => {
        if (payload.sessionId === sessionId) {
          xterm.write(payload.data)
        }
      })

      // Handle PTY exit for this session
      const cleanupExit = window.electronAPI.onTerminalExit((info) => {
        if (info.sessionId === sessionId) {
          xterm.write(`\r\n\x1b[90m[Process exited with code ${info.exitCode}]\x1b[0m\r\n`)
        }
      })

      // Forward resize to this session's PTY
      xterm.onResize(({ cols, rows }) => {
        window.electronAPI.sendTerminalResize(sessionId, cols, rows)
      })

      return () => {
        cleanupData()
        cleanupExit()
        window.removeEventListener('resize', handleResize)
        ro.disconnect()
        xterm.dispose()
        xtermRef.current = null
        fitAddonRef.current = null
      }
    }

    return () => {
      window.removeEventListener('resize', handleResize)
      ro.disconnect()
      xterm.dispose()
      xtermRef.current = null
      fitAddonRef.current = null
    }
  }, [sessionId])

  return (
    <div
      ref={outerRef}
      data-testid="terminal-wrapper"
      style={{
        padding: `${PAD_V}px ${PAD_H}px`,
        width: '100%',
        height: '100%',
        backgroundColor: '#0F0E0C',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <div
        ref={terminalRef}
        style={{
          width: '100%',
          height: '100%',
          overflow: 'hidden',
        }}
      />
    </div>
  )
}

export default TerminalComponent
