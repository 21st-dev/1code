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
  cancelling?: boolean
  killTimer?: NodeJS.Timeout
}

// Active command executions
const executions = new Map<string, CommandExecution>()

/**
 * Build safe environment for subprocess.
 * Only includes whitelisted variables to prevent leakage.
 *
 * This function creates a minimal environment with only the variables
 * necessary for the specify CLI to function properly. This prevents
 * accidental leakage of sensitive environment variables.
 *
 * @returns Environment variables object
 */
function buildSafeEnvironment(): Record<string, string> {
  const safeEnv: Record<string, string> = {
    // Required for specify CLI
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",

    // Terminal configuration
    FORCE_COLOR: "1",
    TERM: process.env.TERM || "xterm-256color",

    // Path (needed to find commands)
    PATH: process.env.PATH || "",

    // Home directory (needed for config files)
    HOME: process.env.HOME || process.env.USERPROFILE || "",

    // User info (needed by git)
    USER: process.env.USER || "",

    // Platform-specific (Windows)
    ...(process.platform === "win32" ? {
      USERPROFILE: process.env.USERPROFILE || "",
      APPDATA: process.env.APPDATA || "",
    } : {}),
  }

  // Remove empty values
  return Object.fromEntries(
    Object.entries(safeEnv).filter(([_, v]) => v !== "")
  )
}

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

  // SECURITY FIX: Build command array instead of string to prevent injection
  // No longer uses shell=true, which prevents command injection attacks
  const [cmd, cmdArgs] = buildCommandArray(command, args)

  // SECURITY FIX: Spawn WITHOUT shell - prevents command injection
  // Using shell: false means special characters in args are treated as literals
  const proc = spawn(cmd, cmdArgs, {
    cwd: projectPath,
    shell: false,  // CRITICAL: No shell = No injection
    env: buildSafeEnvironment(),  // SECURITY FIX: Whitelist environment variables
  })

  // Store execution
  const execution: CommandExecution = {
    id: executionId,
    process: proc,
    emitter,
    projectPath,
    command,
    startedAt: new Date(),
  }
  executions.set(executionId, execution)

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

    // Clear kill timer if set
    if (execution.killTimer) {
      clearTimeout(execution.killTimer)
    }

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
 * SECURITY FIX: Build command array for safe execution without shell.
 * Returns [command, args[]] to be used with spawn(cmd, args, { shell: false })
 *
 * This replaces the old buildCommandString() which used shell=true and was
 * vulnerable to command injection attacks.
 *
 * @param command - The command to execute (e.g., "speckit.specify")
 * @param args - The arguments string
 * @returns Tuple of [command, arguments array]
 */
function buildCommandArray(command: string, args: string): [string, string[]] {
  const cleanCommand = command.startsWith("/") ? command.slice(1) : command
  const parts = cleanCommand.split(".")

  if (parts.length !== 2 || parts[0] !== "speckit") {
    // Non-SpecKit command: validate it's allowed
    throw new Error(`Invalid command format: ${command}. Only 'speckit.*' commands are allowed.`)
  }

  const specifyCommand = parts[1]

  // Special handling for initialization
  if (specifyCommand === "init") {
    return ["specify", ["init", ".", "--ai", "claude"]]
  }

  // Parse args string into proper arguments
  const argArray = args ? parseCommandArgs(args) : []
  return ["specify", [specifyCommand, ...argArray]]
}

/**
 * Parse command arguments string into array.
 * Handles quoted strings properly.
 *
 * @param argsString - The arguments as a string
 * @returns Array of arguments
 */
function parseCommandArgs(argsString: string): string[] {
  // Simple argument parser - handles quoted strings
  const args: string[] = []
  const regex = /"([^"]+)"|'([^']+)'|(\S+)/g
  let match
  while ((match = regex.exec(argsString)) !== null) {
    args.push(match[1] || match[2] || match[3])
  }
  return args
}

// OLD CODE (kept for reference - can be removed after testing):
// /**
//  * Build the actual command string to execute
//  *
//  * Transforms the command format (e.g., "/speckit.specify") into
//  * the actual CLI command.
//  *
//  * @param command - The command (e.g., "/speckit.specify")
//  * @param args - The arguments string
//  * @returns The full command string to execute
//  */
// function buildCommandString(command: string, args: string): string {
//   const cleanCommand = command.startsWith("/") ? command.slice(1) : command
//   const parts = cleanCommand.split(".")
//   if (parts.length !== 2 || parts[0] !== "speckit") {
//     return args ? `${cleanCommand} ${args}` : cleanCommand
//   }
//   const specifyCommand = parts[1]
//   if (specifyCommand === "init") {
//     return `specify init . --ai claude`
//   }
//   const escapedArgs = args ? escapeShellArg(args) : ""
//   return escapedArgs
//     ? `specify ${specifyCommand} ${escapedArgs}`
//     : `specify ${specifyCommand}`
// }
//
// /**
//  * Escape a string for safe shell usage
//  *
//  * @param arg - The argument to escape
//  * @returns The escaped argument
//  */
// function escapeShellArg(arg: string): string {
//   if (/^[a-zA-Z0-9_\-./]+$/.test(arg)) {
//     return arg
//   }
//   return `'${arg.replace(/'/g, "'\\''")}'`
// }

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
 * SECURITY FIX: Properly handle race conditions during cancellation.
 * - Marks execution as cancelling to prevent double-cancel
 * - Waits for actual process exit before emitting done event
 * - Schedules SIGKILL if SIGTERM doesn't work within 1 second
 *
 * @param executionId - The execution ID to cancel
 * @returns True if the command was found and killed, false otherwise
 */
export function cancelExecution(executionId: string): boolean {
  const execution = executions.get(executionId)
  if (!execution) {
    return false
  }

  // Mark as cancelling to prevent double-cancel
  if (execution.cancelling) {
    return true
  }
  execution.cancelling = true

  // Try to kill gracefully
  const killed = execution.process.kill("SIGTERM")

  if (!killed) {
    // Process already dead or kill failed
    executions.delete(executionId)
    return false
  }

  // Schedule forceful kill if process doesn't exit
  const killTimer = setTimeout(() => {
    // Check if process still exists
    if (executions.has(executionId)) {
      const exec = executions.get(executionId)
      if (exec && !exec.process.killed) {
        console.warn(`[CommandExecutor] Process ${executionId} didn't respond to SIGTERM, sending SIGKILL`)
        exec.process.kill("SIGKILL")
      }
    }
  }, 1000)

  // Store timer reference for cleanup
  execution.killTimer = killTimer

  // Don't emit done yet - wait for actual process exit
  // The 'close' event handler will emit done
  return true
}

// OLD CODE (kept for reference - can be removed after testing):
// export function cancelExecution(executionId: string): boolean {
//   const execution = executions.get(executionId)
//   if (!execution) {
//     return false
//   }
//   const killed = execution.process.kill("SIGTERM")
//   if (killed) {
//     setTimeout(() => {
//       if (executions.has(executionId)) {
//         execution.process.kill("SIGKILL")
//       }
//     }, 1000)
//   }
//   execution.emitter.emit("done", { code: null, signal: "SIGTERM" } satisfies CommandDoneEvent)
//   executions.delete(executionId)
//   return killed
// }

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
