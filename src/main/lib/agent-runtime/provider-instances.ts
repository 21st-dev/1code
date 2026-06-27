import { z } from "zod"
import {
  AGENT_ENGINE_IDS,
  type AgentEngineId,
  type AgentRuntimeSessionRef,
} from "./types"

export type AgentRuntimeProviderInstanceId = string & {
  readonly __agentRuntimeProviderInstanceId: unique symbol
}

export interface AgentRuntimeModelSelection {
  instanceId: AgentRuntimeProviderInstanceId
  modelId: string
  options?: Record<string, unknown>
}

export const DEFAULT_AGENT_RUNTIME_PROVIDER_INSTANCE_IDS: Record<
  AgentEngineId,
  AgentRuntimeProviderInstanceId
> = {
  "claude-code": "claude-code" as AgentRuntimeProviderInstanceId,
  codex: "codex" as AgentRuntimeProviderInstanceId,
  hermes: "hermes" as AgentRuntimeProviderInstanceId,
  "custom-acp": "custom-acp" as AgentRuntimeProviderInstanceId,
}

const agentEngineIdSet = new Set<string>(AGENT_ENGINE_IDS)

const legacyModelSelectionSchema = z.object({
  provider: z.unknown().optional(),
  engineId: z.unknown().optional(),
  instanceId: z.unknown().optional(),
  model: z.unknown().optional(),
  modelId: z.unknown().optional(),
  options: z.record(z.string(), z.unknown()).optional(),
}).passthrough()

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function isAgentEngineId(value: unknown): value is AgentEngineId {
  return typeof value === "string" && agentEngineIdSet.has(value)
}

export function defaultProviderInstanceIdForEngine(
  engineId: AgentEngineId,
): AgentRuntimeProviderInstanceId {
  return DEFAULT_AGENT_RUNTIME_PROVIDER_INSTANCE_IDS[engineId]
}

export function makeAgentRuntimeProviderInstanceId(
  value: string,
): AgentRuntimeProviderInstanceId {
  const cleaned = cleanString(value)
  if (!cleaned) {
    throw new Error("Agent runtime provider instance id must be a non-empty string.")
  }
  return cleaned as AgentRuntimeProviderInstanceId
}

export function normalizeAgentRuntimeModelSelection(
  value: unknown,
  fallback?: {
    engineId?: AgentEngineId | null
    modelId?: string | null
  },
): AgentRuntimeModelSelection | null {
  const parsed = legacyModelSelectionSchema.safeParse(value)
  const source = parsed.success ? parsed.data : {}
  const legacyEngine =
    isAgentEngineId(source.engineId)
      ? source.engineId
      : isAgentEngineId(source.provider)
        ? source.provider
        : fallback?.engineId ?? null
  const instanceId =
    cleanString(source.instanceId) ??
    (legacyEngine ? defaultProviderInstanceIdForEngine(legacyEngine) : null)
  const modelId =
    cleanString(source.modelId) ??
    cleanString(source.model) ??
    cleanString(fallback?.modelId)

  if (!instanceId || !modelId) return null

  return {
    instanceId: makeAgentRuntimeProviderInstanceId(instanceId),
    modelId,
    ...(source.options ? { options: source.options } : {}),
  }
}

export function resolveAgentRuntimeProviderInstanceId(
  session: Pick<
    AgentRuntimeSessionRef,
    "engineId" | "modelId" | "metadata" | "providerInstanceId" | "modelSelection"
  >,
): AgentRuntimeProviderInstanceId {
  const explicit = cleanString(session.providerInstanceId)
  if (explicit) return makeAgentRuntimeProviderInstanceId(explicit)

  const modelSelection = normalizeAgentRuntimeModelSelection(
    session.modelSelection ?? session.metadata?.modelSelection,
    {
      engineId: session.engineId,
      modelId: session.modelId,
    },
  )
  return modelSelection?.instanceId ?? defaultProviderInstanceIdForEngine(session.engineId)
}
