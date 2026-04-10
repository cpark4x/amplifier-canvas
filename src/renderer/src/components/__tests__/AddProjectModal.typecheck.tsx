// Type-checking test for the AddProjectModal component.
// This file MUST fail to compile before the implementation and MUST pass after.
// It is NOT meant to be run — it is a compile-time assertion.

import type React from 'react'

// Import AddProjectModal (will fail until component is created)
import AddProjectModal from '../AddProjectModal'

// DiscoveredProject shape expected by the component
interface DiscoveredProject {
  slug: string
  name: string
  path: string
}

// --- Type assertions: AddProjectModal must accept the correct props ---

type AddProjectModalProps = React.ComponentProps<typeof AddProjectModal>

// Required props
type _HasOnClose = AddProjectModalProps extends { onClose: () => void } ? true : never
type _HasOnCreateNew = AddProjectModalProps extends { onCreateNew: (name: string) => void }
  ? true
  : never
type _HasOnAddExisting = AddProjectModalProps extends {
  onAddExisting: (project: DiscoveredProject) => void
}
  ? true
  : never

// Compile-time checks — these will error if the types don't match
const _checkOnClose: _HasOnClose = true
const _checkOnCreateNew: _HasOnCreateNew = true
const _checkOnAddExisting: _HasOnAddExisting = true

// Silence "declared but never read" warnings
void _checkOnClose
void _checkOnCreateNew
void _checkOnAddExisting
