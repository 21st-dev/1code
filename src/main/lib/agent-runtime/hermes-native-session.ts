import { spawn } from "node:child_process"
import { resolveHermesRuntime } from "../hermes/runtime"
import type { AgentPermissionMode } from "./types"

export type HermesNativeBridgeAction = "resume" | "fork" | "rollback"

export type HermesNativeBridgeKind =
  | "hermes-cli-resume"
  | "hermes-acp-session-control"

export type HermesNativeBridgeMode =
  | "headless-cli"
  | "moss-owned-session-control"

export type HermesNativePromptSource = "argument" | "none"

export type HermesNativeSessionStrategy =
  | "resume-cli-session"
  | "reuse-session-with-moss-fork-boundary"
  | "reuse-session-with-moss-rollback-boundary"

export interface HermesNativeSessionBridgePlan {
  engine: "hermes"
  action: HermesNativeBridgeAction
  bridge: HermesNativeBridgeKind
  mode: HermesNativeBridgeMode
  nativeSessionStrategy: HermesNativeSessionStrategy
  command: string
  args: string[]
  cwd: string
  sessionId: string
  modelId?: string
  permissionMode: AgentPermissionMode
  promptSource: HermesNativePromptSource
  canRunHeadless: boolean
  mossOwnedControl: true
  targetMessageId?: string
  targetSdkMessageUuid?: string
  notes: string[]
}

export interface BuildHermesNativeSessionBridgePlanInput {
  action: HermesNativeBridgeAction
  sessionId?: string | null
  cwd: string
  modelId?: string | null
  permissionMode?: AgentPermissionMode | null
  prompt?: string | null
  promptSource?: HermesNativePromptSource
  command?: string | null
  targetMessageId?: string | null
  targetSdkMessageUuid?: string | null
}

export interface HermesNativeCommandRunnerInput {
  command: string
  args: string[]
  cwd: string
  stdin?: string
  env?: NodeJS.ProcessEnv
  abortSignal?: AbortSignal
}

export interface HermesNativeCommandRunnerResult {
  stdout: string
  stderr: string
  exitCode: number | null
}

export type HermesNativeCommandRunner = (
  input: HermesNativeCommandRunnerInput,
) => Promise<HermesNativeCommandRunnerResult>

export interface HermesCliResumeBridgeSummary {
  nativeSessionId?: string
  lastText?: string
  error?: string
}

export interface RunHermesCliResumeBridgeInput {
  sessionId: string
  cwd: string
  prompt: string
  modelId?: string | null
  permissionMode?: AgentPermissionMode | null
  command?: string | null
  runner?: HermesNativeCommandRunner
  env?: NodeJS.ProcessEnv
  abortSignal?: AbortSignal
}

export interface HermesCliResumeBridgeResult
  extends HermesNativeCommandRunnerResult,
    HermesCliResumeBridgeSummary {
  success: boolean
  plan: HermesNativeSessionBridgePlan
}

function cleanString(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function requireCleanString(
  value: string | null | undefined,
  label: string,
): string {
  const cleaned = cleanString(value)
  if (!cleaned) {
    throw new Error(`Hermes native ${label} is required.`)
  }
  return cleaned
}

export function buildHermesNativeSessionBridgePlan(
  input: BuildHermesNativeSessionBridgePlanInput,
): HermesNativeSessionBridgePlan {
  const command = cleanString(input.command) ??
    resolveHermesRuntime().executable ??
    "hermes"
  const cwd = requireCleanString(input.cwd, "working directory")
  const sessionId = requireCleanString(input.sessionId, "session id")
  const modelId = cleanString(input.modelId)
  const permissionMode = input.permissionMode ?? "agent"

  if (input.action === "resume") {
    const args = ["--resume", sessionId]
    const prompt = cleanString(input.prompt)
    if (modelId) {
      args.push("-m", modelId)
    }
    const promptSource =
      input.promptSource === "none" || !prompt ? "none" : "argument"
    if (promptSource === "argument" && prompt) {
      args.push("-z", prompt)
    }

    return {
      engine: "hermes",
      action: "resume",
      bridge: "hermes-cli-resume",
      mode: "headless-cli",
      nativeSessionStrategy: "resume-cli-session",
      command,
      args,
      cwd,
      sessionId,
      ...(modelId ? { modelId } : {}),
      permissionMode,
      promptSource,
      canRunHeadless: true,
      mossOwnedControl: true,
      notes: [
        "Hermes exposes native resume through hermes --resume <session>.",
        "When a prompt is supplied, Moss can run a one-shot resume with -z; otherwise the plan records a resume-ready native session.",
      ],
    }
  }

  const isFork = input.action === "fork"
  const targetMessageId = cleanString(input.targetMessageId)
  const targetSdkMessageUuid = cleanString(input.targetSdkMessageUuid)

  return {
    engine: "hermes",
    action: input.action,
    bridge: "hermes-acp-session-control",
    mode: "moss-owned-session-control",
    nativeSessionStrategy: isFork
      ? "reuse-session-with-moss-fork-boundary"
      : "reuse-session-with-moss-rollback-boundary",
    command,
    args: [],
    cwd,
    sessionId,
    ...(modelId ? { modelId } : {}),
    permissionMode,
    promptSource: "none",
    canRunHeadless: true,
    mossOwnedControl: true,
    ...(targetMessageId ? { targetMessageId } : {}),
    ...(targetSdkMessageUuid ? { targetSdkMessageUuid } : {}),
    notes: [
      "The live Hermes CLI does not expose separate fork or rollback commands.",
      "Moss keeps the Hermes native session linked and records the fork/rollback boundary in the Moss-owned session-control layer instead of creating a second real config.",
    ],
  }
}

export function spawnHermesNativeCommand(
  input: HermesNativeCommandRunnerInput,
): Promise<HermesNativeCommandRunnerResult> {
  return new Promise((resolve, reject) => {
    if (input.abortSignal?.aborted) {
      reject(new Error("Hermes native command aborted."))
      return
    }

    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: input.env ? { ...process.env, ...input.env } : process.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    })

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let forceKillTimer: ReturnType<typeof setTimeout> | null = null
    let didClose = false

    const abortChild = () => {
      if (didClose) return
      child.kill("SIGTERM")
      forceKillTimer =
        forceKillTimer ??
        setTimeout(() => {
          if (!didClose) child.kill("SIGKILL")
        }, 2000)
    }

    input.abortSignal?.addEventListener("abort", abortChild, { once: true })

    child.stdout?.on("data", (chunk) => {
      stdoutChunks.push(
        Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)),
      )
    })
    child.stderr?.on("data", (chunk) => {
      stderrChunks.push(
        Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)),
      )
    })
    child.stdin?.on("error", () => {
      // Hermes may exit before stdin is fully written on fast failures.
    })
    child.on("error", reject)
    child.on("close", (exitCode) => {
      didClose = true
      if (forceKillTimer) clearTimeout(forceKillTimer)
      input.abortSignal?.removeEventListener("abort", abortChild)
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        exitCode,
      })
    })

    if (typeof input.stdin === "string") {
      child.stdin?.write(input.stdin)
    }
    child.stdin?.end()
  })
}

export async function runHermesCliResumeBridge(
  input: RunHermesCliResumeBridgeInput,
): Promise<HermesCliResumeBridgeResult> {
  const prompt = requireCleanString(input.prompt, "resume prompt")
  const plan = buildHermesNativeSessionBridgePlan({
    action: "resume",
    sessionId: input.sessionId,
    cwd: input.cwd,
    modelId: input.modelId,
    permissionMode: input.permissionMode,
    command: input.command,
    prompt,
    promptSource: "argument",
  })
  const runner = input.runner ?? spawnHermesNativeCommand
  const result = await runner({
    command: plan.command,
    args: plan.args,
    cwd: plan.cwd,
    env: input.env,
    abortSignal: input.abortSignal,
  })
  const stdout = cleanString(result.stdout)
  const stderr = cleanString(result.stderr)
  const error = detectHermesCliError({
    exitCode: result.exitCode,
    stdout,
    stderr,
  })

  return {
    ...result,
    plan,
    nativeSessionId: plan.sessionId,
    ...(stdout ? { lastText: stdout } : {}),
    ...(error ? { error } : {}),
    success: result.exitCode === 0 && !error,
  }
}

function detectHermesCliError(input: {
  exitCode: number | null
  stdout?: string
  stderr?: string
}): string | undefined {
  if (input.exitCode !== 0) {
    return input.stderr ?? input.stdout ?? `Hermes exited with ${input.exitCode}.`
  }

  const text = input.stderr ?? input.stdout
  if (text && /^API call failed after \d+ retries:/i.test(text)) {
    return text
  }

  return undefined
}
