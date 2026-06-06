import { spawn, type ChildProcess } from "node:child_process"
import { homedir } from "node:os"

const ANSI_ESCAPE_REGEX = /\u001B\[[0-?]*[ -/]*[@-~]/g
const ANSI_OSC_REGEX = /\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g
const DEFAULT_CODEX_ACP_SPAWN_PROBE_TIMEOUT_MS = 5_000

export type CodexAcpSpawnProbeStatus = {
  ok: boolean
  exitCode: number | null
  signal: string | null
  error: string | null
  stdoutPreview: string
  stderrPreview: string
  durationMs: number
}

export function stripCodexAnsi(input: string): string {
  return input.replace(ANSI_OSC_REGEX, "").replace(ANSI_ESCAPE_REGEX, "")
}

export function previewCodexProcessOutput(output: string): string {
  return stripCodexAnsi(output).replace(/\s+/g, " ").trim().slice(0, 240)
}

export async function probeCodexAcpSpawn(
  acpPath: string | null,
  options: { timeoutMs?: number; cwd?: string } = {},
): Promise<CodexAcpSpawnProbeStatus> {
  const startedAt = Date.now()

  if (!acpPath) {
    return {
      ok: false,
      exitCode: null,
      signal: null,
      error: "Codex ACP runtime path could not be resolved.",
      stdoutPreview: "",
      stderrPreview: "",
      durationMs: Date.now() - startedAt,
    }
  }

  const timeoutMs =
    options.timeoutMs ?? DEFAULT_CODEX_ACP_SPAWN_PROBE_TIMEOUT_MS

  return await new Promise((resolvePromise) => {
    let child: ChildProcess | null = null
    let timeout: ReturnType<typeof setTimeout> | null = null
    let stdout = ""
    let stderr = ""
    let settled = false

    const appendOutput = (current: string, chunk: Buffer | string): string =>
      `${current}${chunk.toString()}`.slice(-8_000)

    const finish = (
      status: Omit<CodexAcpSpawnProbeStatus, "durationMs">,
    ) => {
      if (settled) return
      settled = true
      if (timeout) {
        clearTimeout(timeout)
      }
      resolvePromise({
        ...status,
        durationMs: Date.now() - startedAt,
      })
    }

    try {
      child = spawn(acpPath, ["--help"], {
        stdio: ["ignore", "pipe", "pipe"],
        cwd: options.cwd ?? homedir(),
      })
    } catch (error) {
      finish({
        ok: false,
        exitCode: null,
        signal: null,
        error:
          error instanceof Error
            ? error.message
            : "Codex ACP spawn probe failed before process start.",
        stdoutPreview: "",
        stderrPreview: "",
      })
      return
    }

    timeout = setTimeout(() => {
      try {
        child?.kill("SIGTERM")
      } catch {}
      finish({
        ok: false,
        exitCode: null,
        signal: "timeout",
        error: `codex-acp --help timed out after ${timeoutMs}ms.`,
        stdoutPreview: previewCodexProcessOutput(stdout),
        stderrPreview: previewCodexProcessOutput(stderr),
      })
    }, timeoutMs)

    child.stdout?.on("data", (chunk) => {
      stdout = appendOutput(stdout, chunk)
    })
    child.stderr?.on("data", (chunk) => {
      stderr = appendOutput(stderr, chunk)
    })
    child.once("error", (error) => {
      finish({
        ok: false,
        exitCode: null,
        signal: null,
        error: error.message,
        stdoutPreview: previewCodexProcessOutput(stdout),
        stderrPreview: previewCodexProcessOutput(stderr),
      })
    })
    child.once("close", (exitCode, signal) => {
      finish({
        ok: exitCode === 0,
        exitCode,
        signal,
        error:
          exitCode === 0
            ? null
            : `codex-acp --help exited with code ${exitCode ?? "null"}${
                signal ? ` and signal ${signal}` : ""
              }.`,
        stdoutPreview: previewCodexProcessOutput(stdout),
        stderrPreview: previewCodexProcessOutput(stderr),
      })
    })
  })
}
