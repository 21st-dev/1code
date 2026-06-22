import { normalizeAcpParts } from "../../../../shared/acp-tool-normalizer"
import type { CanonicalChatMessagePart } from "../../../../shared/chat-message"
import { normalizeCodexToolPart } from "../../../../shared/codex-tool-normalizer"

export function normalizeAssistantMessagePartsForRender(
  parts: CanonicalChatMessagePart[] | undefined,
): CanonicalChatMessagePart[] {
  return normalizeAcpParts(
    (parts || []).map((part: CanonicalChatMessagePart) =>
      normalizeCodexToolPart(part),
    ),
  )
}
