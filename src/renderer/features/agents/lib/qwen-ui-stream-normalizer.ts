import type { AiSdkTransportChunk } from "./chat-message-ui-adapter"

type RuntimeStreamChunk = Record<string, unknown>

export type ExperimentalRuntimeUiStreamState = {
  activeTextIds: Set<string>
  activeReasoningIds: Set<string>
  fallbackTextId: string
  fallbackReasoningId: string
}

export function createExperimentalRuntimeUiStreamState(): ExperimentalRuntimeUiStreamState {
  return {
    activeTextIds: new Set(),
    activeReasoningIds: new Set(),
    fallbackTextId: "experimental-runtime-text",
    fallbackReasoningId: "experimental-runtime-reasoning",
  }
}

export function normalizeExperimentalRuntimeUiChunk(
  state: ExperimentalRuntimeUiStreamState,
  chunk: RuntimeStreamChunk,
): AiSdkTransportChunk[] {
  switch (chunk.type) {
    case "text-start": {
      const id = normalizeId(chunk.id, state.fallbackTextId)
      state.activeTextIds.add(id)
      return [{ ...chunk, id } as AiSdkTransportChunk]
    }
    case "text-delta": {
      const id = normalizeId(chunk.id, state.fallbackTextId)
      const chunks: AiSdkTransportChunk[] = []
      if (!state.activeTextIds.has(id)) {
        state.activeTextIds.add(id)
        chunks.push({ type: "text-start", id })
      }
      chunks.push({ ...chunk, id } as AiSdkTransportChunk)
      return chunks
    }
    case "text-end": {
      const id = normalizeId(chunk.id, state.fallbackTextId)
      if (!state.activeTextIds.has(id)) return []
      state.activeTextIds.delete(id)
      return [{ ...chunk, id } as AiSdkTransportChunk]
    }
    case "reasoning-start": {
      const id = normalizeId(chunk.id, state.fallbackReasoningId)
      state.activeReasoningIds.add(id)
      return [{ ...chunk, id } as AiSdkTransportChunk]
    }
    case "reasoning-delta": {
      const id = normalizeId(chunk.id, state.fallbackReasoningId)
      const chunks: AiSdkTransportChunk[] = []
      if (!state.activeReasoningIds.has(id)) {
        state.activeReasoningIds.add(id)
        chunks.push({ type: "reasoning-start", id })
      }
      chunks.push({ ...chunk, id } as AiSdkTransportChunk)
      return chunks
    }
    case "reasoning-end": {
      const id = normalizeId(chunk.id, state.fallbackReasoningId)
      if (!state.activeReasoningIds.has(id)) return []
      state.activeReasoningIds.delete(id)
      return [{ ...chunk, id } as AiSdkTransportChunk]
    }
    case "finish-step":
    case "finish": {
      return closeOpenParts(state).concat(chunk as AiSdkTransportChunk)
    }
    default:
      return [chunk as AiSdkTransportChunk]
  }
}

export function finalizeExperimentalRuntimeUiStream(
  state: ExperimentalRuntimeUiStreamState,
): AiSdkTransportChunk[] {
  return closeOpenParts(state).concat({ type: "finish" })
}

function closeOpenParts(
  state: ExperimentalRuntimeUiStreamState,
): AiSdkTransportChunk[] {
  const chunks: AiSdkTransportChunk[] = []
  for (const id of state.activeReasoningIds) {
    chunks.push({ type: "reasoning-end", id })
  }
  state.activeReasoningIds.clear()
  for (const id of state.activeTextIds) {
    chunks.push({ type: "text-end", id })
  }
  state.activeTextIds.clear()
  return chunks
}

function normalizeId(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback
}
