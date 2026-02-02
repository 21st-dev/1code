/**
 * Simplified SpecKit tRPC Router (ii-spec Native Architecture)
 *
 * This router reflects the ii-spec native approach where:
 * - ii-spec owns all workflow state via files (specs/, .specify/)
 * - Current Git branch determines active feature
 * - UI reads files and executes ii-spec commands via subprocess
 * - NO custom workflow state management needed
 *
 * @see specs/001-speckit-ui-integration/II_SPEC_NATIVE_ARCHITECTURE.md
 */

import { z } from 'zod'

// ============================================================================
// Schema Definitions
// ============================================================================

/**
 * Workflow state detected from Git branch and file system
 */
export const WorkflowStateSchema = z.object({
  // Parsed from current Git branch (e.g., "001-speckit-ui-integration")
  featureNumber: z.string().optional(), // e.g., "001"
  featureName: z.string().optional(), // e.g., "speckit-ui-integration"
  branchName: z.string().optional(), // e.g., "001-speckit-ui-integration"

  // Current workflow step (detected from file existence)
  currentStep: z.enum([
    'no-feature', // No feature branch checked out
    'constitution', // Constitution not created yet
    'specify', // spec.md not created yet
    'clarify', // spec.md has [NEEDS CLARIFICATION] markers
    'plan', // spec.md exists, plan.md does not
    'tasks', // plan.md exists, tasks.md does not
    'analyze', // tasks.md exists, can run analysis
    'implement', // All artifacts exist, ready for implementation
  ]),

  // Which artifacts exist (read from file system)
  artifactsPresent: z.object({
    spec: z.boolean(),
    plan: z.boolean(),
    research: z.boolean(),
    tasks: z.boolean(),
    constitution: z.boolean(),
  }),

  // Does spec.md contain [NEEDS CLARIFICATION] markers?
  needsClarification: z.boolean(),

  // Clarification questions (parsed from spec.md)
  clarificationQuestions: z
    .array(
      z.object({
        question: z.string(),
        topic: z.string(),
        options: z.array(z.string()).optional(),
      })
    )
    .optional(),
})

export type WorkflowState = z.infer<typeof WorkflowStateSchema>

/**
 * Feature metadata (read from specs/ directory)
 */
export const FeatureSchema = z.object({
  id: z.string(), // e.g., "001"
  name: z.string(), // e.g., "speckit-ui-integration"
  branch: z.string(), // e.g., "001-speckit-ui-integration"
  description: z.string().optional(), // Extracted from spec.md if exists

  // Which artifacts exist for this feature
  artifacts: z.object({
    spec: z.boolean(),
    plan: z.boolean(),
    research: z.boolean(),
    tasks: z.boolean(),
  }),
})

export type Feature = z.infer<typeof FeatureSchema>

/**
 * Initialization status (checks for .specify/ structure)
 */
export const InitializationStatusSchema = z.object({
  initialized: z.boolean(),
  missingComponents: z.array(z.string()),
  initCommand: z.string(), // e.g., "specify init . --ai claude"
})

export type InitializationStatus = z.infer<typeof InitializationStatusSchema>

// ============================================================================
// Simplified tRPC Router
// ============================================================================

export const speckitRouter = {
  // ==========================================
  // Initialization Detection
  // ==========================================

  /**
   * Check if ii-spec is initialized in the project
   *
   * Checks for:
   * - .specify/ directory exists
   * - .specify/templates/ directory with required templates
   * - .specify/memory/ directory
   * - .specify/scripts/ directory
   */
  checkInitialization: {
    input: z.object({
      projectPath: z.string(),
    }),
    output: InitializationStatusSchema,
  },

  /**
   * Initialize ii-spec in the project
   *
   * Executes: specify init . --ai claude
   */
  initializeSpecKit: {
    input: z.object({
      projectPath: z.string(),
    }),
    output: z.object({
      success: z.boolean(),
      output: z.string(),
      error: z.string().optional(),
    }),
  },

  // ==========================================
  // Workflow State Detection (File-Based)
  // ==========================================

  /**
   * Detect current workflow state from Git branch and files
   *
   * This is the core state detection procedure that:
   * 1. Reads current Git branch
   * 2. Parses feature number/name from branch
   * 3. Checks which artifact files exist
   * 4. Parses spec.md for clarification markers
   * 5. Determines current workflow step
   *
   * NO database or memory state - all read from file system
   */
  getWorkflowState: {
    input: z.object({
      projectPath: z.string(),
    }),
    output: WorkflowStateSchema,
  },

  // ==========================================
  // File Reading (for UI Display)
  // ==========================================

  /**
   * Read constitution content
   *
   * Reads: .specify/memory/constitution.md
   */
  getConstitution: {
    input: z.object({
      projectPath: z.string(),
    }),
    output: z.object({
      content: z.string(),
      exists: z.boolean(),
      version: z.string().optional(), // Extracted from file header
    }),
  },

  /**
   * List all features (from specs/ directory)
   *
   * Reads specs/ directory and returns feature metadata
   */
  getFeaturesList: {
    input: z.object({
      projectPath: z.string(),
      limit: z.number().optional().default(100),
      offset: z.number().optional().default(0),
    }),
    output: z.object({
      features: z.array(FeatureSchema),
      total: z.number(),
    }),
  },

  /**
   * Read a specific artifact file
   *
   * Reads: specs/{branch}/{artifactType}.md
   */
  getArtifact: {
    input: z.object({
      projectPath: z.string(),
      featureBranch: z.string(), // e.g., "001-speckit-ui-integration"
      artifactType: z.enum(['spec', 'plan', 'research', 'tasks']),
    }),
    output: z.object({
      content: z.string(),
      exists: z.boolean(),
      filePath: z.string(), // Full path to file
    }),
  },

  /**
   * Read feature description from spec.md
   *
   * Parses spec.md and extracts the feature description section
   */
  getFeatureDescription: {
    input: z.object({
      projectPath: z.string(),
      featureBranch: z.string(),
    }),
    output: z.object({
      description: z.string(),
      exists: z.boolean(),
    }),
  },

  // ==========================================
  // Command Execution
  // ==========================================

  /**
   * Execute an ii-spec command via subprocess
   *
   * Spawns: specify <command> <args>
   * Streams output via onCommandOutput subscription
   *
   * Examples:
   * - command: '/speckit.specify', args: 'Add user authentication'
   * - command: '/speckit.plan', args: ''
   * - command: '/speckit.clarify', args: 'Q1: OAuth, Q2: JWT'
   */
  executeCommand: {
    input: z.object({
      projectPath: z.string(),
      command: z.string(), // e.g., '/speckit.specify'
      args: z.string(), // User's input
    }),
    output: z.object({
      success: z.boolean(),
      error: z.string().optional(),
      executionId: z.string(), // Used to subscribe to output
    }),
  },

  /**
   * Subscribe to command output (streaming)
   *
   * Returns chunks of stdout/stderr as they arrive
   */
  onCommandOutput: {
    input: z.object({
      executionId: z.string(),
    }),
    output: z.object({
      chunk: z.string(),
      stream: z.enum(['stdout', 'stderr']),
      done: z.boolean(), // True when process exits
    }),
  },

  /**
   * Cancel a running command
   */
  cancelCommand: {
    input: z.object({
      executionId: z.string(),
    }),
    output: z.object({
      success: z.boolean(),
    }),
  },

  // ==========================================
  // Git Operations (Helper Utilities)
  // ==========================================

  /**
   * Get current Git branch
   */
  getCurrentBranch: {
    input: z.object({
      projectPath: z.string(),
    }),
    output: z.object({
      branch: z.string(),
      isFeatureBranch: z.boolean(), // Matches NNN-* pattern
    }),
  },

  /**
   * List all feature branches
   *
   * Returns branches matching the NNN-* pattern
   */
  getFeatureBranches: {
    input: z.object({
      projectPath: z.string(),
    }),
    output: z.array(
      z.object({
        branch: z.string(),
        featureNumber: z.string(),
        featureName: z.string(),
        current: z.boolean(), // Is this the current branch?
      })
    ),
  },

  /**
   * Switch to a feature branch
   *
   * Executes: git checkout <branch>
   */
  switchBranch: {
    input: z.object({
      projectPath: z.string(),
      branch: z.string(),
    }),
    output: z.object({
      success: z.boolean(),
      error: z.string().optional(),
    }),
  },

  // ==========================================
  // File System Utilities
  // ==========================================

  /**
   * Open a file in the system editor
   *
   * Uses Electron's shell.openPath()
   */
  openFileInEditor: {
    input: z.object({
      filePath: z.string(),
    }),
    output: z.object({
      success: z.boolean(),
      error: z.string().optional(),
    }),
  },

  /**
   * Watch a directory for file changes
   *
   * Sets up file watcher and notifies via subscription
   */
  watchDirectory: {
    input: z.object({
      projectPath: z.string(),
      directory: z.enum(['specs', '.specify']),
    }),
    output: z.object({
      watchId: z.string(),
    }),
  },

  /**
   * Subscribe to file change events
   */
  onFileChange: {
    input: z.object({
      watchId: z.string(),
    }),
    output: z.object({
      event: z.enum(['add', 'change', 'unlink']),
      filePath: z.string(),
    }),
  },
}

// ============================================================================
// Implementation Notes
// ============================================================================

/**
 * Key Architectural Points:
 *
 * 1. STATE DETECTION, NOT STATE STORAGE
 *    - We READ workflow state from files, we don't STORE it
 *    - getWorkflowState() is the core state detection procedure
 *
 * 2. GIT BRANCH = ACTIVE FEATURE
 *    - Current branch determines which feature is active
 *    - No concept of "active workflow session" in memory
 *
 * 3. FILE EXISTENCE = WORKFLOW PROGRESS
 *    - spec.md exists → Specify step complete
 *    - plan.md exists → Plan step complete
 *    - No database tracking needed
 *
 * 4. SUBPROCESS EXECUTION, NOT ABSTRACTION
 *    - Execute ii-spec commands directly via child_process.spawn()
 *    - Stream output to UI, don't parse or interpret
 *
 * 5. ERROR PASS-THROUGH
 *    - ii-spec errors are user-friendly already
 *    - Show stderr output as-is in UI
 *
 * 6. NO WORKFLOW ORCHESTRATION
 *    - ii-spec handles step transitions
 *    - UI just detects current step and shows appropriate interface
 *
 * 7. MULTIPLE CONCURRENT WORKFLOWS (FREE)
 *    - Users switch branches → UI re-detects state
 *    - No special handling needed
 */

/**
 * Removed from Original Design:
 *
 * ❌ startWorkflowSession - Git branch is the session
 * ❌ getActiveWorkflowSession - Read from Git + files
 * ❌ resumeWorkflowSession - Just detect state on page load
 * ❌ updateWorkflowStep - ii-spec updates files
 * ❌ pauseWorkflowSession - Switch branches
 * ❌ completeWorkflowSession - Not needed
 * ❌ extractClarifications - Parse spec.md in UI
 * ❌ submitClarifications - Just call /speckit.clarify
 * ❌ getWorkflowDocument - Replaced with getArtifact
 * ❌ WorkflowSession entity - Git + files are the session
 * ❌ WorkflowClarifications entity - Parse from spec.md
 */
