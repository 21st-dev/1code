import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import path from "node:path"
import { createInterface } from "node:readline"
import {
  assessCodexAppServerPluginProtocol,
  type CodexAppServerPluginProtocolObservation,
  type CodexAppServerProtocolLikeResponse,
  extractAcceptedCodexAppServerClientMethods,
  summarizeCodexAppServerPluginProtocolResponse,
  summarizeCodexAppServerThreadStartResponse,
} from "../src/main/lib/codex/app-server-plugin-proof"

interface ProbeOptions {
  codexPath: string
  codexHome: string
  timeoutMs: number
  includeThreadStart: boolean
  threadStartDisabledPluginId?: string
  outPath?: string
  tempCodexHome?: string
}

interface PendingRequest {
  resolve: (response: CodexAppServerProtocolLikeResponse) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

interface RawAppServerMessage {
  id?: string | number
  method?: string
  params?: unknown
  result?: unknown
  error?: {
    message?: string
  }
}

function readOptionalArg(name: string): string | undefined {
  const prefix = `--${name}=`
  const found = process.argv.find((arg) => arg.startsWith(prefix))
  return found ? found.slice(prefix.length) : undefined
}

function readBooleanArg(name: string, fallback = false): boolean {
  const value = readOptionalArg(name)
  if (value === undefined) return fallback
  return value === "1" || value === "true" || value === "yes"
}

function defaultCodexPath(): string {
  const binaryName = process.platform === "win32" ? "codex.exe" : "codex"
  return path.join(
    process.cwd(),
    "resources",
    "bin",
    `${process.platform}-${process.arch}`,
    binaryName,
  )
}

function loadOptions(): ProbeOptions {
  const tempCodexHome = readBooleanArg("temp-codex-home", false)
    ? mkdtempSync(path.join(tmpdir(), "locus-codex-plugin-proof-"))
    : undefined
  const codexHome =
    readOptionalArg("codex-home") ??
    tempCodexHome ??
    process.env.CODEX_HOME ??
    path.join(homedir(), ".codex")

  return {
    codexPath: readOptionalArg("codex") ?? defaultCodexPath(),
    codexHome: path.resolve(codexHome),
    timeoutMs: Number(readOptionalArg("timeout-ms") ?? 5_000),
    includeThreadStart: readBooleanArg("include-thread-start", false),
    threadStartDisabledPluginId: readOptionalArg(
      "thread-start-disabled-plugin-id",
    ),
    outPath: readOptionalArg("out"),
    tempCodexHome,
  }
}

class CodexAppServerProbeClient {
  private nextId = 1
  private stderr = ""
  private readonly pending = new Map<string | number, PendingRequest>()
  private readonly notifications = new Set<string>()
  private readonly child: ChildProcessWithoutNullStreams
  private readonly lineReader: ReturnType<typeof createInterface>

  constructor(
    private readonly options: Pick<
      ProbeOptions,
      "codexPath" | "codexHome" | "timeoutMs"
    >,
  ) {
    this.child = spawn(
      options.codexPath,
      ["app-server", "--listen", "stdio://"],
      {
        env: {
          ...process.env,
          CODEX_HOME: options.codexHome,
        },
        stdio: "pipe",
      },
    )
    this.lineReader = createInterface({ input: this.child.stdout })
    this.lineReader.on("line", (line) => this.handleLine(line))
    this.child.stderr.on("data", (chunk) => {
      this.stderr += String(chunk)
    })
    this.child.once("exit", (code, signal) => {
      const message = `codex app-server exited before probe completed (code=${code}, signal=${signal})`
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer)
        pending.reject(new Error(this.stderr.trim() || message))
      }
      this.pending.clear()
    })
  }

  getNotifications(): string[] {
    return [...this.notifications].sort()
  }

  request(
    method: string,
    params: unknown = {},
  ): Promise<CodexAppServerProtocolLikeResponse> {
    const id = this.nextId++
    const promise = new Promise<CodexAppServerProtocolLikeResponse>(
      (resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(id)
          reject(new Error(`Timed out waiting for ${method}`))
        }, this.options.timeoutMs)
        this.pending.set(id, { resolve, reject, timer })
      },
    )
    this.write({ id, method, params })
    return promise
  }

  notify(method: string, params?: unknown): void {
    this.write({ method, ...(params === undefined ? {} : { params }) })
  }

  close(): void {
    this.lineReader.close()
    if (!this.child.killed) {
      this.child.kill()
    }
  }

  private handleLine(line: string): void {
    if (!line.trim()) return

    let message: RawAppServerMessage
    try {
      message = JSON.parse(line)
    } catch {
      return
    }

    if ("id" in message && ("result" in message || "error" in message)) {
      const id = message.id
      if (id === undefined) return
      const pending = this.pending.get(id)
      if (!pending) return
      this.pending.delete(id)
      clearTimeout(pending.timer)
      pending.resolve({ result: message.result, error: message.error })
      return
    }

    if (typeof message.method !== "string") return
    if ("id" in message && message.id !== undefined) {
      this.write({ id: message.id, result: {} })
      return
    }
    this.notifications.add(message.method)
  }

  private write(message: RawAppServerMessage): void {
    this.child.stdin.write(`${JSON.stringify(message)}\n`)
  }
}

function observationFor(
  method: string,
  response: CodexAppServerProtocolLikeResponse,
): CodexAppServerPluginProtocolObservation {
  const observation = summarizeCodexAppServerPluginProtocolResponse(
    method,
    response,
  )
  if (observation.errorMessage && observation.errorMessage.length > 1000) {
    return {
      ...observation,
      errorMessage: `${observation.errorMessage.slice(0, 1000)}...`,
    }
  }
  return observation
}

function buildThreadStartConfig(
  options: Pick<ProbeOptions, "threadStartDisabledPluginId">,
): Record<string, unknown> | null {
  if (!options.threadStartDisabledPluginId) return null
  return {
    [`plugins.${options.threadStartDisabledPluginId}.enabled`]: false,
  }
}

async function main(): Promise<void> {
  const options = loadOptions()
  const client = new CodexAppServerProbeClient(options)
  const observations: CodexAppServerPluginProtocolObservation[] = []
  let acceptedClientMethods: string[] = []
  let threadStart: ReturnType<
    typeof summarizeCodexAppServerThreadStartResponse
  > | null = null

  try {
    observations.push(
      observationFor(
        "initialize",
        await client.request("initialize", {
          clientInfo: {
            name: "locus-codex-plugin-proof-probe",
            version: "1.0.0",
          },
        }),
      ),
    )
    client.notify("initialized")

    for (const method of [
      "plugin/installed",
      "plugin/list",
      "skills/list",
      "hooks/list",
      "plugin/read",
    ]) {
      observations.push(observationFor(method, await client.request(method)))
    }

    const unknownMethod = "plugin/marketplace/list"
    const unknownMethodResponse = await client.request(unknownMethod)
    const unknownMethodObservation = observationFor(
      unknownMethod,
      unknownMethodResponse,
    )
    observations.push(unknownMethodObservation)
    acceptedClientMethods =
      unknownMethodResponse.error?.message === undefined
        ? []
        : extractAcceptedCodexAppServerClientMethods(
            unknownMethodResponse.error.message,
          )

    if (options.includeThreadStart) {
      const config = buildThreadStartConfig(options)
      const threadStartResponse = await client.request("thread/start", {
        model: null,
        modelProvider: null,
        cwd: process.cwd(),
        approvalPolicy: "untrusted",
        approvalsReviewer: "user",
        sandbox: "read-only",
        config,
        serviceName: "locus-codex-plugin-proof",
        ephemeral: true,
        sessionStartSource: "startup",
        threadSource: "user",
      })
      threadStart = summarizeCodexAppServerThreadStartResponse({
        response: threadStartResponse,
        config,
      })
    }

    const evidence = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      codexPath: options.codexPath,
      codexHome: options.codexHome,
      observations,
      ...(threadStart ? { threadStart } : {}),
      acceptedClientMethods,
      assessment: assessCodexAppServerPluginProtocol({
        observations,
        acceptedClientMethods,
      }),
      notifications: client.getNotifications(),
    }

    const output = `${JSON.stringify(evidence, null, 2)}\n`
    if (options.outPath) {
      mkdirSync(path.dirname(path.resolve(options.outPath)), {
        recursive: true,
      })
      writeFileSync(options.outPath, output)
    }
    process.stdout.write(output)
  } finally {
    client.close()
    if (options.tempCodexHome) {
      rmSync(options.tempCodexHome, { recursive: true, force: true })
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
