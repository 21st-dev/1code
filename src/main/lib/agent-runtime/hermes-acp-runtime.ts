import { createACPProvider, type ACPProvider } from "@mcpc-tech/acp-ai-provider"
import { streamText } from "ai"
import { homedir } from "node:os"
import { join } from "node:path"
import { resolveHermesAcpLaunch } from "../hermes/runtime"
import {
  resolveMossProviderForEngine,
  type ResolvedMossProvider,
} from "../moss-source/provider-config"
import {
  createAgentRuntimeProcessHandle,
  registerAgentRuntimeProcessHandle,
  unregisterAgentRuntimeProcessHandle,
} from "./process-registry"
import type {
  AgentPermissionMode,
  AgentRuntimeStartRequest,
  AgentRuntimeStreamEvent,
} from "./types"

type HermesAcpProvider = Pick<
  ACPProvider,
  "cleanup" | "getSessionId" | "initSession" | "languageModel" | "tools"
>

export type HermesAcpTextStreamInput = {
  model: unknown
  messages: Array<{ role: "user"; content: unknown }>
  tools: unknown
  abortSignal?: AbortSignal
}

export type HermesAcpRuntimeDeps = {
  resolveProvider?: typeof resolveMossProviderForEngine
  getProviderSecret?: MossProviderSecretGetter
  resolveLaunch?: typeof resolveHermesAcpLaunch
  createProvider?: (input: Parameters<typeof createACPProvider>[0]) => HermesAcpProvider
  textStream?: (input: HermesAcpTextStreamInput) => AsyncIterable<string>
  env?: NodeJS.ProcessEnv
  shellEnv?: Record<string, string | undefined>
}

type MossProviderSecretGetter = (providerId: string) => Promise<{
  apiKey?: string
}>

const DEFAULT_HERMES_MODEL = "moss-default"

export function resolveHermesAcpModelForCall(
  model: string | null | undefined,
): string | undefined {
  const normalized = model?.trim()
  if (!normalized || normalized === DEFAULT_HERMES_MODEL || normalized === "hermes") {
    return undefined
  }
  return normalized
}

export function resolveHermesAcpMode(
  permissionMode: AgentPermissionMode | undefined,
): string {
  return permissionMode === "plan" || permissionMode === "read-only"
    ? "default"
    : "accept_edits"
}

export function detectHermesAcpErrorText(text: string): string | undefined {
  const trimmed = text.trim()
  if (/^API call failed after \d+ retries:/i.test(trimmed)) {
    return trimmed
  }
  return undefined
}

export function buildHermesAcpProviderEnv(params: {
  mossProvider?: ResolvedMossProvider | null
  baseEnv?: NodeJS.ProcessEnv
  shellEnv?: Record<string, string | undefined>
}): Record<string, string> {
  const env: Record<string, string> = {}

  for (const [key, value] of Object.entries(params.baseEnv ?? process.env)) {
    if (typeof value === "string") env[key] = value
  }

  for (const [key, value] of Object.entries(params.shellEnv ?? {})) {
    if (typeof value === "string") env[key] = value
  }

  if (!env.HERMES_HOME) {
    env.HERMES_HOME = join(homedir(), ".hermes")
  }

  if (params.mossProvider?.status === "resolved") {
    Object.assign(env, params.mossProvider.env)
  }

  return env
}

export async function* streamHermesAcpRuntimeRun(
  request: AgentRuntimeStartRequest,
  deps: HermesAcpRuntimeDeps = {},
): AsyncIterable<AgentRuntimeStreamEvent> {
  const handle = registerAgentRuntimeProcessHandle(
    createAgentRuntimeProcessHandle({
      action: "resume",
      session: request.session,
    }),
  )
  let provider: HermesAcpProvider | null = null

  try {
    const nativeSessionId = request.session.nativeSessionId
    if (!nativeSessionId) {
      yield {
        type: "error",
        message: "Hermes ACP resume requires a native session id.",
      }
      yield { type: "finish", resultSubtype: "error", nativeSessionId: null }
      return
    }

    const resolveProvider = deps.resolveProvider ?? resolveMossProviderForEngine
    const mossProvider = await resolveProvider({
      projectPath: request.session.projectPath ?? request.session.cwd,
      engineId: "hermes",
      requestedModelId: request.session.modelId ?? undefined,
      createIfMissing: true,
      secretResolver: {
        getSecret: deps.getProviderSecret ?? getDefaultMossProviderSecret,
      },
    })

    if (mossProvider.warnings.length > 0) {
      console.warn("[hermes-acp-runtime] Moss provider warnings:", mossProvider.warnings)
    }

    const launch = (deps.resolveLaunch ?? resolveHermesAcpLaunch)()
    const createProvider: (input: Parameters<typeof createACPProvider>[0]) => HermesAcpProvider =
      deps.createProvider ?? createACPProvider
    const shellEnv = deps.shellEnv ?? await getDefaultClaudeShellEnvironment()
    const activeProvider = createProvider({
      command: launch.command,
      args: launch.args,
      env: buildHermesAcpProviderEnv({
        mossProvider,
        baseEnv: deps.env,
        shellEnv,
      }),
      ...((deps.env ?? process.env).HERMES_ACP_AUTH_METHOD
        ? { authMethodId: (deps.env ?? process.env).HERMES_ACP_AUTH_METHOD }
        : {}),
      session: {
        cwd: request.session.cwd,
        mcpServers: [],
      },
      existingSessionId: nativeSessionId,
      persistSession: true,
    })
    provider = activeProvider

    const sessionInfo = await activeProvider.initSession()
    const activeNativeSessionId =
      activeProvider.getSessionId() || sessionInfo?.sessionId || nativeSessionId
    const providerModel =
      mossProvider.status === "resolved"
        ? mossProvider.model ?? request.session.modelId
        : request.session.modelId
    const languageModel = activeProvider.languageModel(
      resolveHermesAcpModelForCall(providerModel),
      resolveHermesAcpMode(request.session.permissionMode),
    )
    const textStream = deps.textStream ?? defaultHermesAcpTextStream
    let accumulatedText = ""

    for await (const text of textStream({
      model: languageModel,
      messages: [
        {
          role: "user",
          content: buildHermesAcpUserContent(request),
        },
      ],
      tools: activeProvider.tools,
      abortSignal: handle.abortController.signal,
    })) {
      if (text) {
        accumulatedText += text
        yield { type: "text", text }
      }
    }

    const wasCancelled = handle.abortController.signal.aborted
    const detectedError = wasCancelled
      ? undefined
      : detectHermesAcpErrorText(accumulatedText)
    if (detectedError) {
      yield { type: "error", message: detectedError }
      yield {
        type: "finish",
        nativeSessionId: activeNativeSessionId,
        resultSubtype: "error",
      }
      return
    }

    yield {
      type: "finish",
      nativeSessionId: activeNativeSessionId,
      resultSubtype: wasCancelled ? "cancelled" : "success",
    }
  } catch (error) {
    const wasCancelled = handle.abortController.signal.aborted
    yield {
      type: "error",
      message: wasCancelled
        ? "Hermes ACP runtime run was cancelled."
        : error instanceof Error ? error.message : String(error),
    }
    yield {
      type: "finish",
      nativeSessionId: request.session.nativeSessionId ?? null,
      resultSubtype: wasCancelled ? "cancelled" : "error",
    }
  } finally {
    provider?.cleanup()
    unregisterAgentRuntimeProcessHandle(handle.runId)
  }
}

async function* defaultHermesAcpTextStream(
  input: HermesAcpTextStreamInput,
): AsyncIterable<string> {
  const result = streamText({
    model: input.model as never,
    messages: input.messages as never,
    tools: input.tools as never,
    abortSignal: input.abortSignal,
  }) as unknown as {
    text?: PromiseLike<string>
    textStream?: AsyncIterable<string>
  }

  if (result.textStream) {
    for await (const text of result.textStream) {
      yield text
    }
    return
  }

  const text = await result.text
  if (text) yield text
}

async function getDefaultMossProviderSecret(providerId: string): Promise<{
  apiKey?: string
}> {
  const { getMossProviderSecret } = await import("../moss-source/provider-secrets")
  return getMossProviderSecret(providerId)
}

async function getDefaultClaudeShellEnvironment(): Promise<Record<string, string>> {
  const { getClaudeShellEnvironment } = await import("../claude/env")
  return getClaudeShellEnvironment()
}

function buildHermesAcpUserContent(request: AgentRuntimeStartRequest): unknown {
  if (!request.images?.length) return request.prompt

  return [
    { type: "text", text: request.prompt },
    ...request.images.map((image) => ({
      type: "image",
      image: `data:${image.mediaType};base64,${image.base64Data}`,
      ...(image.filename ? { filename: image.filename } : {}),
    })),
  ]
}
