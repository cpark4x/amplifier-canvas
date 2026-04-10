import { useEffect, useRef } from 'react'

export interface ContextMenuItem {
  label: string
  onClick: () => void
  danger?: boolean
}

interface ContextMenuProps {
  items: ContextMenuItem[]
  x: number
  y: number
  onClose: () => void
}

function ContextMenu({ items, x, y, onClose }: ContextMenuProps): React.ReactElement {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      data-testid="context-menu"
      style={{
        position: 'fixed',
        left: x,
        top: y,
        background: 'var(--bg-modal)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        padding: '4px 0',
        zIndex: 100,
        minWidth: 160,
      }}
    >
      {items.map((item, i) => (
        <div
          key={i}
          data-testid="context-menu-item"
          onClick={() => {
            item.onClick()
            onClose()
          }}
          style={{
            padding: '6px 12px',
            fontSize: 12,
            color: item.danger ? '#EF4444' : 'var(--text-primary)',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(0,0,0,0.06)'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'
          }}
        >
          {item.label}
        </div>
      ))}
    </div>
  )
}

export default ContextMenu