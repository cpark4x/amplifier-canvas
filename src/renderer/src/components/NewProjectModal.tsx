import { useState } from 'react'

type NewProjectModalProps = {
  onClose: () => void
  onCreate: (name: string, source: 'blank' | 'existing', folder?: string) => void
}

function NewProjectModal({ onClose, onCreate }: NewProjectModalProps): React.ReactElement {
  const [name, setName] = useState('')
  const [source, setSource] = useState<'blank' | 'existing'>('blank')

  return (
    /* Modal overlay — dark scrim per storyboard */
    <div
      data-testid="modal-overlay"
      onClick={onClose}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(20,16,10,0.18)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
      }}
    >
      {/* Modal card */}
      <div
        data-testid="modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 400,
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
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}>
            New Project
          </span>
          <button
            data-testid="modal-close"
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

        {/* Divider */}
        <div style={{
          height: 1,
          background: 'var(--border)',
          margin: '16px 0',
        }} />

        {/* Project Name */}
        <label style={{
          fontSize: 10,
          textTransform: 'uppercase',
          color: 'var(--text-very-muted)',
          letterSpacing: '0.08em',
          fontWeight: 600,
          display: 'block',
        }}>
          PROJECT NAME
        </label>
        <input
          data-testid="project-name-input"
          type="text"
          placeholder="e.g. Canvas-App"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          style={{
            width: '100%',
            padding: '8px 10px',
            border: '1px solid var(--border)',
            background: '#F5F2EC',
            borderRadius: 3,
            fontSize: 13,
            fontFamily: 'var(--font-ui)',
            color: 'var(--text-primary)',
            marginTop: 4,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />

        {/* Source radio group */}
        <div style={{ marginTop: 14 }}>
          <span style={{
            fontSize: 10,
            textTransform: 'uppercase',
            color: 'var(--text-very-muted)',
            letterSpacing: '0.08em',
            fontWeight: 600,
            display: 'block',
          }}>
            SOURCE
          </span>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <label
              data-testid="radio-blank"
              onClick={() => setSource('blank')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              <span style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                flexShrink: 0,
                ...(source === 'blank'
                  ? { background: 'var(--amber)' }
                  : { border: '1.5px solid var(--text-very-muted)', boxSizing: 'border-box' as const }),
              }} />
              <span style={{ color: 'var(--text-primary)' }}>Blank project</span>
            </label>
            <label
              data-testid="radio-existing"
              onClick={() => setSource('existing')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              <span style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                flexShrink: 0,
                ...(source === 'existing'
                  ? { background: 'var(--amber)' }
                  : { border: '1.5px solid var(--text-very-muted)', boxSizing: 'border-box' as const }),
              }} />
              <span style={{ color: source === 'existing' ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                Existing folder
              </span>
            </label>
          </div>
        </div>

        {/* Folder input (disabled unless "Existing folder" selected) */}
        <div style={{ marginTop: 14 }}>
          <span style={{
            fontSize: 10,
            textTransform: 'uppercase',
            color: 'var(--text-very-muted)',
            letterSpacing: '0.08em',
            fontWeight: 600,
            display: 'block',
            opacity: source === 'existing' ? 1 : 0.45,
          }}>
            FOLDER
          </span>
          <input
            data-testid="folder-input"
            type="text"
            placeholder="~/Projects/my-project"
            disabled={source !== 'existing'}
            style={{
              width: '100%',
              padding: '8px 10px',
              border: '1px solid var(--border)',
              background: '#F5F2EC',
              borderRadius: 3,
              fontSize: 13,
              fontFamily: 'var(--font-ui)',
              color: 'var(--text-muted)',
              marginTop: 4,
              outline: 'none',
              boxSizing: 'border-box',
              opacity: source === 'existing' ? 1 : 0.4,
            }}
          />
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <button
            data-testid="modal-cancel"
            onClick={onClose}
            style={{
              fontSize: 13,
              color: 'var(--text-muted)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            data-testid="modal-submit"
            onClick={() => {
              if (name.trim()) {
                onCreate(name.trim(), source)
              }
            }}
            style={{
              padding: '7px 14px',
              border: '1px solid #3A3530',
              background: 'var(--bg-modal)',
              color: 'var(--text-primary)',
              fontSize: 13,
              borderRadius: 4,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
              opacity: name.trim() ? 1 : 0.5,
            }}
          >
            Create project <span style={{ color: 'var(--amber)' }}>{'\u2192'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default NewProjectModal
