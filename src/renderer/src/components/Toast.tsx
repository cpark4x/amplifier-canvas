import { useEffect } from 'react'
import { useCanvasStore } from '../store'
import type { Toast } from '../../../shared/types'

interface ToastItemProps {
  toast: Toast
  onDismiss: () => void
}

function ToastItem({ toast, onDismiss }: ToastItemProps): React.ReactElement {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div
      data-testid="toast-item"
      style={{
        background: '#F9F9F7',
        color: '#2A2A2A',
        padding: '10px 14px',
        borderRadius: 6,
        fontSize: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        maxWidth: 320,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        animation: 'toast-slide-in 0.2s ease-out',
      }}
    >
      <span style={{ flex: 1 }}>{toast.message}</span>
      {toast.action && (
        <button
          data-testid="toast-action"
          onClick={() => {
            toast.action!.onClick()
            onDismiss()
          }}
          style={{
            background: 'none',
            border: 'none',
            color: '#F59E0B',
            fontSize: '12px',
            cursor: 'pointer',
            padding: '0 4px',
            fontFamily: 'inherit',
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button
        data-testid="toast-dismiss"
        onClick={onDismiss}
        style={{
          background: 'none',
          border: 'none',
          color: '#2A2A2A',
          fontSize: '14px',
          cursor: 'pointer',
          padding: '0 4px',
          lineHeight: 1,
          fontFamily: 'inherit',
        }}
      >
        ×
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
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      <div
        data-testid="toast-container"
        style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
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
