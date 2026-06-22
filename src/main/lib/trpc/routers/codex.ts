import { spawn } from "node:child_process"
import { observable } from "@trpc/server/observable"
import { eq } from "drizzle-orm"
import { z } from "zod"
import {
  buildCodexCapabilityErrorChunk,
  buildCodexRuntimeStatusChunk,
  createCodexRuntimeBlocker,
} from "../../../../shared/codex-runtime-status"
import { normalizeCodexStreamChunk } from "../../../../shared/codex-tool-normalizer"
import {
  formatScopeValidationError,
  type ValidatedAgentScopeContract,
  validateAgentScopeContract,
} from "../../agent-guard"
import { resolveDesktopPermissionPolicy } from "../../agent-runtime/permission-policy"
import {
  type DesktopRunPreflightBlocker,
  DesktopRunPreflightError,
  verifyDesktopRunPreflight,
} from "../../agent-runtime/preflight"
import {
  appendRunEventsToAgentJob,
  redactRendererRuntimeChunk,
} from "../../agent-runtime/stream-event-mapper"
import { prepareChatImageAttachmentsForDesktopRun } from "../../chat-attachments"
import {
  getCodexApiKeyStatus,
  readCodexApiKey,
  removeCodexApiKey as removeStoredCodexApiKey,
  saveCodexApiKey as saveStoredCodexApiKey,
} from "../../codex/api-key-store"
import {
  CodexApiKeyValidationError,
  validateCodexApiKey,
} from "../../codex/api-key-validation"
import { createCodexAppServerAdapter } from "../../codex/app-server-adapter"
import { createCodexAppServerFinishGate } from "../../codex/app-server-finish-gate"
import { resolveCodexAppServerPluginConfigOverrides } from "../../codex/app-server-plugin-allowlist"
import type {
  CodexAskUserQuestionApproval,
  CodexAskUserQuestionPending,
} from "../../codex/ask-user-question"
import {
  buildCodexUserParts,
  codexImageAttachmentSignatureFromInput,
  codexImageAttachmentSignatureFromParts,
  codexLongTextAttachmentSignatureFromInput,
  codexLongTextAttachmentSignatureFromParts,
  extractCodexPromptFromStoredMessage,
  getLastCodexSessionId,
  parseCodexStoredMessages,
} from "../../codex/chat-history"
import { codexChatInputSchema } from "../../codex/chat-input-schema"
import { resolveBundledCodexCliPath } from "../../codex/cli-path"
import { runCodexCli } from "../../codex/cli-runner"
import { createCodexDesktopRunRequest } from "../../codex/desktop-run-request"
import {
  extractCodexError as extractCodexErrorWithProviderRedaction,
  getCodexErrorDiagnostics,
  isCodexAuthError,
} from "../../codex/errors"
import {
  getCodexIntegrationStatus,
  isCodexIntegrationConnected,
  normalizeCodexIntegrationState,
} from "../../codex/integration-status"
import {
  appendCodexLoginOutput,
  redactCodexLoginOutput,
} from "../../codex/login-output"
import {
  cancelCodexLoginSession,
  createCodexLoginSession,
  getActiveCodexLoginSession,
  getCodexLoginSession,
  toCodexLoginSessionResponse,
} from "../../codex/login-session"
import {
  normalizeCodexAppServerModelId,
  resolveCodexSelectedModelId,
} from "../../codex/model-selection"
import type { CodexProviderProfileBinding } from "../../codex/provider-runtime-binding"
import { getCodexRuntimeStatus } from "../../codex/runtime-status"
import { getDatabase, subChats } from "../../db"
import {
  completeDesktopChatAgentJobSafely,
  createAndRegisterDesktopChatAgentJob,
  requestCancelDesktopChatAgentJobSafely,
} from "../../desktop-agent-jobs"
import { assertOfficialCloudAllowed } from "../../local-only"
import { getProviderGatewayEndpoint } from "../../provider-profiles/gateway"
import { getProviderProfileRuntimeConfig } from "../../provider-profiles/storage"
import {
  addCodexMcpServer,
  type CodexMcpSnapshot,
  clearCodexMcpConfigCache,
  createEmptyCodexMcpSnapshot,
  getAllCodexMcpConfigHandler,
  logoutCodexMcpServer,
  removeCodexMcpServer,
  resolveCodexMcpSnapshotForDesktopRun,
  startCodexMcpOAuth,
} from "../../runtime-mcp-config/codex"
import { publicProcedure, router } from "../index"

export { getAllCodexMcpConfigHandler }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function buildCodexAppServerAssistantMessage(input: {
  chunks: Record<string, unknown>[]
  model: string
  generateMessageId: () => string
}): unknown | null {
  const text = input.chunks
    .filter((chunk) => chunk?.type === "text-delta")
    .map((chunk) => (typeof chunk.delta === "string" ? chunk.delta : ""))
    .join("")
  const metadataChunks = input.chunks.flatMap((chunk) =>
    chunk.type === "message-metadata" && isRecord(chunk.messageMetadata)
      ? [chunk.messageMetadata]
      : [],
  )
  const finishMetadata = [...input.chunks]
    .reverse()
    .flatMap((chunk) =>
      chunk.type === "finish" && isRecord(chunk.messageMetadata)
        ? [chunk.messageMetadata]
        : [],
    )
    .at(0)
  const metadata = {
    ...metadataChunks.at(-1),
    ...(finishMetadata || {}),
    model: input.model,
    provider: "codex",
  }

  if (!text.trim()) return null

  return normalizeCodexStreamChunk({
    id: input.generateMessageId(),
    role: "assistant",
    createdAt: new Date().toISOString(),
    parts: [{ type: "text", text }],
    metadata,
  })
}

type ActiveCodexStream = {
  runId: string
  controller: AbortController
  cancelRequested: boolean
}

const activeStreams = new Map<string, ActiveCodexStream>()
const pendingCodexToolApprovals = new Map<string, CodexAskUserQuestionPending>()

function clearPendingCodexApprovals(
  message = "Session cancelled.",
  subChatId?: string,
): void {
  for (const [toolUseId, pending] of pendingCodexToolApprovals) {
    if (subChatId && pending.subChatId !== subChatId) {
      continue
    }
    pending.resolve({ approved: false, message })
    pendingCodexToolApprovals.delete(toolUseId)
  }
}

/** Check if there are any active Codex streaming sessions */
export function hasActiveCodexStreams(): boolean {
  return activeStreams.size > 0
}

/** Abort all active Codex streams so their cleanup saves partial state */
export function abortAllCodexStreams(): void {
  for (const [subChatId, stream] of activeStreams) {
    console.log(`[codex] Aborting stream ${subChatId} before reload`)
    stream.controller.abort()
    clearPendingCodexApprovals("Session cancelled.", subChatId)
  }
  activeStreams.clear()
}

function extractCodexError(error: unknown): { message: string; code?: string } {
  return extractCodexErrorWithProviderRedaction(error, {
    redactLoginOutput: redactCodexLoginOutput,
  })
}

export const codexRouter = router({
  getRuntimeStatus: publicProcedure.query(() => getCodexRuntimeStatus()),

  getIntegration: publicProcedure.query(() => getCodexIntegrationStatus()),

  getCodexApiKeyStatus: publicProcedure.query(() => getCodexApiKeyStatus()),

  saveCodexApiKey: publicProcedure
    .input(z.object({ apiKey: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const validation = await validateCodexApiKey(input.apiKey)
      // Only refuse to store a key we know is bad. Transient/network/rate-limit
      // failures must not block save (local-first: the key may be valid and the
      // user may simply be offline) — store it but flag it unverified so the UI
      // can warn instead of silently accepting an unchecked key.
      if (
        !validation.ok &&
        (validation.category === "auth_failed" ||
          validation.category === "invalid_format")
      ) {
        throw new CodexApiKeyValidationError(validation)
      }
      const status = saveStoredCodexApiKey(input.apiKey)
      if (!validation.ok) {
        return {
          ...status,
          verified: false as const,
          warning: validation.hint
            ? `${validation.message} ${validation.hint}`
            : validation.message,
        }
      }
      return { ...status, verified: true as const }
    }),

  removeCodexApiKey: publicProcedure.mutation(() => {
    const status = removeStoredCodexApiKey()
    return status
  }),

  logout: publicProcedure.mutation(async () => {
    const logoutResult = await runCodexCli(["logout"])
    const statusResult = await runCodexCli(["login", "status"])

    const statusOutput = [statusResult.stdout, statusResult.stderr]
      .filter((chunk) => chunk.trim().length > 0)
      .join("\n")
      .trim()

    const state = normalizeCodexIntegrationState(statusOutput)
    const isConnected = isCodexIntegrationConnected(state)

    if (isConnected) {
      throw new Error("Failed to log out from Codex. Please try again.")
    }

    const logoutOutput = [logoutResult.stdout, logoutResult.stderr]
      .filter((chunk) => chunk.trim().length > 0)
      .join("\n")
      .trim()

    return {
      success: true,
      state,
      isConnected: false,
      logoutExitCode: logoutResult.exitCode,
      logoutOutput,
      statusOutput,
    }
  }),

  startLogin: publicProcedure.mutation(() => {
    const existingSession = getActiveCodexLoginSession()
    if (existingSession) {
      return toCodexLoginSessionResponse(existingSession)
    }

    const codexCliPath = resolveBundledCodexCliPath()
    const sessionId = crypto.randomUUID()

    const child = spawn(codexCliPath, ["login"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      windowsHide: true,
    })

    const session = createCodexLoginSession({
      id: sessionId,
      process: child,
    })

    const handleChunk = (chunk: Buffer | string) => {
      appendCodexLoginOutput(session, chunk.toString("utf8"))
    }

    child.stdout.on("data", handleChunk)
    child.stderr.on("data", handleChunk)

    child.once("error", (error) => {
      session.state = "error"
      session.error = `[codex] Failed to start login flow: ${error.message}`
      session.process = null
    })

    child.once("close", (exitCode) => {
      session.exitCode = exitCode
      session.process = null

      if (session.state === "cancelled") {
        return
      }

      if (exitCode === 0) {
        session.state = "success"
        session.error = null
      } else {
        session.state = "error"
        session.error =
          session.error ||
          `Codex login exited with code ${exitCode ?? "unknown"}`
      }
    })

    return toCodexLoginSessionResponse(session)
  }),

  getLoginSession: publicProcedure
    .input(
      z.object({
        sessionId: z.string(),
      }),
    )
    .query(({ input }) => {
      const session = getCodexLoginSession(input.sessionId)
      if (!session) {
        throw new Error("Codex login session not found")
      }

      return toCodexLoginSessionResponse(session)
    }),

  cancelLogin: publicProcedure
    .input(
      z.object({
        sessionId: z.string(),
      }),
    )
    .mutation(({ input }) => {
      return cancelCodexLoginSession(input.sessionId)
    }),

  getAllMcpConfig: publicProcedure.query(async () => {
    try {
      return await getAllCodexMcpConfigHandler()
    } catch (error) {
      console.error("[codex.getAllMcpConfig] Error:", error)
      return {
        groups: [],
        error: extractCodexError(error).message,
      }
    }
  }),

  refreshMcpConfig: publicProcedure.mutation(() => {
    clearCodexMcpConfigCache()
    return { success: true }
  }),

  addMcpServer: publicProcedure
    .input(
      z.object({
        name: z
          .string()
          .min(1)
          .regex(
            /^[a-zA-Z0-9_-]+$/,
            "Name must contain only letters, numbers, underscores, and hyphens",
          ),
        scope: z.enum(["global", "project"]),
        transport: z.enum(["stdio", "http"]),
        command: z.string().optional(),
        args: z.array(z.string()).optional(),
        url: z.string().url().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return addCodexMcpServer(input)
    }),

  removeMcpServer: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        scope: z.enum(["global", "project"]).default("global"),
      }),
    )
    .mutation(async ({ input }) => {
      return removeCodexMcpServer(input)
    }),

  startMcpOAuth: publicProcedure
    .input(
      z.object({
        serverName: z.string().min(1),
        projectPath: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        return await startCodexMcpOAuth(input)
      } catch (error) {
        return {
          success: false as const,
          error: extractCodexError(error).message,
        }
      }
    }),

  logoutMcpServer: publicProcedure
    .input(
      z.object({
        serverName: z.string().min(1),
        projectPath: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        return await logoutCodexMcpServer(input)
      } catch (error) {
        return {
          success: false as const,
          error: extractCodexError(error).message,
        }
      }
    }),

  chat: publicProcedure
    .input(codexChatInputSchema)
    .subscription(({ input }) => {
      return observable<any>((emit) => {
        const existingStream = activeStreams.get(input.subChatId)
        if (existingStream) {
          existingStream.cancelRequested = true
          existingStream.controller.abort()
        }

        const abortController = new AbortController()
        activeStreams.set(input.subChatId, {
          runId: input.runId,
          controller: abortController,
          cancelRequested: false,
        })

        let isActive = true
        let desktopJobId: string | null = null
        let desktopJobSawError = false
        let desktopJobReachedNaturalFinish = false
        let desktopJobAdapterFailed = false
        let desktopJobDb: ReturnType<typeof getDatabase> | null = null
        const appServerPersistenceChunks: Record<string, unknown>[] = []

        const emitRendererChunk = (chunk: Record<string, unknown>) => {
          if (!isActive) return
          try {
            const rendererChunk = redactRendererRuntimeChunk({
              runtimeId: "codex",
              runId: input.runId,
              jobId: desktopJobId,
              chunk,
            })
            emit.next(rendererChunk)
          } catch {
            isActive = false
          }
        }

        const appServerFinishGate = createCodexAppServerFinishGate({
          enabled: () => true,
          emit: emitRendererChunk,
        })

        const safeEmit = (chunk: Record<string, unknown>) => {
          appServerPersistenceChunks.push(chunk)
          if (
            chunk?.type === "error" ||
            chunk?.type === "auth-error" ||
            chunk?.type === "capability-error" ||
            (chunk?.type === "runtime-status" && chunk?.ok === false)
          ) {
            desktopJobSawError = true
          }
          appServerFinishGate.emit(chunk)
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

        let guardedContract: ValidatedAgentScopeContract | null = null

        ;(async () => {
          try {
            const db = getDatabase()
            desktopJobDb = db
            const verifiedRunContext = verifyDesktopRunPreflight(db, {
              chatId: input.chatId,
              subChatId: input.subChatId,
              cwd: input.cwd,
            })
            const runtimeCwd = verifiedRunContext.cwd

            if (input.scopeContract) {
              try {
                const validated = await validateAgentScopeContract(
                  input.scopeContract,
                  {
                    cwd: runtimeCwd,
                    projectPath: input.projectPath,
                    chatId: input.chatId,
                    subChatId: input.subChatId,
                    runId: input.runId,
                  },
                )
                guardedContract = {
                  ...validated,
                  runId: validated.runId ?? input.runId,
                }
              } catch (guardError) {
                safeEmit({
                  type: "error",
                  errorText: `Guarded run contract rejected: ${formatScopeValidationError(guardError)}`,
                })
                safeEmit({ type: "finish" })
                safeComplete()
                return
              }
            }
            const permissionPolicy = resolveDesktopPermissionPolicy({
              runtimeId: "codex",
              mode: input.mode,
              workspaceKind: verifiedRunContext.kind,
              hasScopeContract: Boolean(guardedContract),
              codexAdapterSource: "codex-app-server",
            })

            const emitPreflightBlocker = (
              blocker: DesktopRunPreflightBlocker,
              chunks: Record<string, unknown>[] = [],
            ) => {
              for (const chunk of chunks) safeEmit(chunk)
              const error = new DesktopRunPreflightError(blocker)
              safeEmit({
                type: blocker.status === "needs-auth" ? "auth-error" : "error",
                errorText: blocker.hint
                  ? `${error.message} ${blocker.hint}`
                  : error.message,
              })
              safeEmit({ type: "finish" })
              safeComplete()
            }
            const emitLocalOnlyPreflightBlocker = (
              operation: string,
              url?: string | null,
            ) => {
              try {
                assertOfficialCloudAllowed(operation, url)
                return false
              } catch (localOnlyError) {
                const message =
                  localOnlyError instanceof Error
                    ? localOnlyError.message
                    : String(localOnlyError)
                const blocker = createCodexRuntimeBlocker({
                  id: "local-only",
                  label: "Local-only policy",
                  status: "blocked",
                  ok: false,
                  message,
                  hint: "Choose a user-configured provider endpoint that is not an official upstream hosted URL, or explicitly disable local-only mode for hosted/internal testing.",
                })
                emitPreflightBlocker(
                  {
                    id: "local-only",
                    status: "blocked",
                    message: blocker.message,
                    hint: blocker.hint,
                  },
                  [
                    buildCodexRuntimeStatusChunk(blocker),
                    buildCodexCapabilityErrorChunk(blocker),
                  ],
                )
                return true
              }
            }

            const runtimeStatus = await getCodexRuntimeStatus()
            if (!runtimeStatus.ok) {
              const blocker =
                runtimeStatus.blockers[0] ??
                createCodexRuntimeBlocker({
                  id: "login-cli",
                  label: "Codex runtime",
                  status: "failed",
                  ok: false,
                  message: "Codex runtime is unavailable.",
                  hint: "Check Codex runtime status and try again.",
                })
              emitPreflightBlocker(
                {
                  id: "unsupported-capability",
                  status: "blocked",
                  message: blocker.message,
                  hint: blocker.hint,
                },
                [buildCodexRuntimeStatusChunk(blocker)],
              )
              return
            }

            const existingSubChat = db
              .select()
              .from(subChats)
              .where(eq(subChats.id, input.subChatId))
              .get()

            if (!existingSubChat) {
              throw new Error("Sub-chat not found")
            }

            const existingMessages = parseCodexStoredMessages(
              existingSubChat.messages,
            )
            const imageAttachments =
              await prepareChatImageAttachmentsForDesktopRun({
                images: input.images,
                emitPreflightBlocker,
              })
            if (!imageAttachments.ok) {
              return
            }
            const resolvedImages = imageAttachments.attachments
            let codexProviderProfile:
              | {
                  id: string
                  name: string
                  baseUrl: string
                  token: string
                  defaultModel: string
                }
              | undefined
            let appManagedCodexApiKey: string | null = null
            const wantsAppManagedCodexApiKey =
              input.codexAuthMethod === "api_key" && !input.providerProfileId

            if (input.providerProfileId) {
              const profile = getProviderProfileRuntimeConfig(
                input.providerProfileId,
              )
              if (!profile || !profile.targetRuntimes.includes("codex")) {
                const blocker = createCodexRuntimeBlocker({
                  id: "provider-profile",
                  label: "Codex provider profile",
                  status: "unavailable",
                  ok: false,
                  message: "Provider profile is not available for Codex.",
                  hint: "Choose a provider profile that targets Codex.",
                })
                emitPreflightBlocker(
                  {
                    id: "provider-profile",
                    status: "blocked",
                    message: blocker.message,
                    hint: blocker.hint,
                  },
                  [
                    buildCodexRuntimeStatusChunk(blocker),
                    buildCodexCapabilityErrorChunk(blocker),
                  ],
                )
                return
              }
              if (
                emitLocalOnlyPreflightBlocker(
                  "use Codex provider endpoint",
                  profile.baseUrl,
                )
              ) {
                return
              }
              const gateway = await getProviderGatewayEndpoint(
                profile.id,
                "responses",
              )
              codexProviderProfile = {
                id: profile.id,
                name: profile.name,
                baseUrl: gateway.baseUrl,
                token: gateway.token,
                defaultModel: profile.defaultModel,
              }
            } else if (wantsAppManagedCodexApiKey) {
              appManagedCodexApiKey = readCodexApiKey()
              if (!appManagedCodexApiKey) {
                const blocker = createCodexRuntimeBlocker({
                  id: "login",
                  label: "Codex API key",
                  status: "needs-auth",
                  ok: false,
                  message: "Saved Codex API key is required.",
                  hint: "Save a Codex API key again from onboarding or Settings > Models.",
                })
                emitPreflightBlocker(
                  {
                    id: "provider-profile",
                    status: "needs-auth",
                    message: blocker.message,
                    hint: blocker.hint,
                  },
                  [
                    buildCodexRuntimeStatusChunk(blocker),
                    buildCodexCapabilityErrorChunk(blocker),
                  ],
                )
                return
              }

              const apiKeyValidation = await validateCodexApiKey(
                appManagedCodexApiKey,
                { signal: abortController.signal },
              )
              if (!apiKeyValidation.ok) {
                if (
                  apiKeyValidation.category === "cancelled" &&
                  abortController.signal.aborted
                ) {
                  safeEmit({ type: "finish", finishReason: "stop" })
                  safeComplete()
                  return
                }

                const blocker = createCodexRuntimeBlocker({
                  id: "login",
                  label: "Codex API key",
                  status: apiKeyValidation.status,
                  ok: false,
                  message: apiKeyValidation.message,
                  hint: apiKeyValidation.hint,
                })
                emitPreflightBlocker(
                  {
                    id: "provider-profile",
                    status:
                      apiKeyValidation.status === "needs-auth"
                        ? "needs-auth"
                        : "blocked",
                    message: blocker.message,
                    hint: blocker.hint,
                  },
                  [
                    buildCodexRuntimeStatusChunk(blocker),
                    buildCodexCapabilityErrorChunk(blocker),
                  ],
                )
                return
              }
            } else {
              const integration = await getCodexIntegrationStatus()
              if (!integration.isConnected) {
                const blocker = createCodexRuntimeBlocker({
                  id: "login",
                  label: "Codex login",
                  status: "needs-auth",
                  ok: false,
                  message: "Codex login or API key is required.",
                  hint: "Connect Codex with ChatGPT login or choose a Codex API key/provider profile.",
                })
                emitPreflightBlocker(
                  {
                    id: "provider-profile",
                    status: "needs-auth",
                    message: blocker.message,
                    hint: blocker.hint,
                  },
                  [
                    buildCodexRuntimeStatusChunk(blocker),
                    buildCodexCapabilityErrorChunk(blocker),
                  ],
                )
                return
              }
            }
            const selectedModelId = resolveCodexSelectedModelId({
              requestedModel: input.model,
              hasAppManagedApiKey: Boolean(appManagedCodexApiKey),
            })
            const appServerSelectedModelId =
              !codexProviderProfile
                ? normalizeCodexAppServerModelId(selectedModelId)
                : selectedModelId
            const metadataModel =
              codexProviderProfile?.defaultModel ?? appServerSelectedModelId

            const lastMessage = existingMessages[existingMessages.length - 1]
            const isDuplicatePrompt =
              lastMessage?.role === "user" &&
              extractCodexPromptFromStoredMessage(lastMessage) ===
                input.prompt &&
              codexLongTextAttachmentSignatureFromParts(lastMessage?.parts) ===
                codexLongTextAttachmentSignatureFromInput(
                  input.longTextAttachments,
                ) &&
              codexImageAttachmentSignatureFromParts(lastMessage?.parts) ===
                codexImageAttachmentSignatureFromInput(input.images)

            let messagesForStream = existingMessages
            const isAuthoritativeRun = () => {
              const currentStream = activeStreams.get(input.subChatId)
              return !currentStream || currentStream.runId === input.runId
            }

            const persistSubChatMessages = (messages: unknown[]) => {
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
                createdAt: new Date().toISOString(),
                parts: buildCodexUserParts(
                  input.prompt,
                  input.images,
                  input.longTextAttachments,
                ),
                metadata: { model: metadataModel, provider: "codex" },
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

            let mcpSnapshot: CodexMcpSnapshot = createEmptyCodexMcpSnapshot({
              toolsResolved: false,
            })
            try {
              mcpSnapshot = await resolveCodexMcpSnapshotForDesktopRun({
                projectPath: input.projectPath,
                runtimeCwd,
              })
            } catch (mcpError) {
              const message = extractCodexError(mcpError).message
              const blocker = createCodexRuntimeBlocker({
                id: "mcp",
                label: "Codex MCP configuration",
                status: "failed",
                ok: false,
                message: `Codex MCP configuration failed: ${message}`,
                hint: "Fix Codex MCP configuration or disable the failing MCP server.",
              })
              console.error("[codex] Failed to resolve MCP servers:", message)
              emitPreflightBlocker(
                {
                  id: "mcp",
                  status: "blocked",
                  message: blocker.message,
                  hint: blocker.hint,
                },
                [
                  buildCodexRuntimeStatusChunk(blocker),
                  buildCodexCapabilityErrorChunk(blocker),
                ],
              )
              return
            }

            const needsAuthMcpServer = mcpSnapshot.groups
              .flatMap((group) => group.mcpServers)
              .find(
                (server) => server.needsAuth || server.status === "needs-auth",
              )
            if (needsAuthMcpServer) {
              const blocker = createCodexRuntimeBlocker({
                id: "mcp",
                label: "Codex MCP auth",
                status: "needs-auth",
                ok: false,
                message: `Codex MCP server '${needsAuthMcpServer.name}' needs authentication.`,
                hint: "Authenticate the MCP server before starting this Codex run.",
              })
              emitPreflightBlocker(
                {
                  id: "mcp",
                  status: "needs-auth",
                  message: blocker.message,
                  hint: blocker.hint,
                },
                [
                  buildCodexRuntimeStatusChunk(blocker),
                  buildCodexCapabilityErrorChunk(blocker),
                ],
              )
              return
            }

            const desktopJob = createAndRegisterDesktopChatAgentJob(db, {
              runtime: "codex",
              mode: input.mode,
              chatId: input.chatId,
              subChatId: input.subChatId,
              cwd: runtimeCwd,
              prompt: input.prompt,
              runId: input.runId,
              permissionPolicy,
              cancel: () => {
                const activeStream = activeStreams.get(input.subChatId)
                if (activeStream?.runId !== input.runId) return
                activeStream.cancelRequested = true
                activeStream.controller.abort()
                clearPendingCodexApprovals(
                  "Session cancelled.",
                  input.subChatId,
                )
              },
            })
            desktopJobId = desktopJob.job.id

            const desktopRunRequest = createCodexDesktopRunRequest({
              runId: input.runId,
              jobId: desktopJobId,
              mode: input.mode,
              preflight: verifiedRunContext,
              prompt: input.prompt,
              permissionPolicy,
              providerBinding: {
                model: metadataModel,
                modelSource: input.model ? "request" : "default",
                providerProfileId: codexProviderProfile?.id ?? null,
                gatewayEndpoint: codexProviderProfile?.baseUrl ?? null,
                authMode: codexProviderProfile
                  ? "provider-profile"
                  : appManagedCodexApiKey
                    ? "app-managed"
                    : "runtime-managed",
              },
              mcpServers: mcpSnapshot.mcpServersForSession,
              images: input.images,
              longTextAttachments: input.longTextAttachments,
              signal: abortController.signal,
              resumeSessionId: input.forceNewSession
                ? null
                : (input.sessionId ??
                  getLastCodexSessionId(existingMessages) ??
                  null),
              parentSessionId: input.sessionId ?? null,
              emitTrace: (event) => {
                appendRunEventsToAgentJob(db, [event])
              },
            })

            const appServerPluginConfig =
              await resolveCodexAppServerPluginConfigOverrides({
                projectId: desktopRunRequest.context.projectId,
                chatId: desktopRunRequest.context.chatId,
                subChatId: desktopRunRequest.context.subChatId,
              })

            const codexAdapter = createCodexAppServerAdapter({
              enabled: true,
              experimentalApi:
                process.env.LOCUS_CODEX_APP_SERVER_EXPERIMENTAL_API === "1" ||
                process.env.LOCUS_CODEX_APP_SERVER_CONTROLLED_EDIT_EXECUTOR ===
                  "1",
              // Smoke-only diagnostic hook for the 6.8 apply_patch
              // enablement probe. Product app-server runs leave this
              // unset unless a developer explicitly opts into the env gate.
              configOverrides:
                process.env.LOCUS_CODEX_APP_SERVER_APPLY_PATCH_EXPERIMENT ===
                "1"
                  ? {
                      "features.apply_patch_freeform": true,
                      "features.apply_patch_streaming_events": true,
                      include_apply_patch_tool: true,
                      "tools.apply_patch.enabled": true,
                      "tools.apply_patch.approval_mode": "prompt",
                      "model_providers.locus_profile.apply_patch_tool_type":
                        "freeform",
                      "model_providers.locus_profile.experimental_supported_tools":
                        ["apply_patch"],
                    }
                  : undefined,
              providerGatewayToken: codexProviderProfile?.token ?? null,
              appManagedApiKey: codexProviderProfile
                ? null
                : appManagedCodexApiKey,
              pluginConfig: appServerPluginConfig,
              controlledEditEnabled:
                process.env.LOCUS_CODEX_APP_SERVER_CONTROLLED_EDIT_EXECUTOR ===
                "1",
              resolvedImages,
              guardedContract,
              emit: safeEmit,
              registerPendingQuestion: (toolUseId, pending) => {
                pendingCodexToolApprovals.set(toolUseId, pending)
              },
              unregisterPendingQuestion: (toolUseId) => {
                pendingCodexToolApprovals.delete(toolUseId)
              },
            })

            await appServerFinishGate.runWithDeferredFinish(
              () => codexAdapter.run(desktopRunRequest),
              (adapterResult) => {
                desktopJobAdapterFailed = adapterResult.status === "failed"
                if (desktopJobAdapterFailed) {
                  desktopJobSawError = true
                  const adapterAlreadyEmittedError =
                    appServerPersistenceChunks.some(
                      (chunk) => chunk?.type === "error",
                    )
                  const adapterAlreadyEmittedFinish =
                    appServerPersistenceChunks.some(
                      (chunk) => chunk?.type === "finish",
                    )
                  if (!adapterAlreadyEmittedError) {
                    safeEmit({
                      type: "error",
                      errorText:
                        adapterResult.error?.message ??
                        "Codex desktop adapter failed.",
                    })
                  }
                  if (!adapterAlreadyEmittedFinish) {
                    safeEmit({ type: "finish" })
                  }
                }
                desktopJobReachedNaturalFinish =
                  adapterResult.status === "succeeded" && !desktopJobSawError
                if (desktopJobReachedNaturalFinish) {
                  const appServerAssistantMessage =
                    buildCodexAppServerAssistantMessage({
                      chunks: appServerPersistenceChunks,
                      model: metadataModel,
                      generateMessageId: () => crypto.randomUUID(),
                    })
                  if (appServerAssistantMessage) {
                    persistSubChatMessages([
                      ...messagesForStream,
                      appServerAssistantMessage,
                    ])
                  }
                }
              },
            )
            safeComplete()
          } catch (error) {
            const normalized = extractCodexError(error)

            console.error("[codex] chat stream error", {
              subChatId: input.subChatId.slice(-8),
              ...getCodexErrorDiagnostics(error),
              message: normalized.message,
            })
            if (isCodexAuthError(normalized)) {
              safeEmit({ type: "auth-error", errorText: normalized.message })
            } else {
              safeEmit({ type: "error", errorText: normalized.message })
            }
            safeEmit({ type: "finish" })
            safeComplete()
          } finally {
            if (desktopJobId) {
              const jobDb = desktopJobDb ?? getDatabase()
              completeDesktopChatAgentJobSafely(jobDb, {
                jobId: desktopJobId,
                runtime: "codex",
                aborted:
                  abortController.signal.aborted && !desktopJobAdapterFailed,
                reachedNaturalFinish: desktopJobReachedNaturalFinish,
                sawError: desktopJobSawError || desktopJobAdapterFailed,
                result: {
                  runtime: "codex",
                  subChatId: input.subChatId,
                  chatId: input.chatId,
                  runId: input.runId,
                },
              })
            }
            const activeStream = activeStreams.get(input.subChatId)
            if (activeStream?.runId === input.runId) {
              clearPendingCodexApprovals("Session cancelled.", input.subChatId)
              activeStreams.delete(input.subChatId)
            }
          }
        })()

        return () => {
          isActive = false
          requestCancelDesktopChatAgentJobSafely(
            desktopJobDb ?? getDatabase(),
            {
              jobId: desktopJobId,
              sawError: desktopJobSawError,
              reachedNaturalFinish: desktopJobReachedNaturalFinish,
              requestedBy: "desktop-chat",
            },
          )
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
      clearPendingCodexApprovals("Session cancelled.", input.subChatId)

      return { cancelled: true, ignoredStale: false }
    }),

  respondToolApproval: publicProcedure
    .input(
      z.object({
        toolUseId: z.string(),
        approved: z.boolean(),
        message: z.string().optional(),
        updatedInput: z.unknown().optional(),
      }),
    )
    .mutation(({ input }) => {
      const pending = pendingCodexToolApprovals.get(input.toolUseId)
      if (!pending) {
        return { ok: false }
      }
      const response: CodexAskUserQuestionApproval = {
        approved: input.approved,
        message: input.message,
        updatedInput: input.updatedInput,
      }
      pending.resolve(response)
      pendingCodexToolApprovals.delete(input.toolUseId)
      return { ok: true }
    }),

  cleanup: publicProcedure
    .input(z.object({ subChatId: z.string() }))
    .mutation(({ input }) => {
      const activeStream = activeStreams.get(input.subChatId)
      if (activeStream) {
        activeStream.controller.abort()
        clearPendingCodexApprovals("Session cancelled.", input.subChatId)
        activeStreams.delete(input.subChatId)
      }

      return { success: true }
    }),
})
