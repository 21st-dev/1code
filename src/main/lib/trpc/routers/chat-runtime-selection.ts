import {
  DEFAULT_AGENT_ENGINE_ID,
  type AgentEngineId,
} from "../../agent-runtime/types"

export type ChatMode = "plan" | "agent"

export interface ChatRuntimeSelectionInput {
  engine?: AgentEngineId
  model?: string
}

export function resolveChatRuntimeSelection(
  input: ChatRuntimeSelectionInput,
): { engine: AgentEngineId; modelId?: string } {
  return {
    engine: input.engine ?? DEFAULT_AGENT_ENGINE_ID,
    modelId: input.model,
  }
}

export function buildInitialSubChatValues(input: {
  chatId: string
  engine?: AgentEngineId
  model?: string
  mode: ChatMode
  messages: string
}) {
  return {
    chatId: input.chatId,
    ...resolveChatRuntimeSelection(input),
    mode: input.mode,
    messages: input.messages,
  }
}

export function buildEmptySubChatValues(input: {
  chatId: string
  name?: string
  engine?: AgentEngineId
  model?: string
  mode: ChatMode
}) {
  return {
    chatId: input.chatId,
    name: input.name,
    ...resolveChatRuntimeSelection(input),
    mode: input.mode,
    messages: "[]",
  }
}
