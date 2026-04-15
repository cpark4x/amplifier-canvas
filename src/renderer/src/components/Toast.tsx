import { useEffect } from 'react'
import { useCanvasStore } from '../store'
import type { Toast } from '../../../shared/types'

interface ToastItemProps {
  toast: Toast
  onDismiss: () => void
}

function ToastItem({ toast, onDismiss }: ToastItemProps): React.ReactElement {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 6000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  const handleClick = () => {
    if (toast.action) {
      toast.action.onClick()
    }
    onDismiss()
  }

  return (
    <div
      data-testid="toast-item"
      style={{
        background: '#1C1A16',
        border: '1px solid #3A3530',
        borderRadius: 6,
        padding: '12px 16px',
        minWidth: 340,
        maxWidth: 420,
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        animation: 'toast-slide-in 0.25s ease-out',
        cursor: toast.action ? 'pointer' : 'default',
      }}
      onClick={toast.action ? handleClick : undefined}
    >
      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: '#E8E4DC',
            lineHeight: 1.3,
          }}
        >
          {toast.message}
        </div>
        {toast.subtitle && (
          <div
            style={{
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: '#9A9590',
              marginTop: 4,
              lineHeight: 1.2,
            }}
          >
            {toast.subtitle}
          </div>
        )}
      </div>

      {/* Dismiss button */}
      <button
        data-testid="toast-dismiss"
        onClick={(e) => {
          e.stopPropagation()
          onDismiss()
        }}
        style={{
          background: 'none',
          border: 'none',
          color: '#6A6560',
          fontSize: 14,
          cursor: 'pointer',
          padding: '0 2px',
          lineHeight: 1,
          fontFamily: 'inherit',
          flexShrink: 0,
        }}
      >
        {'\u00D7'}
      </button>
    </div>
  )
}

export function ToastContainer(): React.ReactElement | null {
  const toasts = useCanvasStore((s) => s.toasts)
  const dismissToast = useCanvasStore((s) => s.dismissToast)

  if (toasts.length === 0) return null

  return (
    <>
      <style>{`
        @keyframes toast-slide-in {
          from { transform: translateY(12px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      <div
        data-testid="toast-container"
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          alignItems: 'flex-end',
        }}
      >
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={() => dismissToast(toast.id)}
          />
        ))}
      </div>
    </>
  )
}
