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
      <div style={{ color: '#8B8B90', fontSize: '11px', padding: '8px 0' }}>
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
        color: '#2C2825',
      }}
    >
      <style>{`
        [data-testid="markdown-renderer"] h1 { font-size: 20px; font-weight: 600; margin: 16px 0 8px 0; border-bottom: 1px solid #E8E6E1; padding-bottom: 4px; }
        [data-testid="markdown-renderer"] h2 { font-size: 16px; font-weight: 600; margin: 14px 0 6px 0; }
        [data-testid="markdown-renderer"] h3 { font-size: 14px; font-weight: 600; margin: 12px 0 4px 0; }
        [data-testid="markdown-renderer"] p { margin: 8px 0; }
        [data-testid="markdown-renderer"] ul, [data-testid="markdown-renderer"] ol { padding-left: 20px; margin: 8px 0; }
        [data-testid="markdown-renderer"] li { margin: 2px 0; }
        [data-testid="markdown-renderer"] code { background-color: #F2F0EB; padding: 1px 4px; border-radius: 3px; font-size: 12px; font-family: Menlo, Monaco, 'Courier New', monospace; }
        [data-testid="markdown-renderer"] pre { background-color: #F2F0EB; padding: 12px; border-radius: 4px; overflow-x: auto; }
        [data-testid="markdown-renderer"] pre code { background: none; padding: 0; }
      `}</style>
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  )
}

export default MarkdownRenderer