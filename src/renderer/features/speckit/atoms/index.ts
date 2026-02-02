/**
 * SpecKit Jotai Atoms
 *
 * Ephemeral UI state for SpecKit components.
 * These atoms track UI-only state - file system is the source of truth.
 *
 * @see specs/001-speckit-ui-integration/plan.md
 */

import { atom } from "jotai"
import type { DocumentDisplayState } from "../types"

/**
 * Whether the SpecKit workflow modal is open
 */
export const speckitModalOpenAtom = atom(false)

/**
 * Whether the SpecKit drawer is open
 *
 * Controls the right drawer showing the Plan page
 */
export const speckitDrawerOpenAtom = atom(false)

/**
 * Current document being displayed in the document pane
 *
 * Used by the workflow modal to show artifact content
 */
export const speckitCurrentDocumentAtom = atom<DocumentDisplayState | null>(null)

/**
 * Loading state for SpecKit operations
 */
export const speckitLoadingAtom = atom(false)

/**
 * Current execution ID for command streaming
 *
 * Used to track active command execution
 */
export const speckitExecutionIdAtom = atom<string | null>(null)

/**
 * Currently selected feature for viewing
 *
 * Used in the features table to track selection
 */
export const speckitSelectedFeatureAtom = atom<string | null>(null)

/**
 * Active workflow step (for manual navigation)
 *
 * null means follow the detected step from workflow state
 */
export const speckitActiveStepAtom = atom<string | null>(null)
