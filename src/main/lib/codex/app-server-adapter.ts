import { CODEX_APP_SERVER_DESKTOP_ADAPTER_METADATA } from "../agent-runtime/desktop-adapter-metadata"
import type {
  DesktopRunRequest,
  DesktopRunResult,
} from "../agent-runtime/desktop-run-request"
import { emitDesktopRuntimeAdapterStarted } from "../agent-runtime/desktop-runner"
import {
  getCodexAppServerPermissionMapping,
  type CodexAppServerPermissionMapping,
} from "../agent-runtime/permission-policy"
import { mapDesktopStreamChunkToRunEvents } from "../agent-runtime/stream-event-mapper"
import type { ResolvedChatImageAttachment } from "../../../shared/chat-attachments"
import type { ValidatedAgentScopeContract } from "../agent-guard"
import type { CodexDesktopAdapter } from "./adapter-types"
import {
  createCodexAppServerApprovalBridge,
  type CodexAppServerApplyPatchApprovalParams,
  type CodexAppServerCommandExecutionRequestApprovalParams,
  type CodexAppServerExecCommandApprovalParams,
  type CodexAppServerFileChangeRequestApprovalParams,
  type CodexAppServerPermissionsRequestApprovalParams,
} from "./app-server-approval"
import {
  buildCodexControlledEditDynamicToolSpec,
  codexControlledEditDeveloperInstructions,
  type CodexAppServerDynamicToolCallParams,
  type CodexAppServerDynamicToolSpec,
} from "./app-server-controlled-edit"
import {
  buildCodexAppServerUserInputItems,
  prepareCodexAppServerPromptWithLongText,
} from "./app-server-attachments"
import {
  buildCodexAppServerProviderBinding,
  type CodexAppServerProviderBinding,
} from "./app-server-provider-binding"
import { assertNoCodexAppServerRendererSecrets } from "./app-server-provider-binding"
import {
  dispatchCodexAppServerServerRequest,
  type CodexAppServerServerRequest,
} from "./app-server-safety"
import {
  createCodexAppServerRuntimeEventMapper,
  type CodexAppServerNotification,
} from "./app-server-stream-events"
import {
  assertCodexAppServerShellSnapshotsScrubbed,
  scrubCodexAppServerShellSnapshots,
} from "./app-server-shell-snapshots"
import {
  createCodexAppServerUserInteractionBridge,
  buildCodexAppServerMcpElicitationResponse,
  buildCodexAppServerUserInputResponse,
  type CodexAppServerMcpElicitationRequestParams,
  type CodexAppServerToolRequestUserInputParams,
} from "./app-server-user-interaction"
import {
  createCodexAppServerStdioTransport,
  type CodexAppServerTransport,
  type CodexAppServerTransportServerRequest,
} from "./app-server-transport"
import type { CodexAskUserQuestionPending } from "./ask-user-question"

export type CreateCodexAppServerAdapterInput = {
  enabled?: boolean
  experimentalApi?: boolean
  configOverrides?: Record<string, unknown>
  pluginConfigOverrides?: Record<string, boolean>
  createTransport?: (input: {
    request: DesktopRunRequest
    providerBinding: CodexAppServerProviderBinding
  }) => CodexAppServerTransport
  providerGatewayToken?: string | null
  appManagedApiKey?: string | null
  controlledEditEnabled?: boolean
  processEnv?: NodeJS.ProcessEnv
  shellEnv?: NodeJS.ProcessEnv
  resolvedImages?: ResolvedChatImageAttachment[]
  guardedContract?: ValidatedAgentScopeContract | null
  emit?: (chunk: Record<string, unknown>) => void
  registerPendingQuestion?: (
    toolUseId: string,
    pending: CodexAskUserQuestionPending,
  ) => void
  unregisterPendingQuestion?: (toolUseId: string) => void
  userInputTimeoutMs?: number
}

export class CodexAppServerAdapterDisabledError extends Error {
  constructor() {
    super("Codex app-server adapter is behind an explicit gate and is not enabled.")
    this.name = "CodexAppServerAdapterDisabledError"
  }
}

export class CodexAppServerPermissionPolicyError extends Error {
  constructor() {
    super(
      "Codex app-server permission policy mapping is not available; refusing app-server startup.",
    )
    this.name = "CodexAppServerPermissionPolicyError"
  }
}

function assertCodexAppServerPermissionPolicyReady(
  request: DesktopRunRequest,
): CodexAppServerPermissionMapping {
  try {
    const permission = getCodexAppServerPermissionMapping(
      request.permissionPolicy,
    )
    if (
      permission.requiresApprovalGate &&
      permission.approvalHook.required &&
      permission.approvalHook.missing === "fail-closed" &&
      permission.approvalHook.delayed === "fail-closed"
    ) {
      return permission
    }
  } catch {
    throw new CodexAppServerPermissionPolicyError()
  }

  throw new CodexAppServerPermissionPolicyError()
}

function sandboxForRequest(request: DesktopRunRequest) {
  if (request.context.mode === "plan") {
    return {
      threadSandbox: "read-only",
      turnSandbox: { type: "readOnly", networkAccess: false },
    } as const
  }

  return {
    threadSandbox: "workspace-write",
    turnSandbox: {
      type: "workspaceWrite",
      writableRoots: [request.context.cwd],
      networkAccess: false,
      excludeTmpdirEnvVar: true,
      excludeSlashTmp: true,
    },
  } as const
}

function stringAt(value: unknown, path: string[]): string | null {
  let current = value
  for (const key of path) {
    if (typeof current !== "object" || current === null) return null
    current = (current as Record<string, unknown>)[key]
  }
  return typeof current === "string" ? current : null
}

function arrayAt(value: unknown, path: string[]): unknown[] {
  let current = value
  for (const key of path) {
    if (typeof current !== "object" || current === null) return []
    current = (current as Record<string, unknown>)[key]
  }
  return Array.isArray(current) ? current : []
}

function appServerMcpStatusSummary(value: unknown): {
  serverCount: number
  readyServerCount: number
  serverNames: string[]
  authStatuses: string[]
} {
  const servers = arrayAt(value, ["data"])
  const serverNames: string[] = []
  const authStatuses: string[] = []
  let readyServerCount = 0

  for (const server of servers) {
    if (typeof server !== "object" || server === null) continue
    const record = server as Record<string, unknown>
    const name = typeof record.name === "string" ? record.name : null
    if (name) serverNames.push(name)
    const authStatus =
      typeof record.authStatus === "string" ? record.authStatus : null
    if (authStatus) authStatuses.push(authStatus)
    const tools =
      typeof record.tools === "object" && record.tools !== null
        ? Object.keys(record.tools as Record<string, unknown>)
        : []
    if (
      tools.length > 0 ||
      authStatus === "unsupported" ||
      authStatus === "bearerToken" ||
      authStatus === "oAuth"
    ) {
      readyServerCount += 1
    }
  }

  return {
    serverCount: servers.length,
    readyServerCount,
    serverNames,
    authStatuses,
  }
}

function buildThreadStartParams(input: {
  request: DesktopRunRequest
  providerBinding: CodexAppServerProviderBinding
  permission: CodexAppServerPermissionMapping
  threadSandbox: "read-only" | "workspace-write"
  config: Record<string, unknown>
  dynamicTools?: CodexAppServerDynamicToolSpec[] | null
  developerInstructions?: string | null
}) {
  const params: Record<string, unknown> = {
    model: input.request.providerBinding.model ?? null,
    modelProvider: input.providerBinding.client.modelProvider ?? null,
    cwd: input.request.context.cwd,
    approvalPolicy: input.permission.appServerApprovalPolicy,
    approvalsReviewer: "user",
    sandbox: input.threadSandbox,
    config: Object.keys(input.config).length > 0 ? input.config : null,
    serviceName: "locus",
    ephemeral: false,
    sessionStartSource: "startup",
    threadSource: "user",
  }
  if (input.dynamicTools?.length) {
    params.dynamicTools = input.dynamicTools
  }
  if (input.developerInstructions) {
    params.developerInstructions = input.developerInstructions
  }
  return params
}

function buildThreadResumeParams(input: {
  request: DesktopRunRequest
  providerBinding: CodexAppServerProviderBinding
  permission: CodexAppServerPermissionMapping
  threadSandbox: "read-only" | "workspace-write"
  config: Record<string, unknown>
  threadId: string
}) {
  return {
    threadId: input.threadId,
    model: input.request.providerBinding.model ?? null,
    modelProvider: input.providerBinding.client.modelProvider ?? null,
    cwd: input.request.context.cwd,
    approvalPolicy: input.permission.appServerApprovalPolicy,
    approvalsReviewer: "user",
    sandbox: input.threadSandbox,
    config: Object.keys(input.config).length > 0 ? input.config : null,
  }
}

function defaultServerRequestResponse(
  request: CodexAppServerTransportServerRequest,
): unknown {
  switch (request.method) {
    case "item/commandExecution/requestApproval":
      return { decision: "decline" }
    case "item/fileChange/requestApproval":
      return { decision: "decline" }
    case "item/permissions/requestApproval":
      return {
        permissions: {},
        scope: "turn",
        strictAutoReview: true,
      }
    case "item/tool/requestUserInput":
      return buildCodexAppServerUserInputResponse(
        request.params as CodexAppServerToolRequestUserInputParams,
        { approved: false, message: "Codex app-server adapter has no user-input bridge installed." },
      )
    case "mcpServer/elicitation/request":
      return buildCodexAppServerMcpElicitationResponse(
        request.params as CodexAppServerMcpElicitationRequestParams,
        { approved: false, message: "Codex app-server adapter has no MCP elicitation bridge installed." },
      )
    case "account/chatgptAuthTokens/refresh":
    case "attestation/generate":
    case "item/tool/call":
    case "applyPatchApproval":
    case "execCommandApproval":
      throw new Error(
        `Codex app-server server request ${request.method} is not supported by this adapter.`,
      )
    default:
      throw new Error(
        `Unknown Codex app-server server request method refused by default: ${request.method}.`,
      )
  }
}

export function createCodexAppServerAdapter({
  enabled = false,
  experimentalApi = false,
  configOverrides,
  pluginConfigOverrides,
  createTransport,
  providerGatewayToken = null,
  appManagedApiKey = null,
  controlledEditEnabled = false,
  processEnv = process.env,
  shellEnv,
  resolvedImages = [],
  guardedContract = null,
  emit,
  registerPendingQuestion,
  unregisterPendingQuestion,
  userInputTimeoutMs,
}: CreateCodexAppServerAdapterInput = {}): CodexDesktopAdapter {
  return {
    metadata: CODEX_APP_SERVER_DESKTOP_ADAPTER_METADATA,

    async run(request: DesktopRunRequest): Promise<DesktopRunResult> {
      emitDesktopRuntimeAdapterStarted(
        request,
        CODEX_APP_SERVER_DESKTOP_ADAPTER_METADATA,
      )

      if (!enabled) {
        throw new CodexAppServerAdapterDisabledError()
      }

      assertNoCodexAppServerRendererSecrets(request, "request")
      const permission = assertCodexAppServerPermissionPolicyReady(request)

      const providerBinding = buildCodexAppServerProviderBinding({
        request,
        processEnv,
        shellEnv,
        providerGatewayToken,
        appManagedApiKey,
      })
      assertCodexAppServerShellSnapshotsScrubbed(
        scrubCodexAppServerShellSnapshots({
          runtimeEnv: providerBinding.runtimeEnv,
        }),
        "pre-start",
      )
      const transport =
        createTransport?.({ request, providerBinding }) ??
        createCodexAppServerStdioTransport({
          cwd: request.context.cwd,
          env: providerBinding.runtimeEnv,
        })
      const runtimeMapper = createCodexAppServerRuntimeEventMapper()
      const { threadSandbox, turnSandbox } = sandboxForRequest(request)
      const controlledEditToolEnabled =
        controlledEditEnabled &&
        experimentalApi &&
        request.context.mode === "agent" &&
        permission.controlLevel === "guarded" &&
        Boolean(guardedContract)
      const userInteractionBridge =
        emit && registerPendingQuestion && unregisterPendingQuestion
          ? createCodexAppServerUserInteractionBridge({
              subChatId: request.context.subChatId,
              emit,
              registerPending: registerPendingQuestion,
              unregisterPending: unregisterPendingQuestion,
              timeoutMs: userInputTimeoutMs,
            })
          : null
      const approvalBridge = createCodexAppServerApprovalBridge({
        subChatId: request.context.subChatId,
        permission,
        controlledEditEnabled: controlledEditToolEnabled,
        guardedContract,
        emit,
        registerPendingQuestion,
        unregisterPendingQuestion,
        timeoutMs: userInputTimeoutMs,
        onGuardEvent: (event) => {
          emit?.({ type: "guard-event", event })
        },
        onObservedToolDecision: (event) => {
          emit?.({ type: "observed-tool-decision", ...event })
        },
      })
      let sequence = 0
      let lastError: DesktopRunResult["error"] | null = null
      let finishRun: ((result: DesktopRunResult) => void) | null = null
      const emittedSessionInitThreadIds = new Set<string>()

      const emitChunk = (chunk: Record<string, unknown>) => {
        if (chunk.type === "session-init") {
          const threadId = typeof chunk.threadId === "string" ? chunk.threadId : null
          if (threadId && emittedSessionInitThreadIds.has(threadId)) {
            return
          }
          if (threadId) {
            emittedSessionInitThreadIds.add(threadId)
          }
        }
        emit?.(chunk)
        const events = mapDesktopStreamChunkToRunEvents({
          runtimeId: "codex",
          runId: request.identity.runId,
          jobId: request.identity.jobId,
          sequence: ++sequence,
          chunk,
        })
        for (const event of events) {
          request.trace.emit(event)
        }
      }

      const terminal = new Promise<DesktopRunResult>((resolve) => {
        let settled = false
        const removeNotification = transport.onNotification((notification) => {
          const chunks = runtimeMapper.map(
            notification as CodexAppServerNotification,
          )
          for (const chunk of chunks) {
            emitChunk(chunk)
            if (chunk.type === "error") {
              lastError = {
                message:
                  typeof chunk.errorText === "string"
                    ? chunk.errorText
                    : "Codex app-server error",
              }
            }
            if (chunk.type === "finish") {
              const metadata = chunk.messageMetadata as
                | {
                    sessionId?: string | null
                    inputTokens?: number
                    outputTokens?: number
                    totalTokens?: number
                  }
                | undefined
              finishRun?.({
                status:
                  chunk.status === "failed" ||
                  chunk.status === "canceled" ||
                  chunk.status === "interrupted" ||
                  chunk.status === "succeeded"
                    ? chunk.status
                    : "succeeded",
                sessionId:
                  runtimeMapper.getSessionId() ?? metadata?.sessionId ?? null,
                usage: {
                  inputTokens: metadata?.inputTokens,
                  outputTokens: metadata?.outputTokens,
                  totalTokens: metadata?.totalTokens,
                },
                ...(lastError ? { error: lastError } : {}),
              })
            }
          }
        })
        finishRun = (result) => {
          if (settled) return
          settled = true
          removeNotification()
          resolve(result)
        }
      })

      const removeServerRequest = transport.onServerRequest((serverRequest) => {
        let response: unknown
        return dispatchCodexAppServerServerRequest({
          request: {
            method: serverRequest.method,
            id: serverRequest.id,
            params: serverRequest.params,
          } satisfies CodexAppServerServerRequest,
          gate: { approvalHookInstalled: true },
          dispatch: async () => {
            if (serverRequest.method === "item/commandExecution/requestApproval") {
              response = await approvalBridge.handleCommandExecution({
                requestId: serverRequest.id,
                params:
                  serverRequest.params as CodexAppServerCommandExecutionRequestApprovalParams,
              })
              return response
            }
            if (serverRequest.method === "item/fileChange/requestApproval") {
              response = await approvalBridge.handleFileChange({
                requestId: serverRequest.id,
                params:
                  serverRequest.params as CodexAppServerFileChangeRequestApprovalParams,
              })
              return response
            }
            if (serverRequest.method === "item/permissions/requestApproval") {
              response = await approvalBridge.handlePermissions({
                requestId: serverRequest.id,
                params:
                  serverRequest.params as CodexAppServerPermissionsRequestApprovalParams,
              })
              return response
            }
            if (serverRequest.method === "execCommandApproval") {
              response = await approvalBridge.handleLegacyExecCommand({
                requestId: serverRequest.id,
                params:
                  serverRequest.params as CodexAppServerExecCommandApprovalParams,
              })
              return response
            }
            if (serverRequest.method === "applyPatchApproval") {
              response = await approvalBridge.handleLegacyApplyPatch({
                requestId: serverRequest.id,
                params:
                  serverRequest.params as CodexAppServerApplyPatchApprovalParams,
              })
              return response
            }
            if (serverRequest.method === "item/tool/call") {
              response = await approvalBridge.handleDynamicToolCall({
                requestId: serverRequest.id,
                params:
                  serverRequest.params as CodexAppServerDynamicToolCallParams,
              })
              return response
            }
            if (
              serverRequest.method === "item/tool/requestUserInput" &&
              userInteractionBridge
            ) {
              response =
                await userInteractionBridge.handleUserInputRequest({
                  requestId: String(serverRequest.id),
                  params:
                    serverRequest.params as CodexAppServerToolRequestUserInputParams,
                })
              return response
            }
            if (
              serverRequest.method === "mcpServer/elicitation/request" &&
              userInteractionBridge
            ) {
              response =
                await userInteractionBridge.handleMcpElicitationRequest({
                  requestId: String(serverRequest.id),
                  params:
                    serverRequest.params as CodexAppServerMcpElicitationRequestParams,
                })
              return response
            }

            response = defaultServerRequestResponse(serverRequest)
            return response
          },
        }).then(() => response)
      })

      const abortHandler = () => {
        const interrupt = runtimeMapper.buildInterruptRequest()
        if (interrupt) {
          void transport.request(interrupt.method, interrupt.params).catch(() => {})
        }
        finishRun?.({
          status: "canceled",
          sessionId: runtimeMapper.getSessionId(),
        })
      }
      request.signal.addEventListener("abort", abortHandler, { once: true })

      let runResult: DesktopRunResult = {
        status: "failed",
        sessionId: null,
        error: { message: "Codex app-server did not produce a terminal result." },
      }

      try {
        const preparedPrompt = await prepareCodexAppServerPromptWithLongText({
          prompt: request.prompt,
          longTextAttachments: request.attachments
            .filter((attachment) => attachment.kind === "long-text")
            .map((attachment) => ({
              localRef: attachment.localRef ?? "",
              filename: attachment.filename ?? "attachment.txt",
              kind: "pasted",
              byteLength: attachment.byteLength ?? 0,
              attachmentId: attachment.attachmentId,
            })),
        })
        const input = buildCodexAppServerUserInputItems({
          prompt: preparedPrompt,
          attachmentRefs: request.attachments,
          resolvedImages,
          allowPreparedLongTextRefs: true,
        })

        await transport.request("initialize", {
          clientInfo: {
            name: "locus",
            title: "Locus",
            version: "0.0.0",
          },
          capabilities: {
            experimentalApi,
            requestAttestation: false,
          },
        })
        transport.notify("initialized")
        const appServerConfig = {
          ...(providerBinding.client.config ?? {}),
          ...(configOverrides ?? {}),
          ...(pluginConfigOverrides ?? {}),
        }

        const resumeThreadId = request.session.resumeSessionId ?? null
        const threadStart = resumeThreadId
          ? await transport.request(
              "thread/resume",
              buildThreadResumeParams({
                request,
                providerBinding,
                permission,
                threadSandbox,
                config: appServerConfig,
                threadId: resumeThreadId,
              }),
            )
          : await transport.request(
              "thread/start",
              buildThreadStartParams({
                request,
                providerBinding,
                permission,
                threadSandbox,
                config: appServerConfig,
                dynamicTools: controlledEditToolEnabled
                  ? [buildCodexControlledEditDynamicToolSpec()]
                  : null,
                developerInstructions: controlledEditToolEnabled
                  ? codexControlledEditDeveloperInstructions()
                  : null,
              }),
            )
        const responseThreadId = stringAt(threadStart, ["thread", "id"])
        if (!runtimeMapper.getThreadId() && responseThreadId) {
          const responseSessionId =
            stringAt(threadStart, ["thread", "sessionId"]) ?? responseThreadId
          for (const chunk of runtimeMapper.map({
            method: "thread/started",
            params: {
              thread: {
                id: responseThreadId,
                sessionId: responseSessionId,
              },
            },
          } as CodexAppServerNotification)) {
            emitChunk(chunk)
          }
        }
        const threadId =
          responseThreadId ?? runtimeMapper.getThreadId()
        if (!threadId) {
          throw new Error("Codex app-server did not return a thread id.")
        }

        try {
          const mcpStatus = await transport.request("mcpServerStatus/list", {
            detail: "toolsAndAuthOnly",
          })
          emit?.({
            type: "runtime-status",
            ok: true,
            blocker: {
              component: "mcp",
              status: "ready",
              message: "Codex app-server MCP status list resolved.",
              hint: null,
            },
            mcp: appServerMcpStatusSummary(mcpStatus),
          })
        } catch (mcpStatusError) {
          emit?.({
            type: "runtime-status",
            ok: true,
            blocker: {
              component: "mcp",
              status: "unknown",
              message: "Codex app-server MCP status list was unavailable.",
              hint:
                mcpStatusError instanceof Error
                  ? mcpStatusError.message
                  : String(mcpStatusError),
            },
            mcp: {
              serverCount: request.mcp.serverNames.length,
              readyServerCount: 0,
              serverNames: request.mcp.serverNames,
              authStatuses: [],
              degraded: true,
            },
          })
        }

        const turnStart = await transport.request("turn/start", {
          threadId,
          input,
          cwd: request.context.cwd,
          approvalPolicy: permission.appServerApprovalPolicy,
          approvalsReviewer: "user",
          sandboxPolicy: turnSandbox,
          model: request.providerBinding.model ?? null,
        })
        const turnId =
          stringAt(turnStart, ["turn", "id"]) ?? runtimeMapper.getTurnId()
        if (!turnId) {
          throw new Error("Codex app-server did not return a turn id.")
        }

        if (request.signal.aborted) {
          const interrupt = runtimeMapper.buildInterruptRequest()
          if (interrupt) {
            await transport.request(interrupt.method, interrupt.params)
          }
        }

        runResult = await terminal
      } catch (error) {
        runResult = {
          status: request.signal.aborted ? "canceled" : "failed",
          sessionId: runtimeMapper.getSessionId(),
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        }
      } finally {
        request.signal.removeEventListener("abort", abortHandler)
        removeServerRequest()
        await transport.close()
        try {
          assertCodexAppServerShellSnapshotsScrubbed(
            scrubCodexAppServerShellSnapshots({
              runtimeEnv: providerBinding.runtimeEnv,
            }),
            "post-run",
          )
        } catch (scrubError) {
          const message =
            scrubError instanceof Error
              ? scrubError.message
              : String(scrubError)
          emit?.({
            type: "runtime-status",
            ok: false,
            blocker: {
              component: "security",
              status: "blocked",
              message,
              hint: null,
            },
          })
          runResult = {
            status: "failed",
            sessionId: runtimeMapper.getSessionId(),
            error: { message },
          }
        }
      }
      return runResult
    },
  }
}
