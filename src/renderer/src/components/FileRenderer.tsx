import MarkdownRenderer from './MarkdownRenderer'
import CodeRenderer from './CodeRenderer'
import ImageRenderer from './ImageRenderer'

type FileRendererProps = {
  filePath: string
}

const CODE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'css',
  'json', 'yaml', 'yml', 'toml', 'sh', 'bash',
])

const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp',
])

function getExtension(filePath: string): string {
  return filePath.split('.').pop()?.toLowerCase() || ''
}

function FileRenderer({ filePath }: FileRendererProps): React.ReactElement {
  const ext = getExtension(filePath)

  let renderer: React.ReactElement

  if (ext === 'md' || ext === 'markdown') {
    renderer = <MarkdownRenderer filePath={filePath} />
  } else if (CODE_EXTENSIONS.has(ext)) {
    renderer = <CodeRenderer filePath={filePath} />
  } else if (IMAGE_EXTENSIONS.has(ext)) {
    renderer = <ImageRenderer filePath={filePath} />
  } else {
    // Fallback: treat as plain text
    renderer = <CodeRenderer filePath={filePath} />
  }

  return (
    <div data-testid="file-renderer">
      {renderer}
    </div>
  )
}

export default FileRenderer