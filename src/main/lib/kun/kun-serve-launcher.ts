import {
  type ChildProcessWithoutNullStreams,
  type SpawnOptions,
  spawn,
} from "node:child_process"
import { randomBytes } from "node:crypto"
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { redactRuntimePayload } from "../agent-runtime/redaction"
import { getElectronUserDataPath } from "../electron-app"

const KUN_READY_PREFIX = "KUN_READY "
const KUN_SERVE_READY_TIMEOUT_MS = 10_000

export type KunServeReadyInfo = {
  service: "kun"
  mode: "serve"
  host: string
  port: number
  configPath?: string
  dataDir?: string
  model?: string
  approvalPolicy: string
  sandboxMode: string
  insecure: boolean
  startedAt?: string
  pid?: number
  message?: string
}

export type KunServeLaunchInput = {
  executable: string
  runId: string
  cwd: string
  configPath?: string | null
  secretHints?: readonly string[]
  env?: NodeJS.ProcessEnv
  userDataPath?: string
  spawnProcess?: (
    command: string,
    args: string[],
    options: SpawnOptions,
  ) => ChildProcessWithoutNullStreams
  readyTimeoutMs?: number
}

export type KunServeHandle = {
  baseUrl: string
  runtimeToken: string
  ready: KunServeReadyInfo
  child: ChildProcessWithoutNullStreams
  close: () => Promise<void>
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase()
  return (
    normalized === "127.0.0.1" ||
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "[::1]"
  )
}

function parseKunReadyLine(line: string): KunServeReadyInfo | null {
  if (!line.startsWith(KUN_READY_PREFIX)) return null
  const payload = line.slice(KUN_READY_PREFIX.length)
  const parsed = JSON.parse(payload) as Record<string, unknown>
  return {
    service: parsed.service === "kun" ? "kun" : (parsed.service as "kun"),
    mode: parsed.mode === "serve" ? "serve" : (parsed.mode as "serve"),
    host: typeof parsed.host === "string" ? parsed.host : "",
    port: typeof parsed.port === "number" ? parsed.port : Number(parsed.port),
    configPath:
      typeof parsed.configPath === "string" ? parsed.configPath : undefined,
    dataDir: typeof parsed.dataDir === "string" ? parsed.dataDir : undefined,
    model: typeof parsed.model === "string" ? parsed.model : undefined,
    approvalPolicy:
      typeof parsed.approvalPolicy === "string" ? parsed.approvalPolicy : "",
    sandboxMode:
      typeof parsed.sandboxMode === "string" ? parsed.sandboxMode : "",
    insecure: parsed.insecure === true,
    startedAt:
      typeof parsed.startedAt === "string" ? parsed.startedAt : undefined,
    pid: typeof parsed.pid === "number" ? parsed.pid : undefined,
    message: typeof parsed.message === "string" ? parsed.message : undefined,
  }
}

export function verifyKunReadyInfo(info: KunServeReadyInfo): void {
  if (info.service !== "kun" || info.mode !== "serve") {
    throw new Error("Kun serve handshake did not identify a Kun serve runtime.")
  }
  if (!isLoopbackHost(info.host)) {
    throw new Error(`Kun serve reported a non-loopback host: ${info.host}`)
  }
  if (!Number.isInteger(info.port) || info.port <= 0 || info.port > 65_535) {
    throw new Error(`Kun serve reported an invalid port: ${info.port}`)
  }
  if (info.insecure) {
    throw new Error("Kun serve reported insecure=true.")
  }
  if (info.approvalPolicy !== "on-request") {
    throw new Error(
      `Kun serve reported unsupported approvalPolicy=${info.approvalPolicy}.`,
    )
  }
  if (info.sandboxMode !== "workspace-write") {
    throw new Error(
      `Kun serve reported unsupported sandboxMode=${info.sandboxMode}.`,
    )
  }
}

function createKunRuntimeToken(): string {
  return randomBytes(32).toString("hex")
}

const KUN_SAFE_ENV_KEYS = new Set([
  "COMSPEC",
  "HOME",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "PATH",
  "PATHEXT",
  "SystemRoot",
  "TEMP",
  "TMP",
  "TMPDIR",
  "USER",
])

function isSafeKunEnvKey(key: string): boolean {
  if (key.startsWith("KUN_")) return false
  return KUN_SAFE_ENV_KEYS.has(key)
}

function createKunServeEnv(input: {
  sourceEnv: NodeJS.ProcessEnv
  runtimeToken: string
  dataDir: string
}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(input.sourceEnv)) {
    if (value === undefined || !isSafeKunEnvKey(key)) continue
    env[key] = value
  }
  env.KUN_RUNTIME_TOKEN = input.runtimeToken
  env.KUN_DATA_DIR = input.dataDir
  return env
}

function redactKunServeDiagnostic(
  value: string,
  secretHints: readonly string[],
): string {
  const redacted = redactRuntimePayload(value, {
    runtimeId: "kun",
    runId: "kun-serve-launch",
    source: "runtime-diagnostic",
    secretHints,
  }).payload
  return typeof redacted === "string" ? redacted : "Kun serve failed."
}

function createKunDataDir(input: {
  userDataPath?: string
  runId: string
}): string {
  const root = input.userDataPath ?? getElectronUserDataPath()
  const dataDir = join(root, "kun-sessions", input.runId)
  mkdirSync(dataDir, { recursive: true, mode: 0o700 })
  return dataDir
}

async function closeChild(
  child: ChildProcessWithoutNullStreams,
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL")
      } catch {
        // ignore
      }
      resolve()
    }, 3000)
    child.once("exit", () => {
      clearTimeout(timer)
      resolve()
    })
    try {
      child.kill("SIGTERM")
    } catch {
      clearTimeout(timer)
      resolve()
    }
  })
}

export async function launchKunServe(
  input: KunServeLaunchInput,
): Promise<KunServeHandle> {
  const runtimeToken = createKunRuntimeToken()
  const dataDir = createKunDataDir({
    userDataPath: input.userDataPath,
    runId: input.runId,
  })
  const args = [
    "serve",
    ...(input.configPath ? ["--config", input.configPath] : []),
    "--host",
    "127.0.0.1",
    "--port",
    "0",
    "--data-dir",
    dataDir,
    "--approval-policy",
    "on-request",
    "--sandbox-mode",
    "workspace-write",
    "--insecure",
    "false",
  ]
  const env = createKunServeEnv({
    sourceEnv: input.env ?? process.env,
    runtimeToken,
    dataDir,
  })
  const spawnProcess: NonNullable<KunServeLaunchInput["spawnProcess"]> =
    input.spawnProcess ??
    ((command, args, options) =>
      spawn(command, args, options) as ChildProcessWithoutNullStreams)
  const child = spawnProcess(input.executable, args, {
    cwd: input.cwd,
    env,
    shell: false,
    windowsHide: true,
    stdio: "pipe",
  })

  let stdoutBuffer = ""
  let stderrTail = ""
  const ready = await new Promise<KunServeReadyInfo>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      void closeChild(child)
      reject(new Error("Timed out waiting for Kun KUN_READY handshake."))
    }, input.readyTimeoutMs ?? KUN_SERVE_READY_TIMEOUT_MS)

    const cleanup = () => {
      clearTimeout(timeout)
      child.stdout.off("data", onStdout)
      child.stderr.off("data", onStderr)
      child.off("exit", onExit)
      child.off("error", onError)
    }
    const rejectWith = (error: Error) => {
      cleanup()
      void closeChild(child)
      reject(error)
    }
    const onStdout = (chunk: Buffer) => {
      stdoutBuffer += chunk.toString("utf8")
      let newlineIndex = stdoutBuffer.indexOf("\n")
      while (newlineIndex >= 0) {
        const line = stdoutBuffer.slice(0, newlineIndex).trimEnd()
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1)
        try {
          const parsed = parseKunReadyLine(line)
          if (parsed) {
            verifyKunReadyInfo(parsed)
            cleanup()
            resolve(parsed)
            return
          }
        } catch (error) {
          rejectWith(error instanceof Error ? error : new Error(String(error)))
          return
        }
        newlineIndex = stdoutBuffer.indexOf("\n")
      }
    }
    const onStderr = (chunk: Buffer) => {
      stderrTail = `${stderrTail}${chunk.toString("utf8")}`.slice(-4000)
    }
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup()
      const stderr = redactKunServeDiagnostic(stderrTail.trim(), [
        runtimeToken,
        ...(input.secretHints ?? []),
        ...(Object.values(env).filter(
          (value): value is string =>
            typeof value === "string" &&
            value.length >= 8 &&
            (value.startsWith("sk-") || value.includes("token")),
        ) ?? []),
      ])
      reject(
        new Error(
          `Kun serve exited before ready: code=${code ?? "null"} signal=${signal ?? "null"} ${stderr}`,
        ),
      )
    }
    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }
    child.stdout.on("data", onStdout)
    child.stderr.on("data", onStderr)
    child.once("exit", onExit)
    child.once("error", onError)
  })

  return {
    baseUrl: `http://${ready.host}:${ready.port}`,
    runtimeToken,
    ready,
    child,
    close: () => closeChild(child),
  }
}

export const KUN_SERVE_TEST_ONLY = {
  KUN_READY_PREFIX,
  parseKunReadyLine,
  createKunServeEnv,
}
