import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

function TerminalComponent(): React.ReactElement {
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

    const handleResize = (): void => {
      fitAddon.fit()
    }
    window.addEventListener('resize', handleResize)

    // Wire up IPC if available (connected to PTY in T3)
    if (window.electronAPI) {
      // Sync initial size — fitAddon.fit() set the terminal dimensions,
      // but the PTY was spawned at a hardcoded 80x24. Send the real size now.
      window.electronAPI.sendTerminalResize(xterm.cols, xterm.rows)

      xterm.onData((data) => {
        window.electronAPI.sendTerminalInput(data)
      })

      const cleanupData = window.electronAPI.onTerminalData((data) => {
        xterm.write(data)
      })

      const cleanupExit = window.electronAPI.onTerminalExit(({ exitCode }) => {
        xterm.write(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m\r\n`)
      })

      xterm.onResize(({ cols, rows }) => {
        window.electronAPI.sendTerminalResize(cols, rows)
      })

      return () => {
        cleanupData()
        cleanupExit()
        window.removeEventListener('resize', handleResize)
        xterm.dispose()
        xtermRef.current = null
      }
    }

    return () => {
      window.removeEventListener('resize', handleResize)
      xterm.dispose()
      xtermRef.current = null
    }
  }, [])

  return (
    <div
      ref={terminalRef}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    />
  )
}

export default TerminalComponent