import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'

interface Props {
  children: ReactNode
  fallbackLabel?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', this.props.fallbackLabel ?? 'Unknown', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children

    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', padding: 32, color: 'var(--text-muted)', gap: 12,
      }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          Something went wrong in {this.props.fallbackLabel ?? 'this panel'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-very-muted)', maxWidth: 400, textAlign: 'center' }}>
          {this.state.error?.message ?? 'Unknown error'}
        </div>
        <button
          onClick={() => this.setState({ hasError: false, error: null })}
          style={{
            marginTop: 8, padding: '6px 14px', fontSize: 12,
            background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
            border: '1px solid var(--border-subtle)', borderRadius: 4, cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </div>
    )
  }
}