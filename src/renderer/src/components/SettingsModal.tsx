import { useState, useEffect } from 'react'
import type { CanvasSettings } from '../../../shared/types'

type SettingsModalProps = {
  isOpen: boolean
  onClose: () => void
}

function SettingsModal({ isOpen, onClose }: SettingsModalProps): React.ReactElement | null {
  const [analysisModel, setAnalysisModel] = useState('')
  const [analysisProvider, setAnalysisProvider] = useState('')

  // Load current settings whenever the modal opens
  useEffect(() => {
    if (!isOpen) return
    window.electronAPI
      .getSettings()
      .then((settings: CanvasSettings) => {
        setAnalysisModel(settings.analysisModel)
        setAnalysisProvider(settings.analysisProvider ?? '')
      })
      .catch(() => {
        // Silently ignore — fields stay at their defaults
      })
  }, [isOpen])

  if (!isOpen) return null

  function handleSave(): void {
    void window.electronAPI.saveSettings({
      analysisModel,
      analysisProvider: analysisProvider.trim() || null,
    })
    onClose()
  }

  function handleCancel(): void {
    onClose()
  }

  return (
    <div
      data-testid="settings-modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20,16,10,0.18)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
      }}
    >
      <div
        data-testid="settings-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420,
          background: 'var(--bg-modal)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          padding: 24,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
            Settings
          </span>
          <button
            data-testid="settings-modal-close"
            onClick={onClose}
            style={{
              fontSize: 16,
              color: 'var(--text-muted)',
              background: 'none',
              border: 'none',
              lineHeight: 1,
              padding: 0,
              cursor: 'pointer',
            }}
          >
            {'\u00d7'}
          </button>
        </div>

        {/* Form fields */}
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Analysis Model */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--text-muted)',
                marginBottom: 6,
                fontFamily: 'var(--font-ui)',
              }}
            >
              Analysis Model
            </label>
            <input
              data-testid="settings-analysis-model"
              type="text"
              placeholder="claude-sonnet-4-5"
              value={analysisModel}
              onChange={(e) => setAnalysisModel(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid var(--border)',
                background: '#F5F2EC',
                borderRadius: 3,
                fontSize: 13,
                fontFamily: 'var(--font-ui)',
                color: 'var(--text-primary)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Analysis Provider */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--text-muted)',
                marginBottom: 6,
                fontFamily: 'var(--font-ui)',
              }}
            >
              Analysis Provider
            </label>
            <input
              data-testid="settings-analysis-provider"
              type="text"
              placeholder="default (auto-detect)"
              value={analysisProvider}
              onChange={(e) => setAnalysisProvider(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid var(--border)',
                background: '#F5F2EC',
                borderRadius: 3,
                fontSize: 13,
                fontFamily: 'var(--font-ui)',
                color: 'var(--text-primary)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: 24,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <button
            data-testid="settings-cancel"
            onClick={handleCancel}
            style={{
              fontSize: 13,
              color: 'var(--text-muted)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
            }}
          >
            Cancel
          </button>
          <button
            data-testid="settings-save"
            onClick={handleSave}
            style={{
              padding: '7px 14px',
              border: '1px solid #3A3530',
              background: '#2F2B24',
              color: '#FFFFFF',
              fontSize: 13,
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

export default SettingsModal
