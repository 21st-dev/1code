import type { AgentGuardEvent } from "../../../shared/agent-scope-contracts"
import { buildCodexRuntimeCapabilityErrorChunk } from "../../../shared/codex-runtime-capabilities"
import {
  emitDesktopRuntimeAdapterStarted,
} from "../agent-runtime/desktop-runner"
import type { DesktopRunRequest } from "../agent-runtime/desktop-run-request"
import { CODEX_ACP_TEMPORARY_COMPAT_DESKTOP_ADAPTER_METADATA } from "../agent-runtime/desktop-adapter-metadata"
import { getCodexPermissionMapping } from "../agent-runtime/permission-policy"
import type {
  GuardedGitStatusSnapshot,
  ValidatedAgentScopeContract,
} from "../agent-guard"
import { getClaudeShellEnvironment } from "../claude/env"
import { getCodexRunRequiredCapability } from "../../../shared/codex-runtime-capabilities"
import { resolveCodexAcpBinaryPath } from "./acp-path"
import {
  cleanupCodexAcpProvider,
  getOrCreateCodexAcpProvider,
  type CodexAcpMcpServerForSession,
} from "./acp-adapter"
import { persistCodexAcpResponseMessage } from "./acp-message-persistence"
import { createCodexAcpRuntimeModel } from "./acp-runtime"
import {
  createCodexAcpUiMessageStream,
  type CodexAcpResolvedImage,
} from "./acp-text-stream"
import { emitCodexAcpUiStream } from "./acp-ui-stream"
import type { CodexAskUserQuestionPending } from "./ask-user-question"
import {
  extractCodexError,
  getCodexErrorDiagnostics,
  isCodexAuthError,
} from "./errors"
import { decideCodexAcpToolPermission } from "./acp-permission"
import {
  prepareCodexAcpPrompt,
  type CodexPromptLongTextAttachment,
} from "./prompt"
import type { CodexDesktopAdapter } from "./adapter-types"
import type { CodexProviderProfileBinding } from "./provider-runtime-binding"
import { createCodexUsageMetadataResolver } from "./usage-metadata"

type CodexAcpTemporaryCompatGuardedRun = {
  contract: ValidatedAgentScopeContract
  preRunStatus: GuardedGitStatusSnapshot
  startedAt: string
  events: AgentGuardEvent[]
}

export type CreateCodexAcpTemporaryCompatAdapterInput = {
  appManagedApiKey?: string | null
  providerProfile?: CodexProviderProfileBinding
  mcpServers: CodexAcpMcpServerForSession[]
  mcpFingerprint: string
  modelId: string
  metadataModelId?: string
  images: CodexAcpResolvedImage[]
  longTextAttachments?: CodexPromptLongTextAttachment[]
  messagesForStream: any[]
  guardedRun?: CodexAcpTemporaryCompatGuardedRun | null
  emit: (chunk: any) => void
  persistMessages: (messages: any[]) => unknown
  registerPendingQuestion: (
    toolUseId: string,
    pending: CodexAskUserQuestionPending,
  ) => void
  unregisterPendingQuestion: (toolUseId: string) => void
  generateMessageId?: () => string
}

function emitUnsupportedSafetyCapability(
  request: DesktopRunRequest,
  hasScopeContract: boolean,
  error: string,
  emit: (chunk: any) => void,
): void {
  const requiredSafetyCapability = getCodexRunRequiredCapability({
    mode: request.context.mode,
    hasScopeContract,
  })
  if (!requiredSafetyCapability) {
    emit({ type: "error", errorText: error })
    emit({ type: "finish" })
    return
  }

  const chunk = buildCodexRuntimeCapabilityErrorChunk({
    capability: requiredSafetyCapability,
    message: `Codex ${requiredSafetyCapability.label} could not start because ACP permission enforcement is unavailable.`,
    hint: error,
  })
  emit(chunk)
  emit({
    type: "error",
    errorText: chunk.errorText,
  })
  emit({ type: "finish" })
}

function guardEventToolUseId(event: AgentGuardEvent): string | null {
  return typeof event.toolUseId === "string" && event.toolUseId.length > 0
    ? event.toolUseId
    : null
}

export function createCodexAcpTemporaryCompatAdapter({
  appManagedApiKey,
  providerProfile,
  mcpServers,
  mcpFingerprint,
  modelId,
  metadataModelId,
  images,
  longTextAttachments,
  messagesForStream,
  guardedRun,
  emit,
  persistMessages,
  registerPendingQuestion,
  unregisterPendingQuestion,
  generateMessageId,
}: CreateCodexAcpTemporaryCompatAdapterInput): CodexDesktopAdapter {
  return {
    metadata: CODEX_ACP_TEMPORARY_COMPAT_DESKTOP_ADAPTER_METADATA,

    async run(request: DesktopRunRequest) {
      emitDesktopRuntimeAdapterStarted(
        request,
        CODEX_ACP_TEMPORARY_COMPAT_DESKTOP_ADAPTER_METADATA,
      )

      const provider = getOrCreateCodexAcpProvider({
        runRequest: request,
        command: resolveCodexAcpBinaryPath(),
        shellEnv: getClaudeShellEnvironment(),
        processEnv: process.env,
        mcpServers,
        mcpFingerprint,
        appManagedApiKey: providerProfile ? null : appManagedApiKey,
        providerProfile,
      })
      const cleanupProvider = () => {
        cleanupCodexAcpProvider(request.context.subChatId)
      }
      if (request.signal.aborted) {
        cleanupProvider()
      } else {
        request.signal.addEventListener("abort", cleanupProvider, { once: true })
      }

      const startedAt = Date.now()
      const usageMetadataResolver = createCodexUsageMetadataResolver({
        provider,
        initialSessionId:
          provider.getSessionId() ||
          request.session.parentSessionId ||
          request.session.resumeSessionId,
        startedAt,
        shellEnv: getClaudeShellEnvironment(),
        processEnv: process.env,
      })

      let finalPrompt: string
      try {
        finalPrompt = await prepareCodexAcpPrompt({
          prompt: request.prompt,
          longTextAttachments,
          guardedContract: guardedRun?.contract ?? null,
        })
      } catch (attachmentError) {
        const message =
          attachmentError instanceof Error
            ? attachmentError.message
            : String(attachmentError)
        emit({ type: "error", errorText: message })
        emit({ type: "finish" })
        return {
          status: "failed" as const,
          error: { message },
        }
      }

      const permission = getCodexPermissionMapping(request.permissionPolicy)
      const handledPermissionToolUseIds = new Set<string>()
      let dynamicToolDeniedMessage: string | null = null
      const runtimeModel = await createCodexAcpRuntimeModel({
        provider,
        modelId,
        permission,
        mode: request.context.mode,
        guardedContract: guardedRun?.contract ?? null,
        subChatId: request.context.subChatId,
        emit,
        registerPendingQuestion,
        unregisterPendingQuestion,
        onGuardEvent: (event) => {
          const toolUseId = guardEventToolUseId(event)
          if (toolUseId) handledPermissionToolUseIds.add(toolUseId)
          guardedRun?.events.push(event)
          emit({ type: "guard-event", event })
        },
        onObservedToolDecision: (event) => {
          const toolUseId = event.risk.toolUseId
          if (toolUseId) handledPermissionToolUseIds.add(toolUseId)
        },
      })
      if (!runtimeModel.ok) {
        emitUnsupportedSafetyCapability(
          request,
          Boolean(guardedRun?.contract),
          runtimeModel.error,
          emit,
        )
        return {
          status: "failed" as const,
          error: { message: runtimeModel.error },
        }
      }

      const uiStream = createCodexAcpUiMessageStream({
        model: runtimeModel.model,
        tools: runtimeModel.tools,
        prompt: finalPrompt,
        images,
        abortSignal: request.signal,
        originalMessages: messagesForStream,
        provider,
        metadataModel: metadataModelId ?? modelId,
        runId: request.identity.runId,
        startedAt,
        guardedContract: guardedRun?.contract ?? null,
        onSessionId: (sessionId) => {
          usageMetadataResolver.setSessionId(sessionId)
        },
        generateMessageId,
        onFinish: async ({ responseMessage, isContinuation }) => {
          try {
            await persistCodexAcpResponseMessage({
              responseMessage,
              isContinuation,
              messagesForStream,
              usageMetadata: await usageMetadataResolver.resolveOnce(),
              guardedRun: guardedRun
                ? {
                    contract: guardedRun.contract,
                    preRunStatus: guardedRun.preRunStatus,
                    cwd: request.context.cwd,
                    guardEvents: guardedRun.events,
                    startedAt: guardedRun.startedAt,
                    stopped: request.signal.aborted,
                  }
                : null,
              emit,
              persistMessages,
            })
          } catch (error) {
            console.error("[codex] Failed to persist messages:", error)
          }
        },
        onError: (error) => {
          const normalized = extractCodexError(error)
          console.error("[codex-acp] stream error", {
            subChatId: request.context.subChatId.slice(-8),
            ...getCodexErrorDiagnostics(error),
            message: normalized.message,
          })
          return normalized.message
        },
      })

      const streamResult = await emitCodexAcpUiStream({
        uiStream,
        emit,
        normalizeError: extractCodexError,
        isAuthError: isCodexAuthError,
        resolveUsageOnce: usageMetadataResolver.resolveOnce,
        abortSignal: request.signal,
        onDynamicToolPermission: (tool) => {
          if (handledPermissionToolUseIds.has(tool.toolUseId)) {
            return { decision: "allow" as const }
          }

          const decision = decideCodexAcpToolPermission({
            tool,
            mode: request.context.mode,
            controlLevel: permission.controlLevel,
            observedToolPolicy: permission.observedToolPolicy,
            contract: guardedRun?.contract ?? null,
          })

          if (decision.observed) {
            handledPermissionToolUseIds.add(tool.toolUseId)
            emit({
              type: "observed-tool-decision",
              ...decision.observed,
            })
          }

          if (decision.guardEvent) {
            handledPermissionToolUseIds.add(tool.toolUseId)
            guardedRun?.events.push(decision.guardEvent)
            emit({ type: "guard-event", event: decision.guardEvent })
          }

          return decision
        },
        onDynamicToolDenied: (_tool, decision) => {
          dynamicToolDeniedMessage =
            decision.message || "Codex ACP dynamic tool was denied."
          cleanupProvider()
        },
      })

      if (dynamicToolDeniedMessage) {
        return {
          status: "failed" as const,
          sessionId: provider.getSessionId() ?? null,
          error: { message: dynamicToolDeniedMessage },
        }
      }

      if (streamResult.status === "failed") {
        return {
          status: "failed" as const,
          sessionId: provider.getSessionId() ?? null,
          error: streamResult.error,
        }
      }

      if (streamResult.status === "canceled" || request.signal.aborted) {
        return {
          status: "canceled" as const,
          sessionId: provider.getSessionId() ?? null,
        }
      }

      return {
        status: "succeeded" as const,
        sessionId: provider.getSessionId() ?? null,
      }
    },
  }
}
