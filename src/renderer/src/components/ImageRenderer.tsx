type ImageRendererProps = {
  filePath: string
}

function ImageRenderer({ filePath }: ImageRendererProps): React.ReactElement {
  const fileName = filePath.split('/').pop() || 'image'

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
      <div style={{ color: '#8B8B90', fontSize: '11px', textAlign: 'center' }}>
        <div style={{ marginBottom: '8px' }}>{fileName}</div>
        <div>(Image preview requires canvas:// protocol)</div>
      </div>
    </div>
  )
}

export default ImageRenderer