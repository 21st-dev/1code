/**
 * SpecKit Workflow State Types
 *
 * Types for workflow state detection.
 * State is detected from Git branch and file system.
 *
 * @see specs/001-speckit-ui-integration/data-model.md
 */

import { z } from "zod"

/**
 * Workflow step names
 */
export const WorkflowStepNameSchema = z.enum([
  "no-feature", // No feature branch checked out
  "constitution", // Constitution doesn't exist yet
  "specify", // spec.md doesn't exist yet
  "clarify", // spec.md has [NEEDS CLARIFICATION] markers
  "plan", // spec.md exists, plan.md doesn't
  "tasks", // plan.md exists, tasks.md doesn't
  "analyze", // tasks.md exists, can run analysis
  "implement", // All artifacts exist
])

export type WorkflowStepName = z.infer<typeof WorkflowStepNameSchema>

/**
 * Human-readable workflow step labels
 */
export const WORKFLOW_STEP_LABELS: Record<WorkflowStepName, string> = {
  "no-feature": "No Feature",
  constitution: "Constitution",
  specify: "Specify",
  clarify: "Clarify",
  plan: "Plan",
  tasks: "Tasks",
  analyze: "Analyze",
  implement: "Implement",
}

/**
 * Workflow step order for stepper UI
 */
export const WORKFLOW_STEPS_ORDER: WorkflowStepName[] = [
  "constitution",
  "specify",
  "clarify",
  "plan",
  "tasks",
  "implement",
]

/**
 * Clarification question parsed from spec.md
 */
export const ClarificationQuestionSchema = z.object({
  question: z.string(),
  topic: z.string(),
  options: z.array(z.string()).optional(),
})

export type ClarificationQuestion = z.infer<typeof ClarificationQuestionSchema>

/**
 * Artifact presence with constitution
 */
export const ArtifactPresenceWithConstitutionSchema = z.object({
  spec: z.boolean(),
  plan: z.boolean(),
  research: z.boolean(),
  tasks: z.boolean(),
  constitution: z.boolean(),
})

export type ArtifactPresenceWithConstitution = z.infer<typeof ArtifactPresenceWithConstitutionSchema>

/**
 * Workflow state detected from Git branch and file system
 */
export const WorkflowStateSchema = z.object({
  featureNumber: z.string().optional(),
  featureName: z.string().optional(),
  branchName: z.string().optional(),
  currentStep: WorkflowStepNameSchema,
  artifactsPresent: ArtifactPresenceWithConstitutionSchema,
  needsClarification: z.boolean(),
  clarificationQuestions: z.array(ClarificationQuestionSchema).optional(),
})

export type WorkflowState = z.infer<typeof WorkflowStateSchema>
