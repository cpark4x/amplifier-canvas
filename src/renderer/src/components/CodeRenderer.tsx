import { useState, useEffect, useRef } from 'react'
import hljs from 'highlight.js/lib/core'
import typescript from 'highlight.js/lib/languages/typescript'
import javascript from 'highlight.js/lib/languages/javascript'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import go from 'highlight.js/lib/languages/go'
import css from 'highlight.js/lib/languages/css'
import json from 'highlight.js/lib/languages/json'
import yaml from 'highlight.js/lib/languages/yaml'
import ini from 'highlight.js/lib/languages/ini'
import bash from 'highlight.js/lib/languages/bash'

// Register only the languages we need
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('go', go)
hljs.registerLanguage('css', css)
hljs.registerLanguage('json', json)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('ini', ini)
hljs.registerLanguage('bash', bash)

type CodeRendererProps = {
  filePath: string
}

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  py: 'python',
  rs: 'rust',
  go: 'go',
  css: 'css',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'ini',
  sh: 'bash',
  bash: 'bash',
}

function getLanguage(filePath: string): string | undefined {
  const ext = filePath.split('.').pop()?.toLowerCase()
  return ext ? EXTENSION_TO_LANGUAGE[ext] : undefined
}

function CodeRenderer({ filePath }: CodeRendererProps): React.ReactElement {
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const codeRef = useRef<HTMLElement>(null)

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

  useEffect(() => {
    if (!loading && codeRef.current && content) {
      const language = getLanguage(filePath)
      if (language && hljs.getLanguage(language)) {
        const result = hljs.highlight(content, { language })
        codeRef.current.innerHTML = result.value
      } else {
        const result = hljs.highlightAuto(content)
        codeRef.current.innerHTML = result.value
      }
    }
  }, [content, loading, filePath])

  if (loading) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: '11px', padding: '8px 0' }}>
        Loading...
      </div>
    )
  }

  const lines = content.split('\n')

  return (
    <div data-testid="code-renderer">
      <style>{`
        [data-testid="code-renderer"] .hljs-keyword { color: #C4784A; }
        [data-testid="code-renderer"] .hljs-string { color: #4CAF74; }
        [data-testid="code-renderer"] .hljs-number { color: #A09888; }
        [data-testid="code-renderer"] .hljs-comment { color: #5A6855; font-style: italic; }
        [data-testid="code-renderer"] .hljs-function { color: #F59E0B; }
        [data-testid="code-renderer"] .hljs-title { color: #F59E0B; }
        [data-testid="code-renderer"] .hljs-type { color: #8A9E8A; }
        [data-testid="code-renderer"] .hljs-built_in { color: #5A8A9A; }
        [data-testid="code-renderer"] .hljs-attr { color: #C8C4BC; }
        [data-testid="code-renderer"] .hljs-variable { color: #C8C4BC; }
        [data-testid="code-renderer"] .hljs-params { color: #A09888; }
        [data-testid="code-renderer"] .hljs-meta { color: #C4784A; }
        [data-testid="code-renderer"] .hljs-selector-class { color: #5A8A9A; }
        [data-testid="code-renderer"] .hljs-selector-tag { color: #4CAF74; }
        [data-testid="code-renderer"] .hljs-property { color: #5A8A9A; }
      `}</style>
      <div
        style={{
          display: 'flex',
          fontSize: '11px',
          fontFamily: "'SFMono-Regular', Menlo, Consolas, monospace",
          lineHeight: 1.65,
          overflow: 'auto',
          backgroundColor: '#0F0E0C',
          color: '#C8C4BC',
          borderRadius: '4px',
          padding: '12px 0',
        }}
      >
        {/* Line numbers */}
        <div style={{ color: '#C8C4BC', opacity: 0.45, textAlign: 'right', paddingRight: '12px', paddingLeft: '12px', userSelect: 'none', minWidth: '36px', borderRight: '1px solid rgba(255,255,255,0.06)', marginRight: '12px' }}>
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        {/* Code content */}
        <pre style={{ margin: 0, padding: 0, overflow: 'visible', whiteSpace: 'pre', flex: 1 }}>
          <code ref={codeRef} style={{ fontFamily: 'inherit' }}>{content}</code>
        </pre>
      </div>
    </div>
  )
}

export default CodeRenderer