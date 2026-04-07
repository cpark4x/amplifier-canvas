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
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1a1a1a',
        foreground: '#e0e0e0',
        cursor: '#e0e0e0',
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

    // Wire up IPC if available (connected to PTY in T3)
    if (window.electronAPI) {
      xterm.onData((data) => {
        window.electronAPI.sendTerminalInput(data)
      })

      const cleanup = window.electronAPI.onTerminalData((data) => {
        xterm.write(data)
      })

      xterm.onResize(({ cols, rows }) => {
        window.electronAPI.sendTerminalResize(cols, rows)
      })

      return () => {
        cleanup()
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