import type { ResolvedChatImageAttachment } from "../../../shared/chat-attachments"
import type { DesktopRunPreflightBlocker } from "../agent-runtime/preflight"
import { prepareChatImageAttachmentsForDesktopRun } from "../chat-attachments"
import type { AgentJobDatabase } from "../headless/job-store"
import {
  prepareClaudeChatHistoryForDesktopRun,
  type PrepareClaudeChatHistoryForDesktopRunResult,
} from "./chat-history"
import type { ImageAttachment, LongTextAttachment } from "./chat-input-schema"

export type PrepareClaudeAgentSdkDesktopRunInputsInput = {
  db: AgentJobDatabase
  subChatId: string
  streamId: string
  prompt: string
  images?: ImageAttachment[]
  longTextAttachments?: LongTextAttachment[]
  historyEnabled?: boolean
  emitPreflightBlocker?: (blocker: DesktopRunPreflightBlocker) => void
  createId: () => string
}

export type PreparedClaudeAgentSdkDesktopRunInputs = {
  historyEnabled: boolean
  resolvedImages: ResolvedChatImageAttachment[]
  chatHistory: PrepareClaudeChatHistoryForDesktopRunResult
}

export type PrepareClaudeAgentSdkDesktopRunInputsResult =
  | ({ ok: true } & PreparedClaudeAgentSdkDesktopRunInputs)
  | {
      ok: false
      reason: "image-attachment-blocked"
      blocker: DesktopRunPreflightBlocker
    }

export async function prepareClaudeAgentSdkDesktopRunInputs(
  input: PrepareClaudeAgentSdkDesktopRunInputsInput,
): Promise<PrepareClaudeAgentSdkDesktopRunInputsResult> {
  const imageAttachments = await prepareChatImageAttachmentsForDesktopRun({
    images: input.images,
    emitPreflightBlocker: input.emitPreflightBlocker,
  })
  if (!imageAttachments.ok) {
    return {
      ok: false,
      reason: "image-attachment-blocked",
      blocker: imageAttachments.blocker,
    }
  }

  return {
    ok: true,
    historyEnabled: input.historyEnabled === true,
    resolvedImages: imageAttachments.attachments,
    chatHistory: prepareClaudeChatHistoryForDesktopRun({
      db: input.db,
      subChatId: input.subChatId,
      streamId: input.streamId,
      prompt: input.prompt,
      images: input.images,
      longTextAttachments: input.longTextAttachments,
      createId: input.createId,
    }),
  }
}
