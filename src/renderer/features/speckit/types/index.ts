/**
 * SpecKit Types - Re-export all types
 *
 * @see specs/001-speckit-ui-integration/data-model.md
 */

// Feature types
export {
  ArtifactPresenceSchema,
  type ArtifactPresence,
  SpecKitFeatureSchema,
  type SpecKitFeature,
  FeatureSchema,
  type Feature,
} from "./feature"

// Constitution types
export {
  ConstitutionSchema,
  type Constitution,
} from "./constitution"

// Workflow state types
export {
  WorkflowStepNameSchema,
  type WorkflowStepName,
  WORKFLOW_STEP_LABELS,
  WORKFLOW_STEPS_ORDER,
  ClarificationQuestionSchema,
  type ClarificationQuestion,
  ArtifactPresenceWithConstitutionSchema,
  type ArtifactPresenceWithConstitution,
  WorkflowStateSchema,
  type WorkflowState,
} from "./workflow-state"

// Initialization types
export {
  InitializationStatusSchema,
  type InitializationStatus,
} from "./initialization"

// UI model types
export type {
  FeatureTableRow,
  ConstitutionPreview,
  CommandOutputEvent,
  ArtifactType,
  DocumentDisplayState,
} from "./ui-models"
