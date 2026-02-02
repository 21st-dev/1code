/**
 * Workflow State Detection for ii-spec Integration
 *
 * Core state detection module that determines the current workflow state
 * by reading from the file system and Git. This is the source of truth
 * for workflow progression.
 *
 * ## Detection Process
 *
 * 1. **Git Branch Detection**: Read current Git branch name
 * 2. **Feature Parsing**: Extract feature number/name from branch (e.g., "001-my-feature")
 * 3. **Artifact Detection**: Check which files exist in specs/{branch}/
 * 4. **Clarification Check**: Parse spec.md for [NEEDS CLARIFICATION] markers
 * 5. **Step Determination**: Calculate current workflow step based on artifacts
 *
 * ## Error Handling
 *
 * This module uses graceful degradation - if Git or file operations fail,
 * it returns a safe default state rather than throwing errors. This ensures
 * the UI remains functional even when the project is not a Git repository
 * or when files are temporarily inaccessible.
 *
 * ## No Persistent State
 *
 * All state is derived from the file system at read time. There is no
 * database, cache, or in-memory state management. This ensures the UI
 * always reflects the actual project state.
 *
 * @see specs/001-speckit-ui-integration/II_SPEC_NATIVE_ARCHITECTURE.md
 */

import path from "path"
import {
  getCurrentBranch,
  parseFeatureBranch,
  checkFileExists,
  readFileContent,
  checkArtifactsPresent,
  getConstitutionPath,
} from "./file-utils"

/**
 * Workflow step names
 */
export type WorkflowStepName =
  | "no-feature" // No feature branch checked out
  | "constitution" // Constitution doesn't exist yet
  | "specify" // spec.md doesn't exist yet
  | "clarify" // spec.md has [NEEDS CLARIFICATION] markers
  | "plan" // spec.md exists, plan.md doesn't
  | "tasks" // plan.md exists, tasks.md doesn't
  | "analyze" // tasks.md exists, can run analysis
  | "implement" // All artifacts exist

/**
 * Clarification question parsed from spec.md
 */
export interface ClarificationQuestion {
  question: string
  topic: string
  options?: string[]
}

/**
 * Workflow state detected from Git branch and file system
 */
export interface WorkflowState {
  featureNumber?: string
  featureName?: string
  branchName?: string
  currentStep: WorkflowStepName
  artifactsPresent: {
    spec: boolean
    plan: boolean
    research: boolean
    tasks: boolean
    constitution: boolean
  }
  needsClarification: boolean
  clarificationQuestions?: ClarificationQuestion[]
}

/**
 * Detect the current workflow state
 *
 * This is the core state detection function that:
 * 1. Reads current Git branch
 * 2. Parses feature number/name from branch
 * 3. Checks which artifact files exist
 * 4. Parses spec.md for clarification markers
 * 5. Determines current workflow step
 *
 * @param projectPath - The project root path
 * @returns The detected workflow state
 */
export function detectWorkflowState(projectPath: string): WorkflowState {
  // 1. Get current branch
  let branchName: string
  try {
    branchName = getCurrentBranch(projectPath)
  } catch {
    return {
      currentStep: "no-feature",
      artifactsPresent: {
        spec: false,
        plan: false,
        research: false,
        tasks: false,
        constitution: false,
      },
      needsClarification: false,
    }
  }

  // 2. Parse feature number/name from branch
  const featureInfo = parseFeatureBranch(branchName)
  if (!featureInfo) {
    // Not a feature branch, check constitution
    const constitutionExists = checkFileExists(getConstitutionPath(projectPath))
    return {
      branchName,
      currentStep: constitutionExists ? "no-feature" : "constitution",
      artifactsPresent: {
        spec: false,
        plan: false,
        research: false,
        tasks: false,
        constitution: constitutionExists,
      },
      needsClarification: false,
    }
  }

  const { featureNumber, featureName } = featureInfo

  // 3. Check which artifact files exist
  const artifacts = checkArtifactsPresent(projectPath, branchName)
  const constitutionExists = checkFileExists(getConstitutionPath(projectPath))

  // 4. Check for clarification markers in spec.md
  let needsClarification = false
  let clarificationQuestions: ClarificationQuestion[] = []

  if (artifacts.spec) {
    const specPath = path.join(projectPath, "specs", branchName, "spec.md")
    try {
      const specContent = readFileContent(specPath)
      clarificationQuestions = parseClarificationQuestions(specContent)
      needsClarification = clarificationQuestions.length > 0
    } catch {
      // Spec file exists but couldn't be read - treat as corrupt
      needsClarification = false
    }
  }

  // 5. Determine current step
  const currentStep = determineCurrentStep(
    artifacts,
    constitutionExists,
    needsClarification
  )

  return {
    featureNumber,
    featureName,
    branchName,
    currentStep,
    artifactsPresent: {
      ...artifacts,
      constitution: constitutionExists,
    },
    needsClarification,
    clarificationQuestions:
      clarificationQuestions.length > 0 ? clarificationQuestions : undefined,
  }
}

/**
 * Determine the current workflow step based on artifact presence
 *
 * @param artifacts - Which artifacts exist
 * @param constitutionExists - Whether constitution exists
 * @param needsClarification - Whether spec has clarification markers
 * @returns The current workflow step name
 */
function determineCurrentStep(
  artifacts: { spec: boolean; plan: boolean; research: boolean; tasks: boolean },
  constitutionExists: boolean,
  needsClarification: boolean
): WorkflowStepName {
  if (!constitutionExists) return "constitution"
  if (!artifacts.spec) return "specify"
  if (needsClarification) return "clarify"
  if (!artifacts.plan) return "plan"
  if (!artifacts.tasks) return "tasks"
  return "implement"
}

/**
 * Parse clarification questions from spec.md content
 *
 * Looks for patterns like:
 * - [NEEDS CLARIFICATION: question text]
 * - [NEEDS CLARIFICATION] question text
 *
 * ## Error Handling
 *
 * This function handles corrupted or malformed spec.md files gracefully:
 * - Returns empty array if content is null/undefined/empty
 * - Catches regex errors and returns empty array
 * - Limits maximum number of questions to prevent infinite loops
 * - Truncates excessively long question text
 *
 * @param specContent - The spec.md file content
 * @returns Array of clarification questions (empty array if parsing fails)
 */
export function parseClarificationQuestions(
  specContent: string
): ClarificationQuestion[] {
  // Handle null/undefined/empty content gracefully
  if (!specContent || typeof specContent !== "string") {
    return []
  }

  const questions: ClarificationQuestion[] = []
  const MAX_QUESTIONS = 50 // Prevent excessive parsing
  const MAX_QUESTION_LENGTH = 500 // Truncate overly long questions

  try {
    // Pattern 1: [NEEDS CLARIFICATION: question text]
    const pattern1 = /\[NEEDS CLARIFICATION:\s*([^\]]+)\]/gi
    let match
    let index = 1

    while ((match = pattern1.exec(specContent)) !== null && questions.length < MAX_QUESTIONS) {
      const questionText = match[1].trim().slice(0, MAX_QUESTION_LENGTH)
      if (questionText) {
        questions.push({
          question: questionText,
          topic: `Clarification ${index}`,
        })
        index++
      }
    }

    // Pattern 2: [NEEDS CLARIFICATION] followed by text
    const pattern2 = /\[NEEDS CLARIFICATION\]\s*:?\s*([^\n\[\]]+)/gi

    while ((match = pattern2.exec(specContent)) !== null && questions.length < MAX_QUESTIONS) {
      const questionText = match[1].trim().slice(0, MAX_QUESTION_LENGTH)
      // Avoid duplicates and empty questions
      if (questionText && !questions.some((q) => q.question === questionText)) {
        questions.push({
          question: questionText,
          topic: `Clarification ${index}`,
        })
        index++
      }
    }
  } catch (error) {
    // If regex parsing fails, return empty array rather than crashing
    console.error("[SpecKit] Failed to parse clarification questions:", error)
    return []
  }

  return questions
}

/**
 * Extract principle names from constitution content
 *
 * Looks for markdown headers like:
 * - ## Principle I - Desktop-First
 * - ## Principle II - Git Worktree Isolation
 *
 * @param constitutionContent - The constitution.md file content
 * @returns Array of principle names
 */
export function extractPrincipleNames(constitutionContent: string): string[] {
  const lines = constitutionContent.split("\n")
  const principleNames: string[] = []

  for (const line of lines) {
    // Match markdown headers like "## Principle I - Desktop-First"
    const match = line.match(/^##\s+Principle\s+[IVX]+\s+-\s+(.+)$/)
    if (match) {
      principleNames.push(match[1].trim())
    }
  }

  return principleNames
}
