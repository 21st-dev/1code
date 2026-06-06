import { streamText } from "ai"
import { randomUUID } from "node:crypto"

export type CodexAcpResolvedImage = {
  base64Data: string
  mediaType: string
  filename?: string
}

export type CodexAcpTextStreamGuardedContract = {
  id: string
  runId?: string | null
}

export type CodexAcpTextStreamFinish = {
  responseMessage: any
  isContinuation: boolean
}

export type CreateCodexAcpUiMessageStreamInput = {
  model: any
  tools: any
  prompt: string
  images?: CodexAcpResolvedImage[]
  abortSignal: AbortSignal
  originalMessages: any[]
  provider: {
    getSessionId(): string | null | undefined
  }
  metadataModel: string
  runId: string
  startedAt: number
  guardedContract?: CodexAcpTextStreamGuardedContract | null
  onSessionId?: (sessionId: string) => void
  onFinish: (finish: CodexAcpTextStreamFinish) => Promise<void>
  onError: (error: unknown) => string
  generateMessageId?: () => string
}

export function buildCodexAcpModelMessageContent(
  prompt: string,
  images?: CodexAcpResolvedImage[],
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

export function createCodexAcpUiMessageStream({
  model,
  tools,
  prompt,
  images,
  abortSignal,
  originalMessages,
  provider,
  metadataModel,
  runId,
  startedAt,
  guardedContract,
  onSessionId,
  onFinish,
  onError,
  generateMessageId = randomUUID,
}: CreateCodexAcpUiMessageStreamInput): ReadableStream<any> {
  const result = streamText({
    model,
    messages: [
      {
        role: "user",
        content: buildCodexAcpModelMessageContent(prompt, images),
      },
    ],
    tools,
    abortSignal,
  })

  return result.toUIMessageStream({
    originalMessages,
    generateMessageId,
    messageMetadata: ({ part }: { part: any }) => {
      const sessionId = provider.getSessionId() || undefined
      if (sessionId) {
        onSessionId?.(sessionId)
      }
      const guardedRunMetadata = guardedContract
        ? {
            guardedRun: {
              contractId: guardedContract.id,
              runId: guardedContract.runId ?? runId,
              runtime: "codex",
              enforcementMode: "hard",
            },
          }
        : {}

      if (part.type === "finish") {
        return {
          provider: "codex",
          model: metadataModel,
          sessionId,
          durationMs: Date.now() - startedAt,
          resultSubtype:
            part.finishReason === "error" ? "error" : "success",
          ...guardedRunMetadata,
        }
      }

      if (sessionId) {
        return {
          provider: "codex",
          model: metadataModel,
          sessionId,
          ...guardedRunMetadata,
        }
      }

      return {
        provider: "codex",
        model: metadataModel,
        ...guardedRunMetadata,
      }
    },
    onFinish,
    onError,
  })
}
