import { useState, useRef, useEffect, useCallback } from 'react'

// --- Types ---

export type WorktreeChoice =
  | { type: 'main' }
  | { type: 'worktree'; branch: string }

export interface WorktreePopoverProps {
  anchorRect: DOMRect
  onSelect: (choice: WorktreeChoice) => void
  onClose: () => void
}

// --- Icons (inline SVG) ---

function BranchIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="4" cy="3.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="4" cy="10.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="10" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 5L4 9" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 5C4 6.5 5.5 6 8.5 6" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function MainIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="7" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="7" cy="11" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M7 4.5V9.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

// --- Component ---

function WorktreePopover({ anchorRect, onSelect, onClose }: WorktreePopoverProps): React.ReactElement {
  const [mode, setMode] = useState<'choose' | 'input'>('choose')
  const [branchName, setBranchName] = useState('')
  const popoverRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Close on Escape key
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    // Delay to avoid the click that opened the popover from immediately closing it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  // Auto-focus input when switching to input mode
  useEffect(() => {
    if (mode === 'input' && inputRef.current) {
      inputRef.current.focus()
    }
  }, [mode])

  const handleCreate = useCallback(() => {
    const trimmed = branchName.trim()
    if (trimmed) {
      onSelect({ type: 'worktree', branch: trimmed })
    }
  }, [branchName, onSelect])

  // Position below the anchor
  const top = anchorRect.bottom + 4
  const left = Math.max(8, anchorRect.left - 100) // center-ish under the button

  return (
    <div
      ref={popoverRef}
      data-testid="worktree-popover"
      style={{
        position: 'fixed',
        top,
        left,
        width: 220,
        zIndex: 1000,
        background: 'var(--bg-modal)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
        overflow: 'hidden',
        fontFamily: 'var(--font-ui)',
      }}
    >
      {mode === 'choose' ? (
        <>
          {/* Option 1: Use main branch */}
          <PopoverRow
            testId="worktree-main-option"
            icon={<MainIcon />}
            label="Use main branch"
            onClick={() => onSelect({ type: 'main' })}
          />

          {/* Separator */}
          <div style={{ height: 1, background: 'var(--border)' }} />

          {/* Option 2: Create worktree */}
          <PopoverRow
            testId="worktree-create-option"
            icon={<BranchIcon />}
            label="Create worktree"
            onClick={() => setMode('input')}
          />
        </>
      ) : (
        /* Input mode: branch name field + Create button */
        <div
          style={{
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              fontWeight: 500,
            }}
          >
            Branch name
          </div>
          <input
            ref={inputRef}
            data-testid="worktree-branch-input"
            type="text"
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCreate()
              }
            }}
            placeholder="feature/my-change"
            style={{
              width: '100%',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              padding: '5px 8px',
              border: '1px solid var(--border)',
              borderRadius: 4,
              background: 'var(--bg-page)',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button
              data-testid="worktree-cancel-btn"
              onClick={() => setMode('choose')}
              style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: 4,
                padding: '4px 10px',
                cursor: 'pointer',
                fontFamily: 'var(--font-ui)',
              }}
            >
              Back
            </button>
            <button
              data-testid="worktree-create-btn"
              onClick={handleCreate}
              disabled={!branchName.trim()}
              style={{
                fontSize: 11,
                color: branchName.trim() ? '#fff' : 'var(--text-very-muted)',
                background: branchName.trim() ? 'var(--amber)' : 'var(--border)',
                border: 'none',
                borderRadius: 4,
                padding: '4px 10px',
                cursor: branchName.trim() ? 'pointer' : 'default',
                fontWeight: 600,
                fontFamily: 'var(--font-ui)',
              }}
            >
              Create
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Sub-component: PopoverRow ---

interface PopoverRowProps {
  testId: string
  icon: React.ReactElement
  label: string
  onClick: () => void
}

function PopoverRow({ testId, icon, label, onClick }: PopoverRowProps): React.ReactElement {
  return (
    <div
      data-testid={testId}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '9px 12px',
        cursor: 'pointer',
        fontSize: 12,
        color: 'var(--text-primary)',
        transition: 'background 0.1s ease',
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(0,0,0,0.04)'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'
      }}
    >
      <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
        {icon}
      </span>
      <span>{label}</span>
    </div>
  )
}

export default WorktreePopover
