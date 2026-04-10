// Type-checking test for the SessionAnalysis component.
// This file MUST fail to compile before the implementation and MUST pass after.
// It is NOT meant to be run — it is a compile-time assertion.

import type React from 'react'

// Import the SessionAnalysis component (will fail until component is created)
import SessionAnalysis from '../SessionAnalysis'

// --- Type assertions: SessionAnalysis must accept the correct props ---

type SessionAnalysisProps = React.ComponentProps<typeof SessionAnalysis>

// sessionId is required
type _HasSessionId = SessionAnalysisProps extends { sessionId: string } ? true : never

// optional props
type _HasOptionalTitle = SessionAnalysisProps extends { title?: string } ? true : never
type _HasOptionalDuration = SessionAnalysisProps extends { duration?: string } ? true : never
type _HasOptionalPromptCount = SessionAnalysisProps extends { promptCount?: number } ? true : never
type _HasOptionalToolCallCount = SessionAnalysisProps extends { toolCallCount?: number } ? true : never

// Compile-time checks — these will error if the types don't match
const _checkSessionId: _HasSessionId = true
const _checkTitle: _HasOptionalTitle = true
const _checkDuration: _HasOptionalDuration = true
const _checkPromptCount: _HasOptionalPromptCount = true
const _checkToolCallCount: _HasOptionalToolCallCount = true

// Silence "declared but never read" warnings
void _checkSessionId
void _checkTitle
void _checkDuration
void _checkPromptCount
void _checkToolCallCount
