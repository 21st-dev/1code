/**
 * Workflow mode types for controlling how the workflow modal opens
 */

/**
 * Workflow start mode - determines how the workflow modal opens
 */
export enum WorkflowStartMode {
  Continue = 'CONTINUE',     // Resume from current state (default)
  NewFeature = 'NEW_FEATURE', // Start new feature workflow (empty state)
}
