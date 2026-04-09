// Type-checking test file — exercising new fields and interfaces added in task-1
// This file MUST fail to compile before the implementation and MUST pass after.
// It is NOT meant to be run — it is a compile-time assertion.

import type { SessionState, Toast, IPC_CHANNELS } from '../types'

// --- SessionState new optional fields ---
// If any of these fields don't exist on SessionState, TypeScript will error.
const _stateWithAllNewFields: SessionState = {
  id: 'test-id',
  projectSlug: 'test-slug',
  projectName: 'Test Project',
  status: 'running',
  startedAt: new Date().toISOString(),
  startedBy: 'canvas',
  byteOffset: 0,
  recentFiles: [],
  // New optional fields — must be accepted without error
  endedAt: new Date().toISOString(),
  exitCode: 0,
  title: 'My Session',
  promptCount: 5,
  toolCallCount: 10,
  filesChangedCount: 3,
}

// Verify they are optional (partial object must be valid)
const _stateWithoutNewFields: SessionState = {
  id: 'test-id-2',
  projectSlug: 'test-slug-2',
  projectName: 'Test Project 2',
  status: 'done',
  startedAt: new Date().toISOString(),
  startedBy: 'external',
  byteOffset: 0,
  recentFiles: [],
}

// --- Toast interface ---
// If Toast does not exist, this will error.
const _toastMinimal: Toast = {
  id: 'toast-1',
  sessionId: 'session-1',
  message: 'Session completed!',
}

const _toastWithAction: Toast = {
  id: 'toast-2',
  sessionId: 'session-2',
  message: 'Session failed',
  action: {
    label: 'View Logs',
    onClick: () => {},
  },
}

// --- SESSION_RESUME IPC channel ---
// If SESSION_RESUME is not in IPC_CHANNELS, TypeScript will error.
type _HasSessionResume = typeof IPC_CHANNELS extends { SESSION_RESUME: 'session:resume' }
  ? true
  : never
const _check: _HasSessionResume = true

// Silence "declared but never read" lint warnings
void _stateWithAllNewFields
void _stateWithoutNewFields
void _toastMinimal
void _toastWithAction
void _check
