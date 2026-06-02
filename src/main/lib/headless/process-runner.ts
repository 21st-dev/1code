import { spawn, type ChildProcess } from "node:child_process"
import { basename } from "node:path"
import type {
  AgentRuntimeObserver,
  AgentRuntimeRunRequest,
  AgentRuntimeRunResult,
} from "./agent-runtime-contract"

export type ProcessAgentTaskInput = {
  request: AgentRuntimeRunRequest
  observer: AgentRuntimeObserver
  executable: string
  args: string[]
  stdin?: string | null
  env?: NodeJS.ProcessEnv
  stderrFilter?: (text: string) => string
  label: string
}

function sanitizeArgs(args: string[]): string[] {
  return args.map((arg) => {
    if (/sk-[A-Za-z0-9_-]{20,}/.test(arg)) return "[redacted]"
    if (/bearer\s+[A-Za-z0-9._-]+/i.test(arg)) return "Bearer [redacted]"
    return arg.length > 240 ? `${arg.slice(0, 237)}...` : arg
  })
}

function killChild(child: ChildProcess): void {
  if (child.killed) return
  try {
    child.kill("SIGTERM")
  } catch {}
  setTimeout(() => {
    if (child.killed) return
    try {
      child.kill("SIGKILL")
    } catch {}
  }, 5000).unref()
}

function classifyProcessFailure(input: {
  label: string
  stdout: string
  stderr: string
  exitCode: number | null
  signal: NodeJS.Signals | null
}): Pick<AgentRuntimeRunResult, "errorCode" | "errorMessage"> {
  const combined = `${input.stdout}\n${input.stderr}`
  if (/not logged in|please run\s+\/login|authentication failed|invalid api key/i.test(combined)) {
    return {
      errorCode: "runtime_auth_required",
      errorMessage: `${input.label} authentication is required.`,
    }
  }

  return {
    errorCode: "runtime_process_failed",
    errorMessage: `${input.label} exited with code ${input.exitCode ?? "null"}${
      input.signal ? ` and signal ${input.signal}` : ""
    }.`,
  }
}

export async function runProcessAgentTask(
  input: ProcessAgentTaskInput,
): Promise<AgentRuntimeRunResult> {
  const { request, observer } = input
  observer.appendEvent("command_started", {
    label: input.label,
    executable: basename(input.executable),
    args: sanitizeArgs(input.args),
    cwd: request.cwd,
  })

  return await new Promise<AgentRuntimeRunResult>((resolve) => {
    let child: ChildProcess | null = null
    let stdout = ""
    let stderr = ""
    let settled = false

    const finish = (result: AgentRuntimeRunResult) => {
      if (settled) return
      settled = true
      clearInterval(heartbeatInterval)
      observer.appendEvent("command_finished", {
        label: input.label,
        exitCode: result.exitCode ?? null,
        status: result.status ?? null,
      })
      resolve(result)
    }

    const heartbeatInterval = setInterval(() => {
      try {
        observer.heartbeat()
        if (observer.isCancelRequested()) {
          if (child) killChild(child)
        }
      } catch (error) {
        observer.appendEvent("error", {
          errorCode: "heartbeat_failed",
          errorMessage: error instanceof Error ? error.message : String(error),
        })
        if (child) killChild(child)
      }
    }, 1000)
    heartbeatInterval.unref()

    try {
      const hasStdin = input.stdin !== undefined && input.stdin !== null
      child = spawn(input.executable, input.args, {
        cwd: request.cwd,
        env: input.env ?? process.env,
        stdio: [hasStdin ? "pipe" : "ignore", "pipe", "pipe"],
        windowsHide: true,
      })
    } catch (error) {
      finish({
        status: "failed",
        exitCode: 1,
        errorCode: "spawn_failed",
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      return
    }
    if (!child) return

    request.signal.addEventListener("abort", () => {
      if (child) killChild(child)
    }, {
      once: true,
    })

    if (input.stdin !== undefined && input.stdin !== null) {
      child.stdin?.end(input.stdin)
    }

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8")
      stdout += text
      observer.appendEvent("assistant_delta", { text })
    })

    child.stderr?.on("data", (chunk: Buffer) => {
      const rawText = chunk.toString("utf-8")
      const text = input.stderrFilter ? input.stderrFilter(rawText) : rawText
      if (!text) return
      stderr += text
      observer.appendEvent("command_output", { stream: "stderr", text })
    })

    child.once("error", (error) => {
      finish({
        status: request.signal.aborted ? "canceled" : "failed",
        exitCode: request.signal.aborted ? 130 : 1,
        errorCode: request.signal.aborted ? "job_canceled" : "process_error",
        errorMessage: request.signal.aborted ? "Job was canceled." : error.message,
        result: { stdout: stdout.trim(), stderr: stderr.trim() },
      })
    })

    child.once("close", (exitCode, signal) => {
      if (request.signal.aborted || observer.isCancelRequested()) {
        finish({
          status: "canceled",
          exitCode: exitCode ?? 130,
          errorCode: "job_canceled",
          errorMessage: "Job was canceled.",
          result: { stdout: stdout.trim(), stderr: stderr.trim(), signal },
        })
        return
      }

      const success = exitCode === 0
      const failure = success
        ? { errorCode: null, errorMessage: null }
        : classifyProcessFailure({
            label: input.label,
            stdout,
            stderr,
            exitCode,
            signal,
          })
      finish({
        status: success ? "succeeded" : "failed",
        exitCode: exitCode ?? 1,
        errorCode: failure.errorCode,
        errorMessage: failure.errorMessage,
        result: {
          finalMessage: stdout.trim(),
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          signal,
        },
      })
    })
  })
}
