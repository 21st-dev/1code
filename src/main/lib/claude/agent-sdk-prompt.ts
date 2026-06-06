import type { ResolvedChatImageAttachment } from "../../../shared/chat-attachments"

export type ClaudeAgentSdkPrompt = string | AsyncIterable<any>

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
