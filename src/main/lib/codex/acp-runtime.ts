import type { ACPProvider } from "@mcpc-tech/acp-ai-provider"
import type { AgentGuardEvent } from "../../../shared/agent-scope-contracts"
import type { AgentJobMode } from "../../../shared/agent-jobs"
import type { CodexPermissionMapping } from "../agent-runtime/permission-policy"
import type { ValidatedAgentScopeContract } from "../agent-guard"
import {
  createCodexAcpPermissionHandler,
  installCodexAcpPermissionHandler,
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
      contract: guardedContract,
      onGuardEvent,
    }),
  })
  if (!installResult.ok) {
    return installResult
  }

  return { ok: true, model, tools }
}
