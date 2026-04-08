import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'

type MarkdownRendererProps = {
  filePath: string
}

function MarkdownRenderer({ filePath }: MarkdownRendererProps): React.ReactElement {
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    void window.electronAPI.readTextFile(filePath).then((text) => {
      if (!cancelled) {
        setContent(text)
        setLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [filePath])

  if (loading) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: '11px', padding: '8px 0' }}>
        Loading...
      </div>
    )
  }

  return (
    <div
      data-testid="markdown-renderer"
      style={{
        fontSize: '13px',
        lineHeight: 1.6,
        color: 'var(--text-primary)',
      }}
    >
      <style>{`
        [data-testid="markdown-renderer"] h1 { font-size: 18px; font-weight: 700; margin: 16px 0 8px 0; border-bottom: 1px solid var(--border); padding-bottom: 4px; }
        [data-testid="markdown-renderer"] h2 { font-size: 15px; font-weight: 600; margin: 14px 0 6px 0; }
        [data-testid="markdown-renderer"] h3 { font-size: 13px; font-weight: 600; margin: 12px 0 4px 0; }
        [data-testid="markdown-renderer"] p { margin: 8px 0; }
        [data-testid="markdown-renderer"] ul, [data-testid="markdown-renderer"] ol { padding-left: 20px; margin: 8px 0; list-style-type: disc; }
        [data-testid="markdown-renderer"] ol { list-style-type: decimal; }
        [data-testid="markdown-renderer"] li { margin: 2px 0; }
        [data-testid="markdown-renderer"] code { background-color: var(--bg-page); padding: 1px 4px; border-radius: 3px; font-size: 12px; font-family: 'SFMono-Regular', Menlo, Consolas, monospace; }
        [data-testid="markdown-renderer"] pre { background-color: #0F0E0C; color: #C8C4BC; padding: 12px; border-radius: 4px; overflow-x: auto; }
        [data-testid="markdown-renderer"] pre code { background: none; padding: 0; color: inherit; font-family: 'SFMono-Regular', Menlo, Consolas, monospace; }
        [data-testid="markdown-renderer"] a { color: var(--amber); }
        [data-testid="markdown-renderer"] blockquote { border-left: 2px solid var(--border); padding-left: 12px; color: var(--text-muted); margin: 8px 0; }
      `}</style>
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  )
}

export default MarkdownRenderer