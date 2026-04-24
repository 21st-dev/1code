import { appStore } from "../../../lib/jotai-store"
import type { AgentMode, ClaudeThinkingPreference } from "../atoms"
import {
  defaultAgentModeModelAtom,
  defaultAgentModeThinkingAtom,
  defaultPlanModeModelAtom,
  defaultPlanModeThinkingAtom,
  defaultReviewModeModelAtom,
  defaultReviewModeThinkingAtom,
  lastSelectedAgentIdAtom,
  subChatClaudeThinkingAtomFamily,
  subChatCodexModelIdAtomFamily,
  subChatModelIdAtomFamily,
  subChatProviderOverrideAtomFamily,
} from "../atoms"
import { CLAUDE_MODELS, CODEX_MODELS } from "./models"

export type ModeContext = AgentMode | "review"
export type Provider = "claude-code" | "codex"

const CLAUDE_MODEL_IDS = new Set(CLAUDE_MODELS.map((m) => m.id))
const CODEX_MODEL_IDS = new Set(CODEX_MODELS.map((m) => m.id))

export function getProviderForModelId(modelId: string): Provider {
  if (CODEX_MODEL_IDS.has(modelId)) return "codex"
  if (CLAUDE_MODEL_IDS.has(modelId)) return "claude-code"
  // Unknown id — fall back to Claude (matches historical behavior).
  return "claude-code"
}

export function getDefaultModelForMode(mode: ModeContext): string {
  switch (mode) {
    case "plan":
      return appStore.get(defaultPlanModeModelAtom)
    case "agent":
      return appStore.get(defaultAgentModeModelAtom)
    case "review":
      return appStore.get(defaultReviewModeModelAtom)
  }
}

export function getDefaultThinkingForMode(
  mode: ModeContext,
): ClaudeThinkingPreference {
  switch (mode) {
    case "plan":
      return appStore.get(defaultPlanModeThinkingAtom)
    case "agent":
      return appStore.get(defaultAgentModeThinkingAtom)
    case "review":
      return appStore.get(defaultReviewModeThinkingAtom)
  }
}

export function getSubChatModel(subChatId: string): string {
  return appStore.get(subChatModelIdAtomFamily(subChatId))
}

/**
 * Write `modelId` as the active model for the given sub-chat and update the
 * provider override so the correct transport is used on the next send.
 *
 * Works for both Claude and Codex model IDs:
 * - Claude IDs (opus, opus[1m], sonnet, haiku) → subChatModelIdAtomFamily
 * - Codex IDs (gpt-5.3-codex, etc.) → subChatCodexModelIdAtomFamily
 *
 * In both cases the per-sub-chat provider override is set so the chat input
 * selector and the transport stay in sync.
 */
export function setSubChatModel(subChatId: string, modelId: string): Provider {
  const provider = getProviderForModelId(modelId)
  if (provider === "codex") {
    appStore.set(subChatCodexModelIdAtomFamily(subChatId), modelId)
  } else {
    appStore.set(subChatModelIdAtomFamily(subChatId), modelId)
  }
  appStore.set(subChatProviderOverrideAtomFamily(subChatId), provider)
  // Keep the global "last selected agent" in sync so new chats created
  // shortly after the switch pick the same provider by default.
  appStore.set(lastSelectedAgentIdAtom, provider)
  return provider
}

export function applyModeDefaultModel(
  subChatId: string,
  mode: ModeContext,
): { modelId: string; provider: Provider } {
  const modelId = getDefaultModelForMode(mode)
  const provider = setSubChatModel(subChatId, modelId)
  appStore.set(
    subChatClaudeThinkingAtomFamily(subChatId),
    getDefaultThinkingForMode(mode),
  )
  return { modelId, provider }
}
