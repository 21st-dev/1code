import type { PluginRuntime } from "./plugin-target-modes"
import type { PluginUpdateReviewStatus } from "./plugin-update-review"

export interface PluginSafeModeState {
  enabled: boolean
  updatedAt?: string
}

export type PluginSafetyGateStatus =
  | "allowed"
  | "safe-mode"
  | "review-required"
  | "read-only"

export type PluginSafetyGateReason =
  | "global-safe-mode"
  | "review-new"
  | "review-changed"
  | "review-unreviewed"
  | "codex-read-only-cache"
  | "no-mcp-servers"

export interface PluginSafetyGate {
  status: PluginSafetyGateStatus
  canEnable: boolean
  canApproveMcp: boolean
  canUseMcp: boolean
  reasons: PluginSafetyGateReason[]
}

export {
  buildPluginDeveloperTrustedGate,
  type PluginDeveloperTrustedGate,
  type PluginDeveloperTrustedGateReason,
} from "./plugin-developer-trusted"

export function isPluginFingerprintReviewed(
  status: PluginUpdateReviewStatus | undefined,
): boolean {
  return status === "reviewed"
}

export function buildPluginSafetyGate(input: {
  runtime: PluginRuntime
  hasMcpServers: boolean
  updateReviewStatus?: PluginUpdateReviewStatus
  safeModeEnabled: boolean
}): PluginSafetyGate {
  const reasons: PluginSafetyGateReason[] = []
  const isClaude = input.runtime === "claude"
  const isReviewed = isPluginFingerprintReviewed(input.updateReviewStatus)

  if (input.safeModeEnabled) {
    reasons.push("global-safe-mode")
  }

  if (input.runtime === "codex") {
    reasons.push("codex-read-only-cache")
  }

  if (!isReviewed) {
    reasons.push(getReviewGateReason(input.updateReviewStatus))
  }

  if (!input.hasMcpServers) {
    reasons.push("no-mcp-servers")
  }

  const canEnable = isClaude && isReviewed && !input.safeModeEnabled
  const canApproveMcp = canEnable && input.hasMcpServers
  const canUseMcp = canApproveMcp

  return {
    status: getGateStatus({
      runtime: input.runtime,
      isReviewed,
      safeModeEnabled: input.safeModeEnabled,
    }),
    canEnable,
    canApproveMcp,
    canUseMcp,
    reasons: uniqueReasons(reasons),
  }
}

function getGateStatus(input: {
  runtime: PluginRuntime
  isReviewed: boolean
  safeModeEnabled: boolean
}): PluginSafetyGateStatus {
  if (input.safeModeEnabled) return "safe-mode"
  if (input.runtime === "codex") return "read-only"
  if (!input.isReviewed) return "review-required"
  return "allowed"
}

function getReviewGateReason(
  status: PluginUpdateReviewStatus | undefined,
): PluginSafetyGateReason {
  if (status === "changed") return "review-changed"
  if (status === "new") return "review-new"
  return "review-unreviewed"
}

function uniqueReasons(reasons: PluginSafetyGateReason[]): PluginSafetyGateReason[] {
  return Array.from(new Set(reasons))
}
