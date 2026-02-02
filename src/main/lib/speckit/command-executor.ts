/**
 * Command executor for ii-spec integration
 *
 * Provides functions for:
 * - Spawning ii-spec commands via subprocess
 * - Streaming stdout/stderr output
 * - Canceling running commands
 *
 * @see specs/001-speckit-ui-integration/II_SPEC_NATIVE_ARCHITECTURE.md
 */

import { spawn, type ChildProcess } from "child_process"
import { EventEmitter } from "events"
import crypto from "crypto"

/**
 * Command output event data
 */
export interface CommandOutputEvent {
  stream: "stdout" | "stderr"
  chunk: string
}

/**
 * Command done event data
 */
export interface CommandDoneEvent {
  code: number | null
  signal: string | null
}

/**
 * Command execution state
 */
interface CommandExecution {
  id: string
  process: ChildProcess
  emitter: EventEmitter
  projectPath: string
  command: string
  startedAt: Date
}

// Active command executions
const executions = new Map<string, CommandExecution>()

/**
 * Execute an ii-spec command via subprocess
 *
 * Spawns the command and returns immediately with an execution ID.
 * Use getExecutionEmitter() to subscribe to output events.
 *
 * @param projectPath - The project root path (working directory)
 * @param command - The command to execute (e.g., "/speckit.specify")
 * @param args - Command arguments as a string
 * @returns Object containing executionId
 */
export function executeCommand(
  projectPath: string,
  command: string,
  args: string
): { executionId: string } {
  const executionId = crypto.randomUUID()
  const emitter = new EventEmitter()

  // Build the full command
  // The command format is expected to be like "/speckit.specify" with args
  // We need to transform this to call the actual ii-spec CLI
  const fullCommand = buildCommandString(command, args)

  // Spawn the process
  const proc = spawn(fullCommand, {
    cwd: projectPath,
    shell: true,
    env: {
      ...process.env,
      // Ensure ANTHROPIC_API_KEY is passed through
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      // Force color output
      FORCE_COLOR: "1",
    },
  })

  // Store execution
  executions.set(executionId, {
    id: executionId,
    process: proc,
    emitter,
    projectPath,
    command,
    startedAt: new Date(),
  })

  // Handle stdout
  proc.stdout?.on("data", (data: Buffer) => {
    const chunk = data.toString()
    emitter.emit("output", { stream: "stdout", chunk } satisfies CommandOutputEvent)
  })

  // Handle stderr
  proc.stderr?.on("data", (data: Buffer) => {
    const chunk = data.toString()
    emitter.emit("output", { stream: "stderr", chunk } satisfies CommandOutputEvent)
  })

  // Handle process exit
  proc.on("close", (code, signal) => {
    emitter.emit("done", { code, signal } satisfies CommandDoneEvent)
    // Cleanup after a short delay to allow subscribers to process final events
    setTimeout(() => {
      executions.delete(executionId)
    }, 1000)
  })

  // Handle errors
  proc.on("error", (error) => {
    emitter.emit("output", {
      stream: "stderr",
      chunk: `Process error: ${error.message}`,
    } satisfies CommandOutputEvent)
    emitter.emit("done", { code: 1, signal: null } satisfies CommandDoneEvent)
    executions.delete(executionId)
  })

  return { executionId }
}

/**
 * Build the actual command string to execute
 *
 * Transforms the command format (e.g., "/speckit.specify") into
 * the actual CLI command.
 *
 * @param command - The command (e.g., "/speckit.specify")
 * @param args - The arguments string
 * @returns The full command string to execute
 */
function buildCommandString(command: string, args: string): string {
  // Strip the leading slash if present
  const cleanCommand = command.startsWith("/") ? command.slice(1) : command

  // The ii-spec commands use the "specify" CLI
  // Commands like "speckit.specify" become "specify specify <args>"
  // Commands like "speckit.plan" become "specify plan <args>"
  // Commands like "speckit.clarify" become "specify clarify <args>"

  // Extract the actual command from speckit.xxx format
  const parts = cleanCommand.split(".")
  if (parts.length !== 2 || parts[0] !== "speckit") {
    // If not in speckit.xxx format, just run as-is
    return args ? `${cleanCommand} ${args}` : cleanCommand
  }

  const specifyCommand = parts[1] // e.g., "specify", "plan", "clarify", "tasks"

  // Special handling for initialization
  if (specifyCommand === "init") {
    return `specify init . --ai claude`
  }

  // Build the specify command
  const escapedArgs = args ? escapeShellArg(args) : ""
  return escapedArgs
    ? `specify ${specifyCommand} ${escapedArgs}`
    : `specify ${specifyCommand}`
}

/**
 * Escape a string for safe shell usage
 *
 * @param arg - The argument to escape
 * @returns The escaped argument
 */
function escapeShellArg(arg: string): string {
  // For simple alphanumeric strings, no escaping needed
  if (/^[a-zA-Z0-9_\-./]+$/.test(arg)) {
    return arg
  }
  // Wrap in single quotes and escape any single quotes within
  return `'${arg.replace(/'/g, "'\\''")}'`
}

/**
 * Get the event emitter for a running command
 *
 * @param executionId - The execution ID returned by executeCommand
 * @returns The EventEmitter or null if not found
 */
export function getExecutionEmitter(executionId: string): EventEmitter | null {
  const execution = executions.get(executionId)
  return execution?.emitter ?? null
}

/**
 * Cancel a running command execution
 *
 * @param executionId - The execution ID to cancel
 * @returns True if the command was found and killed, false otherwise
 */
export function cancelExecution(executionId: string): boolean {
  const execution = executions.get(executionId)
  if (!execution) {
    return false
  }

  // Try to kill the process
  const killed = execution.process.kill("SIGTERM")

  // If SIGTERM doesn't work after a short delay, try SIGKILL
  if (killed) {
    setTimeout(() => {
      if (executions.has(executionId)) {
        execution.process.kill("SIGKILL")
      }
    }, 1000)
  }

  // Emit done event with signal
  execution.emitter.emit("done", { code: null, signal: "SIGTERM" } satisfies CommandDoneEvent)

  // Clean up
  executions.delete(executionId)

  return killed
}

/**
 * Get information about a running execution
 *
 * @param executionId - The execution ID
 * @returns Execution info or null if not found
 */
export function getExecutionInfo(
  executionId: string
): { projectPath: string; command: string; startedAt: Date } | null {
  const execution = executions.get(executionId)
  if (!execution) return null

  return {
    projectPath: execution.projectPath,
    command: execution.command,
    startedAt: execution.startedAt,
  }
}

/**
 * Check if an execution is still running
 *
 * @param executionId - The execution ID
 * @returns True if running, false otherwise
 */
export function isExecutionRunning(executionId: string): boolean {
  return executions.has(executionId)
}

/**
 * Get all running execution IDs
 *
 * @returns Array of execution IDs
 */
export function getRunningExecutions(): string[] {
  return Array.from(executions.keys())
}
