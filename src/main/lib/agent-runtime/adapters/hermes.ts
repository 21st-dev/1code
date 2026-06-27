import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import { createRequire } from "node:module"
import { getAgentRuntimeManifest } from "../manifests"
import { runHermesCliResumeBridge } from "../hermes-native-session"
import { streamHermesAcpRuntimeRun } from "../hermes-acp-runtime"
import {
  createAgentRuntimeProcessHandle,
  registerAgentRuntimeProcessHandle,
  stopAgentRuntimeProcess,
  unregisterAgentRuntimeProcessHandle,
} from "../process-registry"
import {
  createAgentRuntimeRunReceipt,
  createUnsupportedAgentRuntimeControlResult,
  createUnsupportedAgentRuntimeReceipt,
  streamUnsupportedAgentRuntimeRun,
} from "../runtime-run-ledger"
import type {
  AgentRuntimeAdapter,
  AgentRuntimeAvailability,
  AgentRuntimeHealth,
  AgentRuntimeSessionRef,
  AgentRuntimeStartRequest,
  AgentRuntimeStreamEvent,
} from "../types"
import {
  resolveHermesRuntime,
  type HermesRuntimeResolution,
} from "../../hermes/runtime"

const require = createRequire(import.meta.url)
const yaml = require("js-yaml") as {
  load(source: string): unknown
}

export interface HermesRuntimeModelConfig {
  provider?: string
  defaultModel?: string
  baseUrl?: string
  apiKey?: string
  apiMode?: string
}

export type HermesModelCatalogResult =
  | { status: "ok"; modelIds: string[] }
  | { status: "auth-error"; message: string }
  | { status: "error"; message: string }

export interface HermesRuntimeHealthDeps {
  resolveRuntime?: () => HermesRuntimeResolution
  readModelConfig?: () => Promise<HermesRuntimeModelConfig | null>
  fetchModelCatalog?: (config: HermesRuntimeModelConfig) => Promise<HermesModelCatalogResult>
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function asCleanString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function modelHealth(
  availability: AgentRuntimeAvailability,
  reason?: string,
): AgentRuntimeHealth["models"] {
  const manifest = getAgentRuntimeManifest("hermes")
  return manifest.models?.map((model) => ({
    ...model,
    availability,
    ...(reason ? { reason } : {}),
  }))
}

function sanitizeBaseUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl)
    url.username = ""
    url.password = ""
    return url.toString().replace(/\/$/, "")
  } catch {
    return baseUrl
  }
}

function isAuthLikeMessage(message: string): boolean {
  return /auth_unavailable|no auth available|not authenticated|unauthorized|forbidden|authentication/i
    .test(message)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function readHermesModelConfig(): Promise<HermesRuntimeModelConfig | null> {
  try {
    const configPath = path.join(os.homedir(), ".hermes", "config.yaml")
    const raw = await fs.readFile(configPath, "utf-8")
    const parsed = asRecord(yaml.load(raw))
    const model = asRecord(parsed?.model)
    if (!model) return null

    return {
      provider: asCleanString(model.provider),
      defaultModel: asCleanString(model.default) ?? asCleanString(model.defaultModel),
      baseUrl: asCleanString(model.base_url) ?? asCleanString(model.baseUrl),
      apiKey: asCleanString(model.api_key) ?? asCleanString(model.apiKey),
      apiMode: asCleanString(model.api_mode) ?? asCleanString(model.apiMode),
    }
  } catch {
    return null
  }
}

export async function fetchHermesModelCatalog(
  config: HermesRuntimeModelConfig,
): Promise<HermesModelCatalogResult> {
  if (!config.baseUrl) {
    return { status: "error", message: "Hermes custom endpoint base URL is missing." }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 2000)

  try {
    const response = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/models`, {
      method: "GET",
      headers: {
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      signal: controller.signal,
    })
    const body = await response.text()
    const authLike = isAuthLikeMessage(body)

    if (!response.ok) {
      const message = body.trim()
        ? `HTTP ${response.status}: ${body.trim()}`
        : `HTTP ${response.status}`
      if (response.status === 401 || response.status === 403 || authLike) {
        return { status: "auth-error", message }
      }
      return { status: "error", message }
    }

    const parsed = asRecord(body.trim() ? JSON.parse(body) : {})
    const data = Array.isArray(parsed?.data) ? parsed.data : []
    const modelIds = data
      .map((item) => asCleanString(asRecord(item)?.id))
      .filter((id): id is string => Boolean(id))

    return { status: "ok", modelIds }
  } catch (error) {
    const message = errorMessage(error)
    return {
      status: isAuthLikeMessage(message) ? "auth-error" : "error",
      message,
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function inspectHermesRuntime(
  _session?: AgentRuntimeSessionRef,
  deps: HermesRuntimeHealthDeps = {},
): Promise<AgentRuntimeHealth> {
  const runtime = (deps.resolveRuntime ?? resolveHermesRuntime)()

  if (!runtime.executable && !runtime.sourceRoot) {
    return {
      availability: "not-installed",
      statusReason: "Hermes CLI and source root were not found.",
      authMethod: "unknown",
      models: modelHealth("not-installed", "Hermes is not installed."),
    }
  }

  if ((runtime.acpExecutable || runtime.executable) && runtime.acpAdapterPath) {
    const launchPath = runtime.acpExecutable || `${runtime.executable} acp`
    const availableHealth: AgentRuntimeHealth = {
      availability: "available",
      statusReason:
        `Hermes ACP transport is available via ${launchPath}.`,
      authMethod: "shell-config",
      models: modelHealth(
        "available",
        "Hermes uses the current ACP runtime model unless a concrete ACP model is selected.",
      ),
    }

    const config = await (deps.readModelConfig ?? readHermesModelConfig)()
    if (
      config?.provider !== "custom" ||
      !config.baseUrl ||
      !config.defaultModel
    ) {
      return availableHealth
    }

    const safeBaseUrl = sanitizeBaseUrl(config.baseUrl)
    const catalog = await (deps.fetchModelCatalog ?? fetchHermesModelCatalog)(config)
    if (catalog.status === "auth-error") {
      return {
        availability: "needs-auth",
        statusReason: `Hermes custom endpoint auth failed: ${catalog.message}`,
        authMethod: "not-authenticated",
        models: modelHealth("needs-auth", catalog.message),
      }
    }

    if (catalog.status === "error") {
      return {
        availability: "error",
        statusReason: `Hermes custom endpoint probe failed: ${catalog.message}`,
        authMethod: "unknown",
        models: modelHealth("error", catalog.message),
      }
    }

    if (!catalog.modelIds.includes(config.defaultModel)) {
      const reason =
        `Hermes custom endpoint at ${safeBaseUrl} does not expose configured model ${config.defaultModel}.`
      return {
        availability: "needs-auth",
        statusReason: reason,
        authMethod: "not-authenticated",
        models: modelHealth("needs-auth", reason),
      }
    }

    return {
      ...availableHealth,
      statusReason:
        `Hermes custom endpoint exposes ${config.defaultModel} via ${safeBaseUrl}.`,
    }
  }

  return {
    availability: "unsupported",
    statusReason:
      `Hermes source detected at ${runtime.sourceRoot || "unknown"}, but executable or ACP adapter is missing.`,
    authMethod: "unknown",
    models: modelHealth("unsupported", "Hermes executable or ACP adapter is missing."),
  }
}

function unsupportedHermesStart(request: AgentRuntimeStartRequest) {
  return createUnsupportedAgentRuntimeReceipt({
    action: "start",
    request,
    reason:
      "Hermes start requires the ACP session registry slice before Moss can own start/stream/stop.",
  })
}

async function resumeHermesRuntime(request: AgentRuntimeStartRequest) {
  const handle = registerAgentRuntimeProcessHandle(
    createAgentRuntimeProcessHandle({
      action: "resume",
      session: request.session,
      runId: request.runId,
    }),
  )
  const nativeSessionId = request.session.nativeSessionId
  if (!nativeSessionId) {
    unregisterAgentRuntimeProcessHandle(handle.runId)
    return createAgentRuntimeRunReceipt({
      runId: handle.runId,
      action: "resume",
      session: request.session,
      status: "error",
      resultSubtype: "error",
      now: handle.createdAt,
      completedAt: new Date(),
      error: "Hermes resume requires a native session id.",
    })
  }

  try {
    const [{ getMossProviderSecret }, { resolveMossProviderForEngine }] =
      await Promise.all([
        import("../../moss-source/provider-secrets"),
        import("../../moss-source/provider-config"),
      ])
    const mossProvider = await resolveMossProviderForEngine({
      projectPath: request.session.projectPath ?? request.session.cwd,
      engineId: "hermes",
      requestedModelId: request.session.modelId ?? undefined,
      createIfMissing: true,
      secretResolver: { getSecret: getMossProviderSecret },
    })
    if (mossProvider.warnings.length > 0) {
      console.warn("[hermes-runtime] Moss provider warnings:", mossProvider.warnings)
    }
    const runtime = resolveHermesRuntime()
    const result = await runHermesCliResumeBridge({
      sessionId: nativeSessionId,
      cwd: request.session.cwd,
      prompt: request.prompt,
      modelId: mossProvider.status === "resolved"
        ? mossProvider.model ?? request.session.modelId
        : request.session.modelId,
      permissionMode: request.session.permissionMode,
      command: runtime.executable,
      env: mossProvider.status === "resolved" ? mossProvider.env : {},
      abortSignal: handle.abortController.signal,
    })
    const wasCancelled = handle.abortController.signal.aborted

    return createAgentRuntimeRunReceipt({
      runId: handle.runId,
      action: "resume",
      session: request.session,
      status: wasCancelled ? "cancelled" : result.success ? "success" : "error",
      nativeSessionId,
      resultSubtype: wasCancelled ? "cancelled" : result.success ? "success" : "error",
      now: handle.createdAt,
      completedAt: new Date(),
      error: wasCancelled ? "Hermes runtime run was cancelled." : result.error,
      metadata: {
        bridge: result.plan.bridge,
        command: result.plan.command,
        args: result.plan.args,
        promptSource: result.plan.promptSource,
        canRunHeadless: result.plan.canRunHeadless,
        lastText: result.lastText,
        exitCode: result.exitCode,
        stderr: result.stderr,
        stopReason: handle.stopReason,
      },
    })
  } catch (error) {
    const wasCancelled = handle.abortController.signal.aborted
    return createAgentRuntimeRunReceipt({
      runId: handle.runId,
      action: "resume",
      session: request.session,
      status: wasCancelled ? "cancelled" : "error",
      resultSubtype: wasCancelled ? "cancelled" : "error",
      now: handle.createdAt,
      completedAt: new Date(),
      error: wasCancelled ? "Hermes runtime run was cancelled." : error instanceof Error ? error.message : String(error),
    })
  } finally {
    unregisterAgentRuntimeProcessHandle(handle.runId)
  }
}

async function* streamHermesRuntime(
  request: AgentRuntimeStartRequest,
): AsyncIterable<AgentRuntimeStreamEvent> {
  if (!request.session.nativeSessionId || request.forceNewSession) {
    yield* streamUnsupportedAgentRuntimeRun(unsupportedHermesStart(request))
    return
  }

  yield* streamHermesAcpRuntimeRun(request)
}

export const hermesAdapter: AgentRuntimeAdapter = {
  manifest: getAgentRuntimeManifest("hermes"),
  async inspect(
    session: AgentRuntimeSessionRef,
  ): Promise<AgentRuntimeHealth> {
    return inspectHermesRuntime(session)
  },
  async canStart(
    session: AgentRuntimeSessionRef,
  ): Promise<AgentRuntimeAvailability> {
    return (await inspectHermesRuntime(session)).availability
  },
  async start(request) {
    return unsupportedHermesStart(request)
  },
  async resume(request) {
    return resumeHermesRuntime(request)
  },
  stream(request) {
    return streamHermesRuntime(request)
  },
  async stop(request) {
    return stopAgentRuntimeProcess(request)
  },
  async submitToolResult(request) {
    return createUnsupportedAgentRuntimeControlResult(
      request,
      "Hermes tool result submission requires the ACP session registry slice.",
    )
  },
}
