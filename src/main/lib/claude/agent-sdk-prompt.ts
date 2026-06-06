import type { ResolvedChatImageAttachment } from "../../../shared/chat-attachments"
import {
  preparePromptWithAppAgents,
  type AppAgentPromptResult,
} from "../app-agents/prompt"
import type { ResolveLongTextAttachmentInput } from "../long-text-attachments"
import { parseClaudePromptMentions } from "./mentions"
import type { UIMessageChunk } from "./types"

export type ClaudeAgentSdkPrompt = string | AsyncIterable<any>

export type PrepareClaudeAgentSdkRuntimePromptInput = {
  prompt: string
  images: ResolvedChatImageAttachment[]
  longTextAttachments?: ResolveLongTextAttachmentInput[]
  prepareAppAgentPrompt?: (
    prompt: string,
    appAgentNames?: string[],
  ) => Promise<AppAgentPromptResult>
  prependLongTextPromptBlocks?: (
    prompt: string,
    attachments: ResolveLongTextAttachmentInput[] | undefined,
  ) => Promise<string>
  logger?: Pick<Console, "log" | "warn">
}

export type PrepareClaudeAgentSdkRuntimePromptForDesktopRunInput =
  PrepareClaudeAgentSdkRuntimePromptInput & {
    emitError: (error: unknown, context: string) => void
    emit: (chunk: UIMessageChunk) => unknown
    complete: () => void
  }

export type PrepareClaudeAgentSdkRuntimePromptForDesktopRunResult =
  | { ok: true; prompt: ClaudeAgentSdkPrompt }
  | { ok: false; reason: "long-text-attachment-unavailable" }

export class ClaudeAgentSdkLongTextAttachmentPromptError extends Error {
  originalError: unknown

  constructor(originalError: unknown) {
    super("Long text attachment unavailable")
    this.name = "ClaudeAgentSdkLongTextAttachmentPromptError"
    this.originalError = originalError
  }
}

export function createClaudeAgentSdkPrompt(input: {
  prompt: string
  images: ResolvedChatImageAttachment[]
}): ClaudeAgentSdkPrompt {
  if (input.images.length === 0) {
    return input.prompt
  }

  const messageContent: any[] = [
    ...input.images.map((image) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: image.mediaType,
        data: image.base64Data,
      },
    })),
  ]

  if (input.prompt.trim()) {
    messageContent.push({
      type: "text" as const,
      text: input.prompt,
    })
  }

  return createClaudeAgentSdkImagePrompt(messageContent)
}

async function prependLongTextAttachmentPromptBlocksDefault(
  prompt: string,
  attachments: ResolveLongTextAttachmentInput[] | undefined,
): Promise<string> {
  const { prependLongTextAttachmentPromptBlocks } = await import(
    "../long-text-attachments"
  )
  return prependLongTextAttachmentPromptBlocks(prompt, attachments)
}

export async function prepareClaudeAgentSdkRuntimePrompt({
  prompt,
  images,
  longTextAttachments,
  prepareAppAgentPrompt = preparePromptWithAppAgents,
  prependLongTextPromptBlocks = prependLongTextAttachmentPromptBlocksDefault,
  logger = console,
}: PrepareClaudeAgentSdkRuntimePromptInput): Promise<ClaudeAgentSdkPrompt> {
  const { cleanedPrompt, agentMentions, skillMentions } =
    parseClaudePromptMentions(prompt)

  if (agentMentions.length > 0) {
    logger.log("[claude] App Agents mentioned:", agentMentions)
  }

  if (skillMentions.length > 0) {
    logger.log("[claude] Skills mentioned:", skillMentions)
  }

  const appAgentPrompt = await prepareAppAgentPrompt(
    cleanedPrompt,
    agentMentions,
  )
  if (appAgentPrompt.missingAppAgents.length > 0) {
    logger.warn("[claude] Missing App Agents:", appAgentPrompt.missingAppAgents)
  }

  let finalPrompt = appAgentPrompt.prompt
  if (!finalPrompt.trim()) {
    if (skillMentions.length > 0) {
      finalPrompt = `Invoke the "${skillMentions.join('", "')}" skill(s) using the Skill tool for this task.`
    }
  } else if (skillMentions.length > 0) {
    finalPrompt = `${finalPrompt}\n\nUse the "${skillMentions.join('", "')}" skill(s) for this task.`
  }

  try {
    finalPrompt = await prependLongTextPromptBlocks(
      finalPrompt,
      longTextAttachments,
    )
  } catch (error) {
    throw new ClaudeAgentSdkLongTextAttachmentPromptError(error)
  }

  return createClaudeAgentSdkPrompt({
    prompt: finalPrompt,
    images,
  })
}

export async function prepareClaudeAgentSdkRuntimePromptForDesktopRun({
  emitError,
  emit,
  complete,
  ...input
}: PrepareClaudeAgentSdkRuntimePromptForDesktopRunInput): Promise<
  PrepareClaudeAgentSdkRuntimePromptForDesktopRunResult
> {
  try {
    const prompt = await prepareClaudeAgentSdkRuntimePrompt(input)
    return { ok: true, prompt }
  } catch (promptError) {
    if (!(promptError instanceof ClaudeAgentSdkLongTextAttachmentPromptError)) {
      throw promptError
    }
    emitError(promptError.originalError, "Long text attachment unavailable")
    emit({ type: "finish" })
    complete()
    return { ok: false, reason: "long-text-attachment-unavailable" }
  }
}

async function* createClaudeAgentSdkImagePrompt(messageContent: any[]) {
  yield {
    type: "user" as const,
    message: {
      role: "user" as const,
      content: messageContent,
    },
    parent_tool_use_id: null,
  }
}
