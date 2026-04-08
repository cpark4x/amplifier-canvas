import { useState } from 'react'

type ImageRendererProps = {
  filePath: string
}

function ImageRenderer({ filePath }: ImageRendererProps): React.ReactElement {
  const [error, setError] = useState(false)
  const fileName = filePath.split('/').pop() || 'image'
  const canvasSrc = `canvas://file${filePath}`

  if (error) {
    return (
      <div
        data-testid="image-renderer"
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '12px',
        }}
      >
        <div style={{ color: 'var(--text-muted)', fontSize: '11px', textAlign: 'center' }}>
          Failed to load image: {fileName}
        </div>
      </div>
    )
  }

  return (
    <div
      data-testid="image-renderer"
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '12px',
      }}
    >
      <img
        src={canvasSrc}
        alt={fileName}
        onError={() => setError(true)}
        style={{
          maxWidth: '100%',
          maxHeight: '60vh',
          objectFit: 'contain',
          borderRadius: '4px',
        }}
      />
    </div>
  )
}

export default ImageRenderer
