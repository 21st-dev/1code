import { createACPProvider, type ACPProvider } from "@mcpc-tech/acp-ai-provider"
import { observable } from "@trpc/server/observable"
import { streamText } from "ai"
import { eq } from "drizzle-orm"
import { createHash } from "node:crypto"
import { homedir } from "node:os"
import { join } from "node:path"
import { z } from "zod"
import { buildAgentRuntimeLaunchPlan } from "../../agent-runtime/launch-plan"
import { shouldIgnoreMossStoredMessageSessionIds } from "../../agent-runtime/session-actions"
import { persistAgentRuntimeSession } from "../../agent-runtime/session-store"
import { getClaudeShellEnvironment } from "../../claude/env"
import { resolveProjectPathFromWorktree } from "../../claude-config"
import { getDatabase, subChats } from "../../db"
import { resolveHermesAcpLaunch } from "../../hermes/runtime"
import {
  getMossProviderSecret,
  getMossProviderFingerprint,
  resolveMossProviderForEngine,
  runMossHooks,
  type ResolvedMossProvider,
} from "../../moss-source"
import { buildMossRuntimeContext } from "../../moss-source/runtime-context"
import { publicProcedure, router } from "../index"

const imageAttachmentSchema = z.object({
  base64Data: z.string(),
  mediaType: z.string(),
  filename: z.string().optional(),
})

const permissionModeSchema = z.enum([
  "plan",
  "agent",
  "bypass",
  "read-only",
  "ask-approval",
  "full-access",
  "custom",
])

const runtimeModelSelectionSchema = z.object({
  instanceId: z.string().min(1),
  modelId: z.string().min(1),
  options: z.record(z.string(), z.unknown()).optional(),
})

type RuntimeModelSelectionInput = z.infer<typeof runtimeModelSelectionSchema>

function resolveRuntimeModelSelection(input: {
  providerInstanceId?: string | null
  modelSelection?: RuntimeModelSelectionInput | null
  fallbackModelId: string
}): {
  providerInstanceId: string | null
  modelSelection: RuntimeModelSelectionInput | null
} {
  const modelSelection =
    input.modelSelection ??
    (input.providerInstanceId
      ? {
          instanceId: input.providerInstanceId,
          modelId: input.fallbackModelId,
        }
      : null)
  return {
    providerInstanceId:
      input.providerInstanceId ?? modelSelection?.instanceId ?? null,
    modelSelection,
  }
}

type HermesProviderSession = {
  provider: ACPProvider
  cwd: string
  mossProviderFingerprint: string | null
  launchFingerprint: string
}

type ActiveHermesStream = {
  runId: string
  controller: AbortController
  cancelRequested: boolean
}

const providerSessions = new Map<string, HermesProviderSession>()
const activeStreams = new Map<string, ActiveHermesStream>()

const DEFAULT_HERMES_MODEL = "moss-default"

export function hasActiveHermesStreams(): boolean {
  return activeStreams.size > 0
}

export function hasActiveHermesStreamForSubChat(
  subChatId: string,
  runId?: string | null,
): boolean {
  const stream = activeStreams.get(subChatId)
  if (!stream) return false
  return !runId || stream.runId === runId
}

export function abortAllHermesStreams(): void {
  for (const [subChatId, stream] of activeStreams) {
    console.log(`[hermes] Aborting stream ${subChatId} before reload`)
    stream.cancelRequested = true
    stream.controller.abort()
  }
  activeStreams.clear()
}

function parseStoredMessages(raw: string | null | undefined): any[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function extractPromptFromStoredMessage(message: any): string {
  if (!message || !Array.isArray(message.parts)) return ""

  const textParts: string[] = []
  const fileContents: string[] = []

  for (const part of message.parts) {
    if (part?.type === "text" && typeof part.text === "string") {
      textParts.push(part.text)
    } else if (part?.type === "file-content") {
      const filePath =
        typeof part.filePath === "string" ? part.filePath : undefined
      const fileName = filePath?.split("/").pop() || filePath || "file"
      const content = typeof part.content === "string" ? part.content : ""
      fileContents.push(`\n--- ${fileName} ---\n${content}`)
    }
  }

  return textParts.join("\n") + fileContents.join("")
}

function getLastSessionId(messages: any[]): string | undefined {
  const lastAssistant = [...messages]
    .reverse()
    .find((message) => message?.role === "assistant")
  const sessionId = lastAssistant?.metadata?.sessionId
  return typeof sessionId === "string" ? sessionId : undefined
}

function buildUserParts(
  prompt: string,
  images:
    | Array<{
        base64Data?: string
        mediaType?: string
        filename?: string
      }>
    | undefined,
): any[] {
  const parts: any[] = [{ type: "text", text: prompt }]

  if (images && images.length > 0) {
    for (const image of images) {
      if (!image.base64Data || !image.mediaType) continue
      parts.push({
        type: "data-image",
        data: {
          base64Data: image.base64Data,
          mediaType: image.mediaType,
          filename: image.filename,
        },
      })
    }
  }

  return parts
}

function buildModelMessageContent(
  prompt: string,
  images:
    | Array<{
        base64Data?: string
        mediaType?: string
        filename?: string
      }>
    | undefined,
): any[] {
  const content: any[] = [{ type: "text", text: prompt }]

  if (images && images.length > 0) {
    for (const image of images) {
      if (!image.base64Data || !image.mediaType) continue
      content.push({
        type: "file",
        mediaType: image.mediaType,
        data: image.base64Data,
        ...(image.filename ? { filename: image.filename } : {}),
      })
    }
  }

  return content
}

function resourcesForSessionInfo(
  resources: Awaited<ReturnType<typeof buildMossRuntimeContext>>["resources"],
  kind: "mcp" | "plugin" | "skill",
): Array<{ name: string; path?: string; source: "moss" }> {
  return resources
    .filter((resource) => resource.kind === kind && resource.included)
    .map((resource) => ({
      name: resource.name,
      path: resource.path,
      source: "moss" as const,
    }))
}

type MossHookRunSummaryForSession = Awaited<ReturnType<typeof runMossHooks>>

function summarizeMossHookRunForSession(run: MossHookRunSummaryForSession) {
  return {
    status: run.status,
    event: run.event,
    matchedCount: run.matchedCount,
    executedCount: run.executedCount,
    skippedCount: run.skippedCount,
    failedCount: run.failedCount,
    timedOutCount: run.timedOutCount,
    warnings: run.warnings,
    results: run.results.map((result) => ({
      resourceId: result.resourceId,
      name: result.name,
      status: result.status,
      exitCode: result.exitCode ?? null,
      elapsedMs: result.elapsedMs,
      timedOut: Boolean(result.timedOut),
    })),
  }
}

function extractHermesError(error: unknown): { message: string; code?: string } {
  const anyError = error as any
  const message =
    anyError?.data?.message ||
    anyError?.errorText ||
    anyError?.message ||
    anyError?.error ||
    String(error)
  const code = anyError?.data?.code || anyError?.code

  return {
    message: typeof message === "string" ? message : String(message),
    code: typeof code === "string" ? code : undefined,
  }
}

function buildHermesProviderEnv(params?: {
  mossProvider?: ResolvedMossProvider | null
}): Record<string, string> {
  const env: Record<string, string> = {}

  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      env[key] = value
    }
  }

  const shellEnv = getClaudeShellEnvironment()
  for (const [key, value] of Object.entries(shellEnv)) {
    if (typeof value === "string") {
      env[key] = value
    }
  }

  if (!env.HERMES_HOME) {
    env.HERMES_HOME = join(homedir(), ".hermes")
  }

  if (params?.mossProvider?.status === "resolved") {
    Object.assign(env, params.mossProvider.env)
  }

  return env
}

function getLaunchFingerprint(): {
  launch: { command: string; args: string[] }
  fingerprint: string
} {
  const launch = resolveHermesAcpLaunch()
  return {
    launch,
    fingerprint: createHash("sha256")
      .update(JSON.stringify(launch))
      .digest("hex"),
  }
}

function getOrCreateProvider(params: {
  subChatId: string
  cwd: string
  existingSessionId?: string
  mossProvider?: ResolvedMossProvider | null
}): ACPProvider {
  const mossProviderFingerprint = getMossProviderFingerprint(params.mossProvider)
  const { launch, fingerprint: launchFingerprint } = getLaunchFingerprint()
  const existing = providerSessions.get(params.subChatId)

  if (
    existing &&
    existing.cwd === params.cwd &&
    existing.mossProviderFingerprint === mossProviderFingerprint &&
    existing.launchFingerprint === launchFingerprint
  ) {
    return existing.provider
  }

  if (existing) {
    existing.provider.cleanup()
    providerSessions.delete(params.subChatId)
  }

  const provider = createACPProvider({
    command: launch.command,
    args: launch.args,
    env: buildHermesProviderEnv({ mossProvider: params.mossProvider }),
    ...(process.env.HERMES_ACP_AUTH_METHOD
      ? { authMethodId: process.env.HERMES_ACP_AUTH_METHOD }
      : {}),
    session: {
      cwd: params.cwd,
      mcpServers: [],
    },
    ...(params.existingSessionId
      ? { existingSessionId: params.existingSessionId }
      : {}),
    persistSession: true,
  })

  providerSessions.set(params.subChatId, {
    provider,
    cwd: params.cwd,
    mossProviderFingerprint,
    launchFingerprint,
  })

  return provider
}

function cleanupProvider(subChatId: string): void {
  const existing = providerSessions.get(subChatId)
  if (!existing) return

  existing.provider.cleanup()
  providerSessions.delete(subChatId)
}

function resolveHermesMode(mode: "plan" | "agent"): string {
  return mode === "agent" ? "accept_edits" : "default"
}

function resolveHermesModelForCall(model: string | undefined): string | undefined {
  const normalized = model?.trim()
  if (!normalized || normalized === DEFAULT_HERMES_MODEL || normalized === "hermes") {
    return undefined
  }

  return normalized
}

function cleanAssistantMessageForPersistence(message: any): any | null {
  if (!message || message.role !== "assistant") return message
  if (!Array.isArray(message.parts)) return message

  const cleanedParts = message.parts.filter(
    (part: any) => part?.state !== "input-streaming",
  )

  if (cleanedParts.length === 0) {
    return null
  }

  return {
    ...message,
    parts: cleanedParts,
  }
}

export const hermesRouter = router({
  chat: publicProcedure
    .input(
      z.object({
        subChatId: z.string(),
        chatId: z.string(),
        runId: z.string(),
        prompt: z.string(),
        model: z.string().optional(),
        providerInstanceId: z.string().min(1).optional(),
        modelSelection: runtimeModelSelectionSchema.optional(),
        cwd: z.string(),
        projectPath: z.string().optional(),
        mode: z.enum(["plan", "agent"]).default("agent"),
        permissionMode: permissionModeSchema.optional(),
        sessionId: z.string().optional(),
        forceNewSession: z.boolean().optional(),
        images: z.array(imageAttachmentSchema).optional(),
      }),
    )
    .subscription(({ input }) => {
      return observable<any>((emit) => {
        const runtimePermissionMode = input.permissionMode ?? input.mode
        const existingStream = activeStreams.get(input.subChatId)
        if (existingStream) {
          existingStream.cancelRequested = true
          existingStream.controller.abort()
          cleanupProvider(input.subChatId)
        }

        const abortController = new AbortController()
        activeStreams.set(input.subChatId, {
          runId: input.runId,
          controller: abortController,
          cancelRequested: false,
        })

        let isActive = true

        const safeEmit = (chunk: any) => {
          if (!isActive) return
          try {
            emit.next(chunk)
          } catch {
            isActive = false
          }
        }

        const safeComplete = () => {
          if (!isActive) return
          isActive = false
          try {
            emit.complete()
          } catch {
            // Ignore double completion
          }
        }

        ;(async () => {
          try {
            const db = getDatabase()
            const existingSubChat = db
              .select()
              .from(subChats)
              .where(eq(subChats.id, input.subChatId))
              .get()

            if (!existingSubChat) {
              throw new Error("Sub-chat not found")
            }

            const existingMessages = parseStoredMessages(existingSubChat.messages)
            const ignoreStoredSessionIds = shouldIgnoreMossStoredMessageSessionIds(
              existingSubChat.runtimeMetadata,
            )
            const existingRunSessionId = input.forceNewSession
              ? undefined
              : (ignoreStoredSessionIds ? undefined : input.sessionId) ??
                existingSubChat.engineSessionId ??
                (ignoreStoredSessionIds
                  ? undefined
                  : getLastSessionId(existingMessages))
            const requestedModelId = input.model?.trim() || DEFAULT_HERMES_MODEL
            const modelForCall = resolveHermesModelForCall(requestedModelId)
            const {
              providerInstanceId,
              modelSelection: runtimeModelSelection,
            } = resolveRuntimeModelSelection({
              providerInstanceId: input.providerInstanceId ?? null,
              modelSelection: input.modelSelection ?? null,
              fallbackModelId: requestedModelId,
            })
            const resolvedProjectPathFromCwd = resolveProjectPathFromWorktree(
              input.cwd,
            )
            const providerLookupPath =
              input.projectPath || resolvedProjectPathFromCwd || input.cwd
            const mossProvider = await resolveMossProviderForEngine({
              projectPath: providerLookupPath,
              engineId: "hermes",
              requestedModelId,
              createIfMissing: true,
              secretResolver: { getSecret: getMossProviderSecret },
            })
            if (mossProvider.warnings.length > 0) {
              console.warn("[hermes] Moss provider warnings:", mossProvider.warnings)
            }
            const mossRuntimeContext = await buildMossRuntimeContext({
              projectPath: providerLookupPath,
              engineId: "hermes",
            })
            if (mossRuntimeContext.warnings.length > 0) {
              console.warn(
                "[hermes] Moss runtime context warnings:",
                mossRuntimeContext.warnings,
              )
            }
            const mossHookRun = await runMossHooks({
              projectPath: providerLookupPath,
              cwd: input.cwd,
              event: "HermesSessionStart",
              engineId: "hermes",
              payload: {
                subChatId: input.subChatId,
                chatId: input.chatId,
                runId: input.runId,
                mode: input.mode,
                requestedModelId,
                runtimeContextFingerprint: mossRuntimeContext.fingerprint,
                promptSha256: createHash("sha256").update(input.prompt).digest("hex"),
              },
            })
            const mossHookSummary =
              summarizeMossHookRunForSession(mossHookRun)
            if (mossHookRun.status === "failed") {
              console.warn("[hermes] Moss hook run failed:", mossHookSummary)
            }

            const metadataModel =
              modelForCall || mossProvider.model || requestedModelId
            const lastMessage = existingMessages[existingMessages.length - 1]
            const isDuplicatePrompt =
              lastMessage?.role === "user" &&
              extractPromptFromStoredMessage(lastMessage) === input.prompt

            let messagesForStream = existingMessages
            const isAuthoritativeRun = () => {
              const currentStream = activeStreams.get(input.subChatId)
              return !currentStream || currentStream.runId === input.runId
            }

            const persistSubChatMessages = (messages: any[]) => {
              if (!isAuthoritativeRun()) {
                return false
              }

              db.update(subChats)
                .set({
                  messages: JSON.stringify(messages),
                  updatedAt: new Date(),
                })
                .where(eq(subChats.id, input.subChatId))
                .run()
              return true
            }

            if (!isDuplicatePrompt) {
              const userMessage = {
                id: crypto.randomUUID(),
                role: "user",
                parts: buildUserParts(input.prompt, input.images),
                metadata: { model: metadataModel },
              }

              messagesForStream = [...existingMessages, userMessage]

              db.update(subChats)
                .set({
                  messages: JSON.stringify(messagesForStream),
                  updatedAt: new Date(),
                })
                .where(eq(subChats.id, input.subChatId))
                .run()
            }

            if (input.forceNewSession) {
              cleanupProvider(input.subChatId)
            }

            const provider = getOrCreateProvider({
              subChatId: input.subChatId,
              cwd: input.cwd,
              existingSessionId: existingRunSessionId,
              mossProvider,
            })

            const startedAt = Date.now()
            let latestSessionId = provider.getSessionId() || existingRunSessionId
            const modeForCall = resolveHermesMode(input.mode)
            const languageModel = provider.languageModel(modelForCall, modeForCall)
            const sessionInfo = await provider.initSession()
            latestSessionId =
              provider.getSessionId() ||
              latestSessionId ||
              sessionInfo?.sessionId ||
              undefined

            safeEmit({
              type: "session-init",
              engine: "hermes",
              sessionId: latestSessionId,
              models: sessionInfo?.models,
              modes: sessionInfo?.modes,
              tools: [],
              mcpServers: resourcesForSessionInfo(
                mossRuntimeContext.resources,
                "mcp",
              ),
              plugins: resourcesForSessionInfo(
                mossRuntimeContext.resources,
                "plugin",
              ),
              skills: resourcesForSessionInfo(
                mossRuntimeContext.resources,
                "skill",
              ),
              mossUnifiedSourceContext: {
                status: mossRuntimeContext.status,
                fingerprint: mossRuntimeContext.fingerprint,
                resourceCount: mossRuntimeContext.resourceCount,
                includedResourceCount:
                  mossRuntimeContext.includedResourceCount,
                warnings: mossRuntimeContext.warnings,
              },
              mossHooks: mossHookSummary,
            })

            const persistHermesRuntimeSession = (
              resultSubtype: "success" | "error" | "cancelled" = "success",
            ) => {
              if (!isAuthoritativeRun()) return false

              persistAgentRuntimeSession({
                subChatId: input.subChatId,
                engine: "hermes",
                nativeSessionId:
                  provider.getSessionId() || latestSessionId || null,
                configDir: join(homedir(), ".hermes"),
                providerInstanceId,
                modelId: metadataModel,
                modelSelection: runtimeModelSelection,
                permissionMode: runtimePermissionMode,
                metadata: {
                  cwd: input.cwd,
                  projectPath: input.projectPath ?? null,
                  mossProviderStatus: mossProvider.status,
                  mossProviderId: mossProvider.providerId ?? null,
                  mossProviderMode: mossProvider.mode ?? null,
                  mossUnifiedSourceContext: {
                    status: mossRuntimeContext.status,
                    fingerprint: mossRuntimeContext.fingerprint,
                    resourceCount: mossRuntimeContext.resourceCount,
                    includedResourceCount:
                      mossRuntimeContext.includedResourceCount,
                  },
                  mossHooks: mossHookSummary,
                  forceNewSession: Boolean(input.forceNewSession),
                  ignoredStoredSessionIds: ignoreStoredSessionIds,
                  hasImages: Boolean(input.images?.length),
                  resultSubtype,
                },
                launchPlan: buildAgentRuntimeLaunchPlan({
                  runId: input.runId,
                  session: {
                    subChatId: input.subChatId,
                    chatId: input.chatId,
                    engineId: "hermes",
                    providerInstanceId,
                    nativeSessionId:
                      provider.getSessionId() || latestSessionId || null,
                    modelId: metadataModel,
                    modelSelection: runtimeModelSelection,
                    permissionMode: runtimePermissionMode,
                    cwd: input.cwd,
                    projectPath: input.projectPath ?? null,
                    runtimeConfigDir: join(homedir(), ".hermes"),
                  },
                  nativeSessionStrategy: existingRunSessionId ? "resume" : "start",
                  transport: "hermes-acp",
                  providerRoute:
                    mossProvider.status === "resolved"
                      ? "moss-provider"
                      : "hermes-default",
                  projectionStatus:
                    mossRuntimeContext.status === "ready" ? "ready" : "partial",
                  runtimeContextFingerprint: mossRuntimeContext.fingerprint,
                  resultSubtype,
                  metadata: {
                    mossProviderStatus: mossProvider.status,
                    mossHookStatus: mossHookSummary.status,
                  },
                }),
              })

              return true
            }

            persistHermesRuntimeSession()

            const result = streamText({
              model: languageModel,
              messages: [
                ...(mossRuntimeContext.status === "ready"
                  ? ([
                      {
                        role: "system" as const,
                        content: mossRuntimeContext.text,
                      },
                    ] as const)
                  : []),
                {
                  role: "user",
                  content: buildModelMessageContent(input.prompt, input.images),
                },
              ],
              tools: provider.tools,
              abortSignal: abortController.signal,
            })

            const uiStream = result.toUIMessageStream({
              originalMessages: messagesForStream,
              generateMessageId: () => crypto.randomUUID(),
              messageMetadata: ({ part }) => {
                const sessionId = provider.getSessionId() || undefined
                if (sessionId) {
                  latestSessionId = sessionId
                }

                if (part.type === "finish") {
                  return {
                    model: metadataModel,
                    sessionId,
                    durationMs: Date.now() - startedAt,
                    resultSubtype: part.finishReason === "error" ? "error" : "success",
                  }
                }

                if (sessionId) {
                  return {
                    model: metadataModel,
                    sessionId,
                  }
                }

                return { model: metadataModel }
              },
              onFinish: async ({ responseMessage, isContinuation }) => {
                try {
                  const cleanedResponseMessage =
                    cleanAssistantMessageForPersistence(responseMessage)

                  if (!cleanedResponseMessage) {
                    if (persistSubChatMessages(messagesForStream)) {
                      persistHermesRuntimeSession()
                    }
                    return
                  }

                  const messagesToPersist = [
                    ...(isContinuation
                      ? messagesForStream.slice(0, -1)
                      : messagesForStream),
                    cleanedResponseMessage,
                  ]

                  if (persistSubChatMessages(messagesToPersist)) {
                    persistHermesRuntimeSession()
                  }
                } catch (error) {
                  console.error("[hermes] Failed to persist messages:", error)
                  persistHermesRuntimeSession("error")
                }
              },
              onError: (error) => extractHermesError(error).message,
            })

            const reader = uiStream.getReader()
            let pendingFinishChunk: any | null = null
            while (true) {
              const { done, value } = await reader.read()
              if (done) break

              if (value?.type === "error") {
                const normalized = extractHermesError(value)
                safeEmit({ ...value, errorText: normalized.message })
                continue
              }

              if (value?.type === "finish") {
                pendingFinishChunk = value
                continue
              }

              safeEmit(value)
            }

            safeEmit(pendingFinishChunk || { type: "finish" })
            safeComplete()
          } catch (error) {
            const normalized = extractHermesError(error)
            const {
              providerInstanceId: errorProviderInstanceId,
              modelSelection: errorRuntimeModelSelection,
            } = resolveRuntimeModelSelection({
              providerInstanceId: input.providerInstanceId ?? null,
              modelSelection: input.modelSelection ?? null,
              fallbackModelId: input.model ?? DEFAULT_HERMES_MODEL,
            })

            console.error("[hermes] chat stream error:", error)
            try {
              persistAgentRuntimeSession({
                subChatId: input.subChatId,
                engine: "hermes",
                nativeSessionId: null,
                configDir: join(homedir(), ".hermes"),
                providerInstanceId: errorProviderInstanceId,
                modelId: input.model ?? DEFAULT_HERMES_MODEL,
                modelSelection: errorRuntimeModelSelection,
                permissionMode: runtimePermissionMode,
                metadata: {
                  cwd: input.cwd,
                  projectPath: input.projectPath ?? null,
                  resultSubtype: "error",
                  error: normalized.message,
                },
                launchPlan: buildAgentRuntimeLaunchPlan({
                  runId: input.runId,
                  session: {
                    subChatId: input.subChatId,
                    chatId: input.chatId,
                    engineId: "hermes",
                    providerInstanceId: errorProviderInstanceId,
                    nativeSessionId: null,
                    modelId: input.model ?? DEFAULT_HERMES_MODEL,
                    modelSelection: errorRuntimeModelSelection,
                    permissionMode: runtimePermissionMode,
                    cwd: input.cwd,
                    projectPath: input.projectPath ?? null,
                    runtimeConfigDir: join(homedir(), ".hermes"),
                  },
                  nativeSessionStrategy: "start",
                  transport: "hermes-acp",
                  providerRoute: "hermes-error",
                  resultSubtype: "error",
                  metadata: { error: normalized.message },
                }),
              })
            } catch {
              // Best-effort runtime index update only.
            }
            safeEmit({ type: "error", errorText: normalized.message })
            safeEmit({ type: "finish" })
            safeComplete()
          } finally {
            const activeStream = activeStreams.get(input.subChatId)
            if (activeStream?.runId === input.runId) {
              const shouldCleanupProvider =
                abortController.signal.aborted || activeStream.cancelRequested
              if (shouldCleanupProvider) {
                cleanupProvider(input.subChatId)
              }
              activeStreams.delete(input.subChatId)
            }
          }
        })()

        return () => {
          isActive = false
          abortController.abort()

          const activeStream = activeStreams.get(input.subChatId)
          if (activeStream?.runId === input.runId) {
            activeStream.cancelRequested = true
          }
        }
      })
    }),

  cancel: publicProcedure
    .input(
      z.object({
        subChatId: z.string(),
        runId: z.string(),
      }),
    )
    .mutation(({ input }) => {
      const activeStream = activeStreams.get(input.subChatId)
      if (!activeStream) {
        return { cancelled: false, ignoredStale: false }
      }

      if (activeStream.runId !== input.runId) {
        return { cancelled: false, ignoredStale: true }
      }

      activeStream.cancelRequested = true
      activeStream.controller.abort()

      return { cancelled: true, ignoredStale: false }
    }),

  cleanup: publicProcedure
    .input(z.object({ subChatId: z.string() }))
    .mutation(({ input }) => {
      cleanupProvider(input.subChatId)

      const activeStream = activeStreams.get(input.subChatId)
      if (activeStream) {
        activeStream.controller.abort()
        activeStreams.delete(input.subChatId)
      }

      return { success: true }
    }),
})
