/**
 * SpecKit tRPC Router (ii-spec Native Architecture)
 *
 * This router provides the backend API for the SpecKit UI integration.
 * It follows the ii-spec native approach where all workflow state is
 * owned by ii-spec via the file system.
 *
 * ## Architecture
 *
 * - **State Detection**: Reads Git branch and file system to detect workflow state
 * - **File Access**: Provides read access to artifacts (spec.md, plan.md, etc.)
 * - **Command Execution**: Executes ii-spec commands via subprocess
 * - **File Watching**: Monitors specs/ and .specify/ for changes
 *
 * ## Key Principles
 *
 * - ii-spec owns all workflow state via files (specs/, .specify/)
 * - Current Git branch determines active feature
 * - UI reads files and executes ii-spec commands via subprocess
 * - NO custom workflow state management needed
 *
 * ## Procedure Categories
 *
 * - **Initialization**: checkInitialization, initializeSpecKit, checkSubmodule
 * - **State Detection**: getWorkflowState, getCurrentBranch
 * - **File Reading**: getConstitution, getFeaturesList, getArtifact
 * - **Command Execution**: executeCommand, onCommandOutput, cancelCommand
 * - **Git Operations**: getFeatureBranches, switchBranch
 * - **File System**: watchDirectory, onFileChange, openFileInEditor
 *
 * @see specs/001-speckit-ui-integration/II_SPEC_NATIVE_ARCHITECTURE.md
 * @module main/lib/trpc/routers/speckit
 */

import { z } from "zod"
import { router, publicProcedure } from "../index"
import { observable } from "@trpc/server/observable"
import { shell } from "electron"
import { execSync, execFileSync } from "child_process"
import { watch, type FSWatcher } from "fs"
import path from "path"

import {
  getCurrentBranch,
  parseFeatureBranch,
  checkFileExists,
  readFileContent,
  listFeatureDirectories,
  listFeatureBranches,
  checkArtifactsPresent,
  getArtifactPath,
  getConstitutionPath,
  extractFeatureDescription,
  checkSubmoduleStatus,
} from "../../speckit/file-utils"

import {
  detectWorkflowState,
  type WorkflowState,
  type WorkflowStepName,
} from "../../speckit/state-detector"

import { validateBranchName } from "../../speckit/security-utils"

import {
  executeCommand as execSpecKitCommand,
  getExecutionEmitter,
  cancelExecution,
} from "../../speckit/command-executor"

// ============================================================================
// Zod Schemas
// ============================================================================

const WorkflowStepNameSchema = z.enum([
  "no-feature",
  "constitution",
  "specify",
  "clarify",
  "plan",
  "tasks",
  "analyze",
  "implement",
])

const ArtifactPresenceSchema = z.object({
  spec: z.boolean(),
  plan: z.boolean(),
  research: z.boolean(),
  tasks: z.boolean(),
  constitution: z.boolean(),
})

const ClarificationQuestionSchema = z.object({
  question: z.string(),
  topic: z.string(),
  options: z.array(z.string()).optional(),
})

const WorkflowStateSchema = z.object({
  featureNumber: z.string().optional(),
  featureName: z.string().optional(),
  branchName: z.string().optional(),
  currentStep: WorkflowStepNameSchema,
  artifactsPresent: ArtifactPresenceSchema,
  needsClarification: z.boolean(),
  clarificationQuestions: z.array(ClarificationQuestionSchema).optional(),
})

const InitializationStatusSchema = z.object({
  initialized: z.boolean(),
  missingComponents: z.array(z.string()),
  initCommand: z.string(),
})

const FeatureSchema = z.object({
  id: z.string(),
  name: z.string(),
  branch: z.string(),
  description: z.string().optional(),
  artifacts: z.object({
    spec: z.boolean(),
    plan: z.boolean(),
    research: z.boolean(),
    tasks: z.boolean(),
  }),
})

// ============================================================================
// File Watchers Registry
// ============================================================================

// Interface for watcher entries with timestamps
interface WatcherEntry {
  watcher: FSWatcher
  watchId: string
  projectPath: string
  directory: string
  createdAt: Date
}

// Replace the simple Map with typed Map
const fileWatchers = new Map<string, WatcherEntry>()

// File watchers are cleaned up via subscription cleanup callbacks
// No time-based cleanup needed - subscription lifecycle manages watcher lifecycle

// ============================================================================
// Router Definition
// ============================================================================

export const speckitRouter = router({
  // ==========================================
  // Submodule Verification (T123)
  // ==========================================

  /**
   * Check if the ii-spec submodule is properly initialized
   */
  checkSubmodule: publicProcedure
    .input(z.object({ projectPath: z.string() }))
    .query(({ input }) => {
      return checkSubmoduleStatus(input.projectPath)
    }),

  // ==========================================
  // Initialization Detection (T026-T027)
  // ==========================================

  /**
   * Check if ii-spec is initialized in the project
   */
  checkInitialization: publicProcedure
    .input(z.object({ projectPath: z.string() }))
    .query(({ input }): z.infer<typeof InitializationStatusSchema> => {
      const { projectPath } = input
      const missingComponents: string[] = []

      // Check .specify/ directory
      const specifyDir = path.join(projectPath, ".specify")
      if (!checkFileExists(specifyDir)) {
        missingComponents.push(".specify/")
      }

      // Check .specify/templates/
      const templatesDir = path.join(projectPath, ".specify", "templates")
      if (!checkFileExists(templatesDir)) {
        missingComponents.push(".specify/templates/")
      }

      // Check .specify/memory/
      const memoryDir = path.join(projectPath, ".specify", "memory")
      if (!checkFileExists(memoryDir)) {
        missingComponents.push(".specify/memory/")
      }

      // Check .specify/scripts/
      const scriptsDir = path.join(projectPath, ".specify", "scripts")
      if (!checkFileExists(scriptsDir)) {
        missingComponents.push(".specify/scripts/")
      }

      // Check constitution.md
      const constitutionPath = getConstitutionPath(projectPath)
      if (!checkFileExists(constitutionPath)) {
        missingComponents.push(".specify/memory/constitution.md")
      }

      return {
        initialized: missingComponents.length === 0,
        missingComponents,
        initCommand: "specify init . --ai claude",
      }
    }),

  /**
   * Initialize ii-spec in the project
   */
  initializeSpecKit: publicProcedure
    .input(z.object({ projectPath: z.string() }))
    .mutation(({ input }) => {
      const { projectPath } = input

      try {
        const output = execSync("specify init . --ai claude", {
          cwd: projectPath,
          encoding: "utf-8",
          timeout: 60000, // 1 minute timeout
        })

        return {
          success: true,
          output,
          error: undefined,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        return {
          success: false,
          output: "",
          error: message,
        }
      }
    }),

  // ==========================================
  // Workflow State Detection (T028)
  // ==========================================

  /**
   * Detect current workflow state from Git branch and files
   */
  getWorkflowState: publicProcedure
    .input(z.object({ projectPath: z.string() }))
    .query(({ input }): WorkflowState => {
      return detectWorkflowState(input.projectPath)
    }),

  // ==========================================
  // File Reading (T029-T032)
  // ==========================================

  /**
   * Read constitution content
   */
  getConstitution: publicProcedure
    .input(z.object({ projectPath: z.string() }))
    .query(({ input }) => {
      const { projectPath } = input
      const constitutionPath = getConstitutionPath(projectPath)
      const exists = checkFileExists(constitutionPath)

      if (!exists) {
        return {
          content: "",
          exists: false,
          version: undefined,
        }
      }

      try {
        const content = readFileContent(constitutionPath)

        // Try to extract version from content
        const versionMatch = content.match(/Version:\s*([\d.]+)/i)
        const version = versionMatch ? versionMatch[1] : undefined

        return {
          content,
          exists: true,
          version,
        }
      } catch {
        return {
          content: "",
          exists: false,
          version: undefined,
        }
      }
    }),

  /**
   * List all features from the specs/ directory
   *
   * Reads the specs/ directory and returns a paginated list of features.
   * Each feature includes its ID, name, branch, description, and artifact presence.
   *
   * @param projectPath - The project root path
   * @param limit - Maximum number of features to return (default: 100)
   * @param offset - Number of features to skip for pagination (default: 0)
   * @returns Object with features array and total count for pagination
   *
   * @example
   * ```typescript
   * const { features, total } = await trpc.speckit.getFeaturesList.query({
   *   projectPath: '/path/to/project',
   *   limit: 10,
   *   offset: 0,
   * })
   * ```
   */
  getFeaturesList: publicProcedure
    .input(
      z.object({
        projectPath: z.string(),
        limit: z.number().optional().default(100),
        offset: z.number().optional().default(0),
      })
    )
    .query(({ input }): { features: z.infer<typeof FeatureSchema>[]; total: number } => {
      const { projectPath, limit, offset } = input

      const featureDirs = listFeatureDirectories(projectPath)
      const total = featureDirs.length

      // Apply pagination
      const paginated = featureDirs.slice(offset, offset + limit)

      const features = paginated.map((dirName) => {
        const parsed = parseFeatureBranch(dirName)
        const artifacts = checkArtifactsPresent(projectPath, dirName)

        // Try to get description from spec.md
        let description: string | undefined
        if (artifacts.spec) {
          try {
            const specPath = getArtifactPath(projectPath, dirName, "spec")
            const specContent = readFileContent(specPath)
            description = extractFeatureDescription(specContent)
          } catch {
            // Ignore errors reading spec
          }
        }

        return {
          id: parsed?.featureNumber ?? dirName.split("-")[0],
          name: parsed?.featureName ?? dirName,
          branch: dirName,
          description,
          artifacts,
        }
      })

      return { features, total }
    }),

  /**
   * Read a specific artifact file
   */
  getArtifact: publicProcedure
    .input(
      z.object({
        projectPath: z.string(),
        featureBranch: z.string(),
        artifactType: z.enum(["spec", "plan", "research", "tasks"]),
      })
    )
    .query(({ input }) => {
      const { projectPath, featureBranch, artifactType } = input
      const filePath = getArtifactPath(projectPath, featureBranch, artifactType)
      const exists = checkFileExists(filePath)

      if (!exists) {
        return {
          content: "",
          exists: false,
          filePath,
        }
      }

      try {
        const content = readFileContent(filePath)
        return {
          content,
          exists: true,
          filePath,
        }
      } catch {
        return {
          content: "",
          exists: false,
          filePath,
        }
      }
    }),

  /**
   * Read feature description from spec.md
   */
  getFeatureDescription: publicProcedure
    .input(
      z.object({
        projectPath: z.string(),
        featureBranch: z.string(),
      })
    )
    .query(({ input }) => {
      const { projectPath, featureBranch } = input
      const specPath = getArtifactPath(projectPath, featureBranch, "spec")
      const exists = checkFileExists(specPath)

      if (!exists) {
        return {
          description: "",
          exists: false,
        }
      }

      try {
        const content = readFileContent(specPath)
        const description = extractFeatureDescription(content)
        return {
          description,
          exists: true,
        }
      } catch {
        return {
          description: "",
          exists: false,
        }
      }
    }),

  // ==========================================
  // Command Execution (T033-T035)
  // ==========================================

  /**
   * Execute an ii-spec command via subprocess
   */
  executeCommand: publicProcedure
    .input(
      z.object({
        projectPath: z.string(),
        command: z.string(),
        args: z.string(),
      })
    )
    .mutation(({ input }) => {
      const { projectPath, command, args } = input

      try {
        const { executionId } = execSpecKitCommand(projectPath, command, args)
        return {
          success: true,
          error: undefined,
          executionId,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        return {
          success: false,
          error: message,
          executionId: "",
        }
      }
    }),

  /**
   * Subscribe to command output (streaming)
   */
  onCommandOutput: publicProcedure
    .input(z.object({ executionId: z.string() }))
    .subscription(({ input }) => {
      return observable<{ chunk: string; stream: "stdout" | "stderr"; done: boolean }>(
        (emit) => {
          const emitter = getExecutionEmitter(input.executionId)

          if (!emitter) {
            emit.error(new Error(`Execution not found: ${input.executionId}`))
            return
          }

          const outputHandler = (data: { stream: "stdout" | "stderr"; chunk: string }) => {
            emit.next({ chunk: data.chunk, stream: data.stream, done: false })
          }

          const doneHandler = () => {
            emit.next({ chunk: "", stream: "stdout", done: true })
            emit.complete()
          }

          emitter.on("output", outputHandler)
          emitter.on("done", doneHandler)

          return () => {
            emitter.off("output", outputHandler)
            emitter.off("done", doneHandler)
          }
        }
      )
    }),

  /**
   * Cancel a running command
   */
  cancelCommand: publicProcedure
    .input(z.object({ executionId: z.string() }))
    .mutation(({ input }) => {
      const success = cancelExecution(input.executionId)
      return { success }
    }),

  // ==========================================
  // Git Operations (T036-T039)
  // ==========================================

  /**
   * Get current Git branch
   */
  getCurrentBranch: publicProcedure
    .input(z.object({ projectPath: z.string() }))
    .query(({ input }) => {
      try {
        const branch = getCurrentBranch(input.projectPath)
        const parsed = parseFeatureBranch(branch)
        return {
          branch,
          isFeatureBranch: parsed !== null,
        }
      } catch {
        return {
          branch: "",
          isFeatureBranch: false,
        }
      }
    }),

  /**
   * List all feature branches
   */
  getFeatureBranches: publicProcedure
    .input(z.object({ projectPath: z.string() }))
    .query(({ input }) => {
      const { projectPath } = input
      const branches = listFeatureBranches(projectPath)

      let currentBranch: string
      try {
        currentBranch = getCurrentBranch(projectPath)
      } catch {
        currentBranch = ""
      }

      return branches.map((branch) => {
        const parsed = parseFeatureBranch(branch)
        return {
          branch,
          featureNumber: parsed?.featureNumber ?? "",
          featureName: parsed?.featureName ?? branch,
          current: branch === currentBranch,
        }
      })
    }),

  /**
   * Switch to a feature branch
   */
  switchBranch: publicProcedure
    .input(
      z.object({
        projectPath: z.string(),
        branch: z.string().refine(
          (b) => validateBranchName(b),
          { message: "Invalid Git branch name format. Branch names can only contain letters, numbers, hyphens, underscores, dots, and slashes." }
        ),
      })
    )
    .mutation(({ input }) => {
      const { projectPath, branch } = input

      try {
        // Use execFileSync with array args - no shell injection possible
        execFileSync("git", ["checkout", branch], {
          cwd: projectPath,
          encoding: "utf-8",
          timeout: 30000,
        })
        return {
          success: true,
          error: undefined,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error switching branch"
        return {
          success: false,
          error: message,
        }
      }
    }),

  /**
   * Open a file in the system editor
   */
  openFileInEditor: publicProcedure
    .input(z.object({ filePath: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const error = await shell.openPath(input.filePath)
        if (error) {
          return {
            success: false,
            error,
          }
        }
        return {
          success: true,
          error: undefined,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        return {
          success: false,
          error: message,
        }
      }
    }),

  // ==========================================
  // File System Utilities (T040-T041)
  // ==========================================

  /**
   * Watch a directory for file changes
   */
  watchDirectory: publicProcedure
    .input(
      z.object({
        projectPath: z.string(),
        directory: z.enum(["specs", ".specify"]),
      })
    )
    .mutation(({ input }) => {
      const { projectPath, directory } = input
      const watchPath = path.join(projectPath, directory)
      const watchId = `${projectPath}::${directory}` // CHANGED: Use :: instead of : for Windows compatibility

      // Close existing watcher if any
      const existingWatcher = fileWatchers.get(watchId)
      if (existingWatcher) {
        existingWatcher.watcher.close()
        fileWatchers.delete(watchId)
      }

      return { watchId }
    }),

  /**
   * Subscribe to file change events
   */
  onFileChange: publicProcedure
    .input(z.object({ watchId: z.string() }))
    .subscription(({ input }) => {
      return observable<{ event: "add" | "change" | "unlink"; filePath: string }>((emit) => {
        // CHANGED: Split on :: instead of : to avoid Windows drive letter issues
        const [projectPath, directory] = input.watchId.split("::")

        if (!projectPath || !directory) {
          emit.error(new Error(`Invalid watchId format: ${input.watchId}`))
          return
        }

        const watchPath = path.join(projectPath, directory)

        if (!checkFileExists(watchPath)) {
          emit.error(new Error(`Watch path does not exist: ${watchPath}`))
          return
        }

        const watcher = watch(watchPath, { recursive: true }, (eventType, filename) => {
          if (filename) {
            const event = eventType === "rename" ? "add" : "change"
            emit.next({ event, filePath: filename })
          }
        })

        // Store watcher as WatcherEntry, not just the watcher
        const watcherEntry: WatcherEntry = {
          watcher,
          watchId: input.watchId,
          projectPath,
          directory,
          createdAt: new Date(),
        }
        fileWatchers.set(input.watchId, watcherEntry)

        return () => {
          watcher.close()
          fileWatchers.delete(input.watchId)
        }
      })
    }),
})

export type SpeckitRouter = typeof speckitRouter
