/**
 * SpecKit UI Model Types
 *
 * Types for UI view models derived from core entities.
 *
 * @see specs/001-speckit-ui-integration/data-model.md
 */

/**
 * Feature table row - derived from Feature for table display
 */
export interface FeatureTableRow {
  /** Feature number (e.g., "001") */
  id: string
  /** Feature short name (e.g., "speckit-ui-integration") */
  name: string
  /** Description extracted from spec.md */
  description: string
  /** Full branch name (e.g., "001-speckit-ui-integration") */
  branch: string
  /** Artifact file paths (null if doesn't exist) */
  artifacts: {
    spec: string | null
    plan: string | null
    research: string | null
    tasks: string | null
  }
}

/**
 * Constitution preview - condensed constitution for drawer widget
 */
export interface ConstitutionPreview {
  /** Extracted principle names */
  principleNames: string[]
  /** Total number of principles */
  principleCount: number
  /** Last amendment date if available */
  lastAmended?: Date
}

/**
 * Command output event for streaming
 */
export interface CommandOutputEvent {
  /** Output stream type */
  stream: "stdout" | "stderr"
  /** Output chunk */
  chunk: string
  /** Whether the command is done */
  done: boolean
}

/**
 * Artifact type for display
 */
export type ArtifactType = "spec" | "plan" | "research" | "tasks" | "constitution"

/**
 * Document display state for the document pane
 */
export interface DocumentDisplayState {
  /** Type of document being displayed */
  type: ArtifactType
  /** Markdown content */
  content: string
  /** File path (for open in editor) */
  filePath?: string
}
