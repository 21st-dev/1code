import type { ACPProvider } from "@mcpc-tech/acp-ai-provider"
import type { AgentGuardEvent } from "../../../shared/agent-scope-contracts"
import type { AgentJobMode } from "../../../shared/agent-jobs"
import type { CodexPermissionMapping } from "../agent-runtime/permission-policy"
import type { ValidatedAgentScopeContract } from "../agent-guard"
import {
  createCodexAcpPermissionHandler,
  installCodexAcpPermissionHandler,
  type CodexObservedToolDecision,
} from "./acp-permission"
import {
  createCodexAskUserQuestionTools,
  installCodexAskUserQuestionAcpResultNormalizer,
  type CodexAskUserQuestionPending,
} from "./ask-user-question"

export type CodexAcpRuntimeChunk = Record<string, unknown>

export type CreateCodexAcpRuntimeModelInput = {
  provider: ACPProvider
  modelId: string
  permission: CodexPermissionMapping
  mode: AgentJobMode
  guardedContract?: ValidatedAgentScopeContract | null
  subChatId: string
  emit: (chunk: CodexAcpRuntimeChunk) => void
  registerPendingQuestion: (
    toolUseId: string,
    pending: CodexAskUserQuestionPending,
  ) => void
  unregisterPendingQuestion: (toolUseId: string) => void
  onGuardEvent: (event: AgentGuardEvent) => void
  onObservedToolDecision?: (event: CodexObservedToolDecision) => void
}

export type CreateCodexAcpRuntimeModelResult =
  | {
      ok: true
      model: ReturnType<ACPProvider["languageModel"]>
      tools: any
    }
  | { ok: false; error: string }

export async function createCodexAcpRuntimeModel({
  provider,
  modelId,
  permission,
  mode,
  guardedContract,
  subChatId,
  emit,
  registerPendingQuestion,
  unregisterPendingQuestion,
  onGuardEvent,
  onObservedToolDecision,
}: CreateCodexAcpRuntimeModelInput): Promise<CreateCodexAcpRuntimeModelResult> {
  const model = provider.languageModel(modelId, permission.acpMode)
  installCodexAskUserQuestionAcpResultNormalizer(model)
  const tools = {
    ...(provider.tools || {}),
    ...createCodexAskUserQuestionTools({
      subChatId,
      emit,
      registerPending: registerPendingQuestion,
      unregisterPending: unregisterPendingQuestion,
    }),
  }

  if (!permission.requiresPermissionHandler) {
    return { ok: true, model, tools }
  }

  const installResult = await installCodexAcpPermissionHandler({
    model,
    handler: createCodexAcpPermissionHandler({
      mode,
      controlLevel: permission.controlLevel,
      observedToolPolicy: permission.observedToolPolicy,
      contract: guardedContract,
      onGuardEvent,
      onObservedToolDecision: (event) => {
        onObservedToolDecision?.(event)
        emit({
          type: "observed-tool-decision",
          ...event,
        })
      },
    }),
  })
  if (!installResult.ok) {
    if (permission.permissionHandlerFailure === "degrade-to-stream-only") {
      emit({
        type: "runtime-status",
        ok: false,
        blocker: {
          component: "permission-observation",
          reason: "codex-acp-permission-handler-unavailable",
          message:
            "Codex observed mode could not install the ACP permission handler; continuing with stream-only visibility.",
          controlLevel: "observe",
          enforcement: "degraded",
        },
      })
      return { ok: true, model, tools }
    }
    return installResult
  }

  return { ok: true, model, tools }
}
