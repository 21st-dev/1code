import { preparePromptWithAppAgents } from "../app-agents/prompt"
import {
  buildGuardedRunPromptBlock,
  type ValidatedAgentScopeContract,
} from "../agent-guard"
import { prependLongTextAttachmentPromptBlocks } from "../long-text-attachments"

export type CodexPromptLongTextAttachment = {
  type?: "long-text-attachment"
  attachmentId: string
  localRef: string
  filename: string
  byteLength: number
  preview?: string
  kind: "pasted" | "chatHistory"
}

export type PrepareCodexAcpPromptInput = {
  prompt: string
  longTextAttachments?: CodexPromptLongTextAttachment[]
  guardedContract?: ValidatedAgentScopeContract | null
  logger?: Pick<Console, "log" | "warn">
}

export async function prepareCodexAcpPrompt({
  prompt,
  longTextAttachments,
  guardedContract,
  logger = console,
}: PrepareCodexAcpPromptInput): Promise<string> {
  const appAgentPrompt = await preparePromptWithAppAgents(prompt)
  let finalPrompt = appAgentPrompt.prompt

  if (appAgentPrompt.appAgentMentions.length > 0) {
    logger.log("[codex] App Agents mentioned:", appAgentPrompt.appAgentMentions)
  }
  if (appAgentPrompt.missingAppAgents.length > 0) {
    logger.warn("[codex] Missing App Agents:", appAgentPrompt.missingAppAgents)
  }

  finalPrompt = await prependLongTextAttachmentPromptBlocks(
    finalPrompt,
    longTextAttachments,
  )

  if (guardedContract) {
    finalPrompt = `${buildGuardedRunPromptBlock(guardedContract)}\n\n${finalPrompt}`
  }

  return finalPrompt
}
