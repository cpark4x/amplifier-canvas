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
      <div style={{ color: '#8B8B90', fontSize: '11px', padding: '8px 0' }}>
        Loading...
      </div>
    )
  }

  const lines = content.split('\n')

  return (
    <div data-testid="code-renderer">
      <style>{`
        [data-testid="code-renderer"] .hljs-keyword { color: #CF222E; }
        [data-testid="code-renderer"] .hljs-string { color: #0A3069; }
        [data-testid="code-renderer"] .hljs-number { color: #0550AE; }
        [data-testid="code-renderer"] .hljs-comment { color: #6E7781; font-style: italic; }
        [data-testid="code-renderer"] .hljs-function { color: #8250DF; }
        [data-testid="code-renderer"] .hljs-title { color: #8250DF; }
        [data-testid="code-renderer"] .hljs-type { color: #953800; }
        [data-testid="code-renderer"] .hljs-built_in { color: #0550AE; }
        [data-testid="code-renderer"] .hljs-attr { color: #0550AE; }
        [data-testid="code-renderer"] .hljs-variable { color: #953800; }
        [data-testid="code-renderer"] .hljs-params { color: #953800; }
        [data-testid="code-renderer"] .hljs-meta { color: #CF222E; }
        [data-testid="code-renderer"] .hljs-selector-class { color: #0550AE; }
        [data-testid="code-renderer"] .hljs-selector-tag { color: #116329; }
        [data-testid="code-renderer"] .hljs-property { color: #0550AE; }
      `}</style>
      <div
        style={{
          display: 'flex',
          fontSize: '12px',
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          lineHeight: 1.5,
          overflow: 'auto',
        }}
      >
        {/* Line numbers */}
        <div style={{ color: '#8B8B90', textAlign: 'right', paddingRight: '12px', userSelect: 'none', minWidth: '32px', borderRight: '1px solid #E8E6E1', marginRight: '12px' }}>
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