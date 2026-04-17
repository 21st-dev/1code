import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
import { resolve, join } from "node:path"
import { createInterface } from "node:readline"
import {
  getOpenCodexBackendProviderFamily,
  openCodexBackendRouteRequiresHost,
  type OpenCodexBackendRoute,
} from "../../../shared/opencodex-backend-route"
import {
  readOpenCodexBackendConfig,
  type OpenCodexBackendConfigRecord,
} from "./backend-config"
import { resolveOpenCodexDataPaths } from "./preflight"

export interface OpenCodexBackendHostPaths {
  rootDir: string
  configDir: string
  dataDir: string
  logsDir: string
}

export interface OpenCodexBackendHostLaunchSpec {
  command: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
  inlineScript: string
}

export interface OpenCodexBackendHostState {
  status: "stopped" | "starting" | "ready" | "error"
  pid: number | null
  startedAt: string | null
  lastError: string | null
  lastEventType: string | null
}

function jsonLiteral(value: unknown): string {
  return JSON.stringify(value)
}

function buildBackendOnlyScript({
  openharnessSrcPath,
  route,
  workspacePath,
}: {
  openharnessSrcPath: string
  route: OpenCodexBackendRoute
  workspacePath: string
}): string {
  const providerFamily = getOpenCodexBackendProviderFamily(route)
  if (!providerFamily || route.kind === "codex-subscription" || route.kind === "claude-subscription") {
    throw new Error(`OpenCodex backend host launch is not materialized for route kind ${route.kind}`)
  }

  const apiFormat = providerFamily === "anthropic-compatible" ? "anthropic" : "openai"

  return [
    "import asyncio",
    "import sys",
    `sys.path.insert(0, ${jsonLiteral(openharnessSrcPath)})`,
    "from openharness.ui.app import run_repl",
    `asyncio.run(run_repl(backend_only=True, cwd=${jsonLiteral(workspacePath)}, model=${jsonLiteral(route.model)}, base_url=${jsonLiteral(route.baseUrl)}, api_key=${jsonLiteral(route.apiKey)}, api_format=${jsonLiteral(apiFormat)}, permission_mode='default'))`,
  ].join("\n")
}

export function resolveOpenCodexBackendHostPaths({
  userDataPath,
}: {
  userDataPath: string
}): OpenCodexBackendHostPaths {
  const { appServerHomeDir } = resolveOpenCodexDataPaths(userDataPath)
  return {
    rootDir: appServerHomeDir,
    configDir: join(appServerHomeDir, "openharness-config"),
    dataDir: join(appServerHomeDir, "openharness-data"),
    logsDir: join(appServerHomeDir, "openharness-logs"),
  }
}

export function buildOpenCodexBackendHostLaunchSpec({
  appRoot,
  userDataPath,
  workspacePath,
  env = process.env,
}: {
  appRoot: string
  userDataPath: string
  workspacePath: string
  env?: NodeJS.ProcessEnv
}): OpenCodexBackendHostLaunchSpec {
  const config = readOpenCodexBackendConfig({ userDataPath })
  if (!config) {
    throw new Error("OpenCodex backend host cannot start without a saved backend config")
  }
  if (!openCodexBackendRouteRequiresHost(config)) {
    throw new Error(`OpenCodex backend host launch is not materialized for route kind ${config.kind}`)
  }

  const openharnessRoot = resolve(appRoot, "..", "openharness")
  const openharnessSrcPath = join(openharnessRoot, "src")
  const openharnessBackendHostPath = join(
    openharnessRoot,
    "src",
    "openharness",
    "ui",
    "backend_host.py",
  )
  if (!existsSync(openharnessBackendHostPath)) {
    throw new Error(`OpenHarness backend host is missing at ${openharnessBackendHostPath}`)
  }

  const ownedPaths = resolveOpenCodexBackendHostPaths({ userDataPath })
  for (const dirPath of [ownedPaths.rootDir, ownedPaths.configDir, ownedPaths.dataDir, ownedPaths.logsDir]) {
    mkdirSync(dirPath, { recursive: true })
  }

  const command =
    env.OPENCODEX_OPENHARNESS_PYTHON ||
    (process.platform === "win32" ? "py" : "python3")
  const inlineScript = buildBackendOnlyScript({
    openharnessSrcPath,
    route: config,
    workspacePath: resolve(workspacePath),
  })
  const args =
    process.platform === "win32"
      ? ["-3", "-c", inlineScript]
      : ["-c", inlineScript]

  return {
    command,
    args,
    cwd: resolve(openharnessRoot),
    env: {
      ...process.env,
      ...env,
      PYTHONUTF8: "1",
      PYTHONIOENCODING: "utf-8",
      OPENHARNESS_CONFIG_DIR: ownedPaths.configDir,
      OPENHARNESS_DATA_DIR: ownedPaths.dataDir,
      OPENHARNESS_LOGS_DIR: ownedPaths.logsDir,
    },
    inlineScript,
  }
}

class OpenCodexBackendHostSupervisor {
  private child: ChildProcessWithoutNullStreams | null = null
  private state: OpenCodexBackendHostState = {
    status: "stopped",
    pid: null,
    startedAt: null,
    lastError: null,
    lastEventType: null,
  }

  getState(): OpenCodexBackendHostState {
    return { ...this.state }
  }

  async start({
    appRoot,
    userDataPath,
    workspacePath,
  }: {
    appRoot: string
    userDataPath: string
    workspacePath: string
  }): Promise<OpenCodexBackendHostState> {
    const route = readOpenCodexBackendConfig({ userDataPath })
    if (!route) {
      return this.getState()
    }

    if (!openCodexBackendRouteRequiresHost(route)) {
      await this.stop()
      this.state = {
        status: "stopped",
        pid: null,
        startedAt: null,
        lastError: null,
        lastEventType: route.kind,
      }
      return this.getState()
    }

    if (this.child && this.state.status === "ready") {
      return this.getState()
    }

    await this.stop()

    const spec = buildOpenCodexBackendHostLaunchSpec({
      appRoot,
      userDataPath,
      workspacePath,
    })

    this.state = {
      status: "starting",
      pid: null,
      startedAt: new Date().toISOString(),
      lastError: null,
      lastEventType: null,
    }

    this.child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: spec.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    })
    this.state.pid = this.child.pid ?? null

    const readyPromise = new Promise<OpenCodexBackendHostState>((resolveState) => {
      const stdoutReader = createInterface({ input: this.child!.stdout })
      const settleReady = (next: OpenCodexBackendHostState) => {
        stdoutReader.close()
        resolveState(next)
      }

      stdoutReader.on("line", (line) => {
        const trimmed = line.trim()
        if (!trimmed.startsWith("OHJSON:")) {
          return
        }

        try {
          const event = JSON.parse(trimmed.slice("OHJSON:".length)) as {
            type?: string
            message?: string
          }
          this.state.lastEventType = event.type ?? null
          if (event.type === "ready") {
            this.state.status = "ready"
            settleReady(this.getState())
            return
          }
          if (event.type === "error") {
            this.state.status = "error"
            this.state.lastError = event.message ?? "OpenHarness backend host reported an error"
            settleReady(this.getState())
          }
        } catch (error) {
          this.state.status = "error"
          this.state.lastError =
            error instanceof Error ? error.message : "Failed to parse OpenHarness backend host output"
          settleReady(this.getState())
        }
      })
    })

    this.child.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8").trim()
      if (text.length > 0) {
        this.state.lastError = text
      }
    })

    this.child.on("exit", (code, signal) => {
      this.child = null
      if (this.state.status !== "stopped") {
        this.state = {
          ...this.state,
          status: code === 0 ? "stopped" : "error",
          pid: null,
          lastError:
            code === 0
              ? this.state.lastError
              : this.state.lastError || `OpenHarness backend host exited with code ${code ?? "null"} (${signal ?? "no-signal"})`,
        }
      }
    })

    return await Promise.race([
      readyPromise,
      new Promise<OpenCodexBackendHostState>((resolveState) => {
        setTimeout(() => {
          if (this.state.status === "starting") {
            this.state.status = "error"
            this.state.lastError = "OpenHarness backend host did not emit a ready event in time"
          }
          resolveState(this.getState())
        }, 15000)
      }),
    ])
  }

  async stop(): Promise<void> {
    if (!this.child) {
      this.state = {
        status: "stopped",
        pid: null,
        startedAt: null,
        lastError: this.state.lastError,
        lastEventType: this.state.lastEventType,
      }
      return
    }

    const activeChild = this.child
    this.child = null
    activeChild.kill()
    this.state = {
      status: "stopped",
      pid: null,
      startedAt: null,
      lastError: this.state.lastError,
      lastEventType: this.state.lastEventType,
    }
  }
}

let backendHostSupervisor: OpenCodexBackendHostSupervisor | null = null

function getSupervisor(): OpenCodexBackendHostSupervisor {
  if (!backendHostSupervisor) {
    backendHostSupervisor = new OpenCodexBackendHostSupervisor()
  }
  return backendHostSupervisor
}

export function getOpenCodexBackendHostState(): OpenCodexBackendHostState {
  return getSupervisor().getState()
}

export async function maybeStartOpenCodexBackendHost({
  appRoot,
  userDataPath,
  workspacePath,
}: {
  appRoot: string
  userDataPath: string
  workspacePath: string
}): Promise<OpenCodexBackendHostState> {
  if (!readOpenCodexBackendConfig({ userDataPath })) {
    return getOpenCodexBackendHostState()
  }
  return await getSupervisor().start({ appRoot, userDataPath, workspacePath })
}

export async function restartOpenCodexBackendHost({
  appRoot,
  userDataPath,
  workspacePath,
}: {
  appRoot: string
  userDataPath: string
  workspacePath: string
}): Promise<OpenCodexBackendHostState> {
  const supervisor = getSupervisor()
  await supervisor.stop()
  return await supervisor.start({ appRoot, userDataPath, workspacePath })
}

export async function stopOpenCodexBackendHost(): Promise<void> {
  await getSupervisor().stop()
}