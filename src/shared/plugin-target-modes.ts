export type PluginRuntime = "claude" | "codex"

export type PluginTargetMode =
  | "manifest-only"
  | "controlled-ui"
  | "developer-trusted-code"

export type PluginExecutionStatus =
  | "not-run-by-locus"
  | "locus-controlled-planned"
  | "trusted-code-planned"

export type PluginReviewStatus =
  | "metadata-only"
  | "mcp-review-required"
  | "read-only-cache"

export type PluginUpdatePosture =
  | "advisory-only"
  | "review-before-enable"

export interface PluginTargetModeSummary {
  targetMode: PluginTargetMode
  executionStatus: PluginExecutionStatus
  updatePosture: PluginUpdatePosture
}

export function getManifestOnlyPluginTargetMode(): PluginTargetModeSummary {
  return {
    targetMode: "manifest-only",
    executionStatus: "not-run-by-locus",
    updatePosture: "advisory-only",
  }
}

export function getPluginReviewStatus(input: {
  runtime: PluginRuntime
  hasMcpServers: boolean
}): PluginReviewStatus {
  if (input.runtime === "codex") return "read-only-cache"
  return input.hasMcpServers ? "mcp-review-required" : "metadata-only"
}
