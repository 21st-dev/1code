import type {
  AgentEngineId,
  AgentPermissionMode,
  AgentRuntimeAdapter,
  AgentRuntimeAvailability,
  AgentRuntimeControlResult,
  AgentRuntimeReceiptBus,
  AgentRuntimeRunReceipt,
  AgentRuntimeRunStatus,
  AgentRuntimeHealth,
  AgentRuntimeSessionRef,
  AgentRuntimeStartRequest,
  AgentRuntimeStreamEvent,
} from "../agent-runtime"

export type MobileGatewaySessionStatus =
  | "idle"
  | "running"
  | "needs-approval"
  | "needs-auth"
  | "offline"
  | "error"

export interface MobileGatewaySessionSummary {
  chatId: string
  subChatId: string
  title: string
  projectLabel: string
  projectPath: string
  detail: string
  engineId: AgentEngineId
  modelId: string | null
  nativeSessionId?: string | null
  permissionMode: AgentPermissionMode | string
  status: MobileGatewaySessionStatus
  updatedAt: string
  pendingApprovals: number
  unreadEvents: number
}

export type MobileGatewaySessionSource =
  | readonly MobileGatewaySessionSummary[]
  | (() => readonly MobileGatewaySessionSummary[])

export type MobileGatewayRuntimeHealthStatus = AgentRuntimeAvailability

export interface MobileGatewayRuntimeHealth {
  engineId: AgentEngineId
  status: MobileGatewayRuntimeHealthStatus
  detail: string
  checkedAt: string
  modelId?: string | null
  authMethod?: string
}

export type MobileGatewayRuntimeHealthSource =
  | readonly MobileGatewayRuntimeHealth[]
  | (() => readonly MobileGatewayRuntimeHealth[] | Promise<readonly MobileGatewayRuntimeHealth[]>)

export type MobileGatewayEvent =
  | {
      type: "turn-start"
      engineId: AgentEngineId
      modelId?: string | null
      permissionMode: string
    }
  | {
      type: "text-delta"
      text: string
    }
  | {
      type: "tool-call"
      toolCallId?: string
      name: string
      input?: unknown
    }
  | {
      type: "tool-result"
      toolCallId?: string
      name?: string
      result?: unknown
      isError?: boolean
    }
  | {
      type: "permission-request"
      requestId: string
      title?: string
      details?: unknown
    }
  | {
      type: "block"
      block: Record<string, unknown>
    }
  | {
      type: "block-patch"
      id: string
      patch: Record<string, unknown>
    }
  | {
      type: "usage"
      inputTokens?: number
      outputTokens?: number
      totalTokens?: number
      modelContextWindow?: number
      usedTokens?: number
      totalProcessedTokens?: number
      maxTokens?: number
      cachedInputTokens?: number
      reasoningOutputTokens?: number
      lastUsedTokens?: number
      lastInputTokens?: number
      lastCachedInputTokens?: number
      lastOutputTokens?: number
      lastReasoningOutputTokens?: number
      toolUses?: number
      durationMs?: number
      compactsAutomatically?: boolean
    }
  | {
      type: "auth-error"
      message: string
      recoverable: true
    }
  | {
      type: "error"
      message: string
      recoverable?: boolean
    }
  | {
      type: "finish"
      resultSubtype?: "success" | "error" | "cancelled"
      nativeSessionId?: string | null
    }

export interface MobileGatewayEnvelope {
  seq: number
  time: string
  chatId: string
  subChatId: string
  runId?: string
  event: MobileGatewayEvent
}

export interface MobileGatewayStartRunInput {
  chatId: string
  subChatId: string
  prompt: string
  engineId?: AgentEngineId
  modelId?: string | null
  permissionMode?: AgentPermissionMode | string
  images?: AgentRuntimeStartRequest["images"]
  forceNewSession?: boolean
}

export interface MobileGatewayRunReceipt {
  runId: string
  status: "running"
  engineId: AgentEngineId
  chatId: string
  subChatId: string
  startedAt: string
}

export interface MobileGatewayStopRunInput {
  runId: string
  reason?: string
}

export interface MobileGatewaySubmitToolResultInput {
  runId: string
  toolCallId: string
  result: unknown
  isError?: boolean
}

export interface ReadMobileGatewayEventsInput {
  subChatId: string
  afterSeq?: number
}

export interface MobileGatewayFacade {
  listSessions(): MobileGatewaySessionSummary[]
  listRuntimeHealth(): Promise<MobileGatewayRuntimeHealth[]>
  startRun(input: MobileGatewayStartRunInput): Promise<MobileGatewayRunReceipt>
  stopRun(input: MobileGatewayStopRunInput): Promise<AgentRuntimeControlResult>
  submitToolResult(
    input: MobileGatewaySubmitToolResultInput,
  ): Promise<AgentRuntimeControlResult>
  readEvents(
    input: ReadMobileGatewayEventsInput,
  ): AsyncIterable<MobileGatewayEnvelope>
}

export interface MobileGatewayHttpRequest {
  method: string
  url: string
  headers?: Record<string, string | undefined>
  body?: string
}

export interface MobileGatewayHttpResponse {
  status: number
  headers: Record<string, string>
  body: string
}

export type MobileGatewayPairingTokenSource =
  | string
  | (() => string | undefined)

export interface MobileGatewayPairingTokenRotation {
  token: string
  rotatedAt: string
}

export interface MobileGatewayHttpRequestOptions {
  pairingToken?: MobileGatewayPairingTokenSource
  rotatePairingToken?: () => MobileGatewayPairingTokenRotation
  pairingBaseUrl?: string | ((requestUrl: URL) => string)
  pairingLabel?: string
}

type MobileGatewayRunState = {
  receipt: MobileGatewayRunReceipt
  request: AgentRuntimeStartRequest
  history: MobileGatewayEnvelope[]
  completed: boolean
  streaming: boolean
  quiescedReceiptPublished: boolean
}

type MobileGatewayFinalRunStatus = Exclude<AgentRuntimeRunStatus, "running">
type MobileGatewayResultSubtype = AgentRuntimeRunReceipt["resultSubtype"]

export function createMobileGatewayFacade(input: {
  sessions: MobileGatewaySessionSource
  adapters: Partial<Record<AgentEngineId, AgentRuntimeAdapter>>
  runtimeHealth?: MobileGatewayRuntimeHealthSource
  runtimeReceipts?: AgentRuntimeReceiptBus
  now?: () => Date
}): MobileGatewayFacade {
  const now = input.now ?? (() => new Date())
  const getSessions = createSessionReader(input.sessions)
  const getRuntimeHealth = createRuntimeHealthReader(input.runtimeHealth)
  const runsBySubChat = new Map<string, MobileGatewayRunState>()
  const runsByRunId = new Map<string, MobileGatewayRunState>()
  const runtimeHealthOverrides = new Map<AgentEngineId, MobileGatewayRuntimeHealth>()

  return {
    listSessions() {
      return getSessions()
    },

    async listRuntimeHealth() {
      const sessions = getSessions()
      const baseHealth = getRuntimeHealth
        ? await getRuntimeHealth()
        : await inspectRuntimeHealth({
          sessions,
          adapters: input.adapters,
          checkedAt: now().toISOString(),
        })
      return mergeRuntimeHealthOverrides(baseHealth, runtimeHealthOverrides)
    },

    async startRun(runInput) {
      const session = findSessionOrThrow(getSessions(), runInput)
      const prompt = runInput.prompt.trim()
      if (!prompt) {
        throw new Error("prompt must be a non-empty string")
      }
      if (!input.adapters[session.engineId]) {
        throw new Error(`No mobile gateway adapter configured for ${session.engineId}`)
      }

      const startedAt = now().toISOString()
      const receipt = {
        runId: `mobile:${session.engineId}:${session.subChatId}:${Date.parse(startedAt)}`,
        status: "running" as const,
        engineId: session.engineId,
        chatId: session.chatId,
        subChatId: session.subChatId,
        startedAt,
      }
      const request: AgentRuntimeStartRequest = {
        runId: receipt.runId,
        session: buildRuntimeSession(session, runInput),
        prompt,
        images: runInput.images,
        forceNewSession: runInput.forceNewSession,
      }

      const state = {
        receipt,
        request,
        history: [],
        completed: false,
        streaming: false,
        quiescedReceiptPublished: false,
      }
      runsBySubChat.set(session.subChatId, state)
      runsByRunId.set(receipt.runId, state)
      input.runtimeReceipts?.publish({
        type: "runtime.run.started",
        runId: receipt.runId,
        engineId: receipt.engineId,
        chatId: receipt.chatId,
        subChatId: receipt.subChatId,
        createdAt: startedAt,
        source: "mobile-gateway",
      })

      return receipt
    },

    async stopRun(stopInput) {
      const run = runsByRunId.get(stopInput.runId)
      if (!run) {
        throw new MobileGatewayHttpError(
          404,
          `Mobile gateway run not found: ${stopInput.runId}`,
        )
      }

      const adapter = input.adapters[run.receipt.engineId]
      if (!adapter) {
        throw new Error(`No mobile gateway adapter configured for ${run.receipt.engineId}`)
      }

      return adapter.stop({
        session: run.request.session,
        runId: stopInput.runId,
        reason: stopInput.reason,
      })
    },

    async submitToolResult(toolInput) {
      const run = runsByRunId.get(toolInput.runId)
      if (!run) {
        throw new MobileGatewayHttpError(
          404,
          `Mobile gateway run not found: ${toolInput.runId}`,
        )
      }

      const adapter = input.adapters[run.receipt.engineId]
      if (!adapter) {
        throw new Error(`No mobile gateway adapter configured for ${run.receipt.engineId}`)
      }

      return adapter.submitToolResult({
        session: run.request.session,
        runId: toolInput.runId,
        toolCallId: toolInput.toolCallId,
        result: toolInput.result,
        isError: toolInput.isError,
      })
    },

    async *readEvents(eventsInput) {
      const run = runsBySubChat.get(eventsInput.subChatId)
      if (!run) {
        throw new Error(`No mobile gateway run is registered for ${eventsInput.subChatId}`)
      }

      if (run.completed) {
        yield* filterAfterSeq(run.history, eventsInput.afterSeq)
        return
      }
      if (run.streaming) {
        throw new Error(`Mobile gateway run is already streaming for ${eventsInput.subChatId}`)
      }

      run.streaming = true
      let finalStatus: MobileGatewayFinalRunStatus = "success"
      let finalResultSubtype: MobileGatewayResultSubtype = "success"
      let finalError: string | undefined
      let nextSeq = run.history.length > 0
        ? run.history[run.history.length - 1]!.seq + 1
        : (eventsInput.afterSeq ?? -1) + 1
      const append = (event: MobileGatewayEvent): MobileGatewayEnvelope => {
        const envelope = {
          seq: nextSeq++,
          time: now().toISOString(),
          chatId: run.receipt.chatId,
          subChatId: run.receipt.subChatId,
          runId: run.receipt.runId,
          event,
        }
        run.history.push(envelope)
        return envelope
      }
      const publishQuiescedReceipt = () => {
        if (!input.runtimeReceipts || run.quiescedReceiptPublished) return
        if (!run.completed) return
        run.quiescedReceiptPublished = true
        input.runtimeReceipts.publish({
          type: "turn.processing.quiesced",
          runId: run.receipt.runId,
          engineId: run.receipt.engineId,
          chatId: run.receipt.chatId,
          subChatId: run.receipt.subChatId,
          status: finalStatus,
          resultSubtype: finalResultSubtype,
          latestSequence: run.history.at(-1)?.seq ?? null,
          eventCount: run.history.length,
          createdAt: now().toISOString(),
          error: finalError ?? null,
          source: "mobile-gateway",
        })
      }
      const rememberTerminalMobileEvent = (event: MobileGatewayEvent) => {
        if (event.type === "error" || event.type === "auth-error") {
          finalStatus = "error"
          finalResultSubtype = "error"
          finalError = event.message
          return
        }
        if (event.type !== "finish") return
        finalResultSubtype = event.resultSubtype ?? finalResultSubtype
        if (event.resultSubtype === "cancelled") {
          finalStatus = "cancelled"
        } else if (event.resultSubtype === "error") {
          finalStatus = "error"
        } else if (finalStatus !== "error") {
          finalStatus = "success"
        }
      }

      try {
        const adapter = input.adapters[run.receipt.engineId]
        if (!adapter) {
          const errorEvent: MobileGatewayEvent = {
            type: "error",
            message: `No mobile gateway adapter configured for ${run.receipt.engineId}`,
            recoverable: false,
          }
          rememberTerminalMobileEvent(errorEvent)
          yield append(errorEvent)
          const finishEvent: MobileGatewayEvent = { type: "finish", resultSubtype: "error" }
          rememberTerminalMobileEvent(finishEvent)
          yield append(finishEvent)
          run.completed = true
          return
        }

        yield append({
          type: "turn-start",
          engineId: run.request.session.engineId,
          modelId: run.request.session.modelId,
          permissionMode: run.request.session.permissionMode,
        })

        for await (const runtimeEvent of adapter.stream(run.request)) {
          const mobileEvent = mapRuntimeEventToMobileEvent(runtimeEvent)
          if (mobileEvent) {
            rememberRuntimeHealthFailure({
              event: mobileEvent,
              run,
              checkedAt: now().toISOString(),
              overrides: runtimeHealthOverrides,
            })
            rememberTerminalMobileEvent(mobileEvent)
            yield append(mobileEvent)
            if (mobileEvent.type === "finish" || mobileEvent.type === "auth-error") {
              run.completed = true
            }
          }
        }
        run.completed = true
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const errorEvent: MobileGatewayEvent = {
          type: "error",
          message,
          recoverable: false,
        }
        rememberRuntimeHealthFailure({
          event: errorEvent,
          run,
          checkedAt: now().toISOString(),
          overrides: runtimeHealthOverrides,
        })
        rememberTerminalMobileEvent(errorEvent)
        yield append(errorEvent)
        const finishEvent: MobileGatewayEvent = {
          type: "finish",
          nativeSessionId: run.request.session.nativeSessionId ?? null,
          resultSubtype: "error",
        }
        rememberTerminalMobileEvent(finishEvent)
        yield append(finishEvent)
        run.completed = true
      } finally {
        publishQuiescedReceipt()
        run.streaming = false
      }
    },
  }
}

export async function collectMobileGatewayEvents(
  events: AsyncIterable<MobileGatewayEnvelope>,
): Promise<MobileGatewayEnvelope[]> {
  const collected: MobileGatewayEnvelope[] = []
  for await (const event of events) {
    collected.push(event)
  }
  return collected
}

export function serializeMobileGatewaySse(
  envelopes: MobileGatewayEnvelope[],
): string {
  return envelopes
    .map((envelope) => `event: mobile-envelope\ndata: ${JSON.stringify(envelope)}\n\n`)
    .join("")
}

export async function handleMobileGatewayRequest(
  facade: MobileGatewayFacade,
  request: MobileGatewayHttpRequest,
  options?: MobileGatewayHttpRequestOptions,
): Promise<MobileGatewayHttpResponse> {
  const url = new URL(request.url)
  if (!isAuthorized(request.headers ?? {}, options?.pairingToken)) {
    return jsonResponse(401, { error: "Unauthorized" })
  }

  try {
    if (
      request.method === "POST" &&
      url.pathname === "/mobile/v1/pairing/token/rotate"
    ) {
      if (!options?.rotatePairingToken) {
        return jsonResponse(404, { error: "Pairing token rotation is not configured" })
      }

      const rotation = options.rotatePairingToken()
      const token = requireString(rotation.token, "token")
      const baseUrl = resolvePairingBaseUrl(url, options.pairingBaseUrl)
      return jsonResponse(200, {
        token,
        baseUrl,
        pairingUrl: buildOneCodeMobilePairingUrl({
          baseUrl,
          token,
          label: options.pairingLabel ?? "Local 1code",
        }),
        rotatedAt: requireString(rotation.rotatedAt, "rotatedAt"),
        expiresPreviousToken: true,
      })
    }

    if (request.method === "GET" && url.pathname === "/mobile/v1/sessions") {
      return jsonResponse(200, { sessions: facade.listSessions() })
    }

    if (request.method === "GET" && url.pathname === "/mobile/v1/runtime/health") {
      return jsonResponse(200, { health: await facade.listRuntimeHealth() })
    }

    const stopMatch = url.pathname.match(/^\/mobile\/v1\/runs\/([^/]+)\/stop$/)
    if (request.method === "POST" && stopMatch) {
      const body = parseJsonBody(request.body)
      const result = await facade.stopRun({
        runId: decodeURIComponent(stopMatch[1]!),
        reason: optionalString(body.reason),
      })
      return jsonResponse(200, result)
    }

    const toolResultMatch = url.pathname.match(
      /^\/mobile\/v1\/runs\/([^/]+)\/tool-results\/([^/]+)$/,
    )
    if (request.method === "POST" && toolResultMatch) {
      const body = parseJsonBody(request.body)
      const result = await facade.submitToolResult({
        runId: decodeURIComponent(toolResultMatch[1]!),
        toolCallId: decodeURIComponent(toolResultMatch[2]!),
        result: body.result,
        isError: optionalBoolean(body.isError),
      })
      return jsonResponse(200, result)
    }

    const runMatch = url.pathname.match(/^\/mobile\/v1\/sessions\/([^/]+)\/runs$/)
    if (request.method === "POST" && runMatch) {
      const body = parseJsonBody(request.body)
      const receipt = await facade.startRun({
        chatId: requireString(body.chatId, "chatId"),
        subChatId: decodeURIComponent(runMatch[1]!),
        prompt: requireString(body.prompt, "prompt"),
        engineId: optionalEngine(body.engineId),
        modelId: optionalString(body.modelId),
        permissionMode: optionalString(body.permissionMode),
        forceNewSession:
          typeof body.forceNewSession === "boolean"
            ? body.forceNewSession
            : undefined,
      })
      return jsonResponse(200, receipt)
    }

    const eventsMatch = url.pathname.match(/^\/mobile\/v1\/sessions\/([^/]+)\/events$/)
    if (request.method === "GET" && eventsMatch) {
      const afterSeq = parseOptionalSeq(url.searchParams.get("afterSeq"))
      const envelopes = await collectMobileGatewayEvents(
        facade.readEvents({
          subChatId: decodeURIComponent(eventsMatch[1]!),
          afterSeq,
        }),
      )
      return {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
        },
        body: serializeMobileGatewaySse(envelopes),
      }
    }

    return jsonResponse(404, { error: "Not found" })
  } catch (error) {
    if (error instanceof MobileGatewayHttpError) {
      return jsonResponse(error.status, { error: error.message })
    }
    return jsonResponse(400, {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

class MobileGatewayHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

function createSessionReader(
  source: MobileGatewaySessionSource,
): () => MobileGatewaySessionSummary[] {
  return () => [...(typeof source === "function" ? source() : source)]
}

function createRuntimeHealthReader(
  source: MobileGatewayRuntimeHealthSource | undefined,
): (() => Promise<MobileGatewayRuntimeHealth[]>) | undefined {
  if (!source) return undefined
  return async () => [...(typeof source === "function" ? await source() : source)]
}

async function inspectRuntimeHealth(params: {
  sessions: readonly MobileGatewaySessionSummary[]
  adapters: Partial<Record<AgentEngineId, AgentRuntimeAdapter>>
  checkedAt: string
}): Promise<MobileGatewayRuntimeHealth[]> {
  const sessionsByEngine = new Map<AgentEngineId, MobileGatewaySessionSummary>()
  for (const session of params.sessions) {
    if (!sessionsByEngine.has(session.engineId)) {
      sessionsByEngine.set(session.engineId, session)
    }
  }

  const health: MobileGatewayRuntimeHealth[] = []
  for (const [engineId, session] of sessionsByEngine) {
    const adapter = params.adapters[engineId]
    if (!adapter) {
      health.push({
        engineId,
        modelId: session.modelId,
        status: "unsupported",
        detail: `No mobile gateway adapter configured for ${engineId}.`,
        checkedAt: params.checkedAt,
      })
      continue
    }

    try {
      const runtimeSession = buildInspectRuntimeSession(session)
      const runtimeHealth = adapter.inspect
        ? await adapter.inspect(runtimeSession)
        : { availability: await adapter.canStart(runtimeSession) } satisfies AgentRuntimeHealth
      health.push(toMobileRuntimeHealth({
        engineId,
        modelId: session.modelId,
        checkedAt: params.checkedAt,
        runtimeHealth,
      }))
    } catch (error) {
      health.push({
        engineId,
        modelId: session.modelId,
        status: "error",
        detail: error instanceof Error ? error.message : String(error),
        checkedAt: params.checkedAt,
      })
    }
  }

  return health
}

function toMobileRuntimeHealth(params: {
  engineId: AgentEngineId
  modelId: string | null
  checkedAt: string
  runtimeHealth: AgentRuntimeHealth
}): MobileGatewayRuntimeHealth {
  return {
    engineId: params.engineId,
    modelId: params.modelId,
    status: params.runtimeHealth.availability,
    detail:
      params.runtimeHealth.statusReason ??
      `${params.engineId} runtime is ${params.runtimeHealth.availability}.`,
    checkedAt: params.checkedAt,
    authMethod: params.runtimeHealth.authMethod,
  }
}

function mergeRuntimeHealthOverrides(
  health: readonly MobileGatewayRuntimeHealth[],
  overrides: ReadonlyMap<AgentEngineId, MobileGatewayRuntimeHealth>,
): MobileGatewayRuntimeHealth[] {
  const merged = new Map<AgentEngineId, MobileGatewayRuntimeHealth>()
  for (const item of health) {
    merged.set(item.engineId, item)
  }
  for (const [engineId, item] of overrides) {
    merged.set(engineId, item)
  }
  return [...merged.values()]
}

function rememberRuntimeHealthFailure(params: {
  event: MobileGatewayEvent
  run: MobileGatewayRunState
  checkedAt: string
  overrides: Map<AgentEngineId, MobileGatewayRuntimeHealth>
}): void {
  const message = params.event.type === "auth-error" || params.event.type === "error"
    ? params.event.message
    : undefined
  if (!message || !isAuthFailureMessage(message)) return

  params.overrides.set(params.run.request.session.engineId, {
    engineId: params.run.request.session.engineId,
    modelId: params.run.request.session.modelId ?? null,
    status: "needs-auth",
    detail: message,
    checkedAt: params.checkedAt,
    authMethod: "not-authenticated",
  })
}

function isAuthFailureMessage(message: string): boolean {
  const normalized = message.toLowerCase()
  return normalized.includes("auth_unavailable") ||
    normalized.includes("no auth available") ||
    normalized.includes("authentication token has been invalidated") ||
    normalized.includes("authentication is required")
}

function findSessionOrThrow(
  sessions: readonly MobileGatewaySessionSummary[],
  input: MobileGatewayStartRunInput,
): MobileGatewaySessionSummary {
  const session = sessions.find((candidate) => candidate.subChatId === input.subChatId)
  if (!session) {
    throw new Error(`Mobile gateway session not found: ${input.subChatId}`)
  }
  if (session.chatId !== input.chatId) {
    throw new Error(`Mobile gateway chat mismatch for ${input.subChatId}`)
  }
  if (input.engineId && input.engineId !== session.engineId) {
    throw new Error(`Mobile gateway engine mismatch for ${input.subChatId}`)
  }
  return session
}

function buildRuntimeSession(
  session: MobileGatewaySessionSummary,
  input: MobileGatewayStartRunInput,
): AgentRuntimeSessionRef {
  return {
    chatId: session.chatId,
    subChatId: session.subChatId,
    engineId: session.engineId,
    modelId: input.modelId ?? session.modelId,
    nativeSessionId: session.nativeSessionId ?? null,
    permissionMode: (input.permissionMode ?? session.permissionMode) as AgentPermissionMode,
    cwd: session.projectPath,
    projectPath: session.projectPath,
  }
}

function buildInspectRuntimeSession(
  session: MobileGatewaySessionSummary,
): AgentRuntimeSessionRef {
  return {
    chatId: session.chatId,
    subChatId: session.subChatId,
    engineId: session.engineId,
    modelId: session.modelId,
    nativeSessionId: session.nativeSessionId ?? null,
    permissionMode: session.permissionMode as AgentPermissionMode,
    cwd: session.projectPath,
    projectPath: session.projectPath,
  }
}

function filterAfterSeq(
  history: MobileGatewayEnvelope[],
  afterSeq: number | undefined,
): MobileGatewayEnvelope[] {
  if (afterSeq === undefined) return [...history]
  return history.filter((event) => event.seq > afterSeq)
}

function compactEvent<T extends Record<string, unknown>>(event: T): T {
  return Object.fromEntries(
    Object.entries(event).filter(([, value]) => value !== undefined),
  ) as T
}

function mapRuntimeEventToMobileEvent(
  event: AgentRuntimeStreamEvent,
): MobileGatewayEvent | null {
  switch (event.type) {
    case "text":
      return { type: "text-delta", text: event.text }
    case "tool-call":
      return {
        type: "tool-call",
        toolCallId: event.id,
        name: event.name,
        input: event.input,
      }
    case "tool-result":
      return {
        type: "tool-result",
        toolCallId: event.id,
        name: event.name,
        result: event.result,
      }
    case "usage":
      return compactEvent({
        type: "usage" as const,
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
        totalTokens: event.totalTokens,
        modelContextWindow: event.modelContextWindow,
        usedTokens: event.usedTokens,
        totalProcessedTokens: event.totalProcessedTokens,
        maxTokens: event.maxTokens,
        cachedInputTokens: event.cachedInputTokens,
        reasoningOutputTokens: event.reasoningOutputTokens,
        lastUsedTokens: event.lastUsedTokens,
        lastInputTokens: event.lastInputTokens,
        lastCachedInputTokens: event.lastCachedInputTokens,
        lastOutputTokens: event.lastOutputTokens,
        lastReasoningOutputTokens: event.lastReasoningOutputTokens,
        toolUses: event.toolUses,
        durationMs: event.durationMs,
        compactsAutomatically: event.compactsAutomatically,
      })
    case "conversation-block":
      const block = event.block as unknown as Record<string, unknown>
      if (isPermissionBlock(block)) {
        return {
          type: "permission-request",
          requestId: cleanString(block.id) ?? "permission-request",
          title: cleanString(block.title) ?? cleanString(block.name),
          details: block,
        }
      }
      return { type: "block", block }
    case "conversation-block-update":
      return {
        type: "block-patch",
        id: event.id,
        patch: event.patch as unknown as Record<string, unknown>,
      }
    case "auth-error":
      return {
        type: "auth-error",
        message: event.message,
        recoverable: true,
      }
    case "error":
      return {
        type: "error",
        message: event.message,
        recoverable: false,
      }
    case "finish":
      return {
        type: "finish",
        nativeSessionId: event.nativeSessionId ?? null,
        resultSubtype: event.resultSubtype,
      }
    default:
      return null
  }
}

function isPermissionBlock(block: unknown): block is Record<string, unknown> {
  return Boolean(block) &&
    typeof block === "object" &&
    !Array.isArray(block) &&
    (block as Record<string, unknown>).type === "permission-request"
}

function isAuthorized(
  headers: Record<string, string | undefined>,
  pairingToken: MobileGatewayPairingTokenSource | undefined,
): boolean {
  const token = readPairingToken(pairingToken)
  if (!token) return true
  return headerValue(headers, "authorization") === `Bearer ${token}`
}

function readPairingToken(
  pairingToken: MobileGatewayPairingTokenSource | undefined,
): string | undefined {
  return typeof pairingToken === "function" ? pairingToken() : pairingToken
}

function headerValue(
  headers: Record<string, string | undefined>,
  name: string,
): string | undefined {
  const target = name.toLowerCase()
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return value
  }
  return undefined
}

function jsonResponse(status: number, value: unknown): MobileGatewayHttpResponse {
  return {
    status,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  }
}

function resolvePairingBaseUrl(
  requestUrl: URL,
  pairingBaseUrl: MobileGatewayHttpRequestOptions["pairingBaseUrl"],
): string {
  const rawBaseUrl = typeof pairingBaseUrl === "function"
    ? pairingBaseUrl(requestUrl)
    : pairingBaseUrl ?? requestUrl.origin
  return normalizePairingBaseUrl(rawBaseUrl)
}

function normalizePairingBaseUrl(baseUrl: string): string {
  const parsed = new URL(baseUrl)
  const pathname = parsed.pathname
    .replace(/\/+$/, "")
    .replace(/\/mobile\/v1$/, "")
  return `${parsed.protocol}//${parsed.host}${pathname}`
}

export function buildOneCodeMobilePairingUrl(input: {
  baseUrl: string
  token: string
  label: string
}): string {
  const params = new URLSearchParams({
    url: `${input.baseUrl}/mobile/v1/`,
    token: input.token,
    label: input.label,
  })
  return `onecode-mobile://pair?${params.toString()}`
}

function parseJsonBody(body: string | undefined): Record<string, unknown> {
  if (!body) return {}
  const parsed = JSON.parse(body)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Request body must be a JSON object")
  }
  return parsed as Record<string, unknown>
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a non-empty string`)
  }
  return value
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

function cleanString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined
}

function optionalEngine(value: unknown): AgentEngineId | undefined {
  if (
    value === "claude-code" ||
    value === "codex" ||
    value === "hermes" ||
    value === "custom-acp"
  ) {
    return value
  }
  return undefined
}

function parseOptionalSeq(value: string | null): number | undefined {
  if (value === null || value === "") return undefined
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("afterSeq must be a non-negative safe integer")
  }
  return parsed
}
