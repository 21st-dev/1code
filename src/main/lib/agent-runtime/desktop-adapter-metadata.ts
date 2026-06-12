import type { DesktopRuntimeAdapterMetadata } from "./desktop-runner"

export const CODEX_ACP_TEMPORARY_COMPAT_DEFAULT_DISABLE_CONDITION =
  "Disable ACP by default after app-server passes schema/client pinning, fail-closed approval tests, provider-profile binding, MCP readiness, AskUserQuestion, supported attachments, stream/session/usage, cancellation, redaction, and desktop smoke evidence."

export const CODEX_ACP_TEMPORARY_COMPAT_REMOVAL_CONDITION =
  "Remove ACP route/dependency paths after app-server covers required desktop behavior, or after an approved rescope downgrades missing behavior with a separate compatibility gate and deletion follow-up."

export const CLAUDE_AGENT_SDK_DESKTOP_ADAPTER_METADATA = {
  runtimeId: "claude-code",
  source: "claude-agent-sdk",
  label: "Claude Agent SDK",
  temporaryFallback: false,
  fallbackReason: null,
  defaultDisableCondition: null,
  removalCondition: null,
} satisfies DesktopRuntimeAdapterMetadata

export const CODEX_ACP_TEMPORARY_COMPAT_DESKTOP_ADAPTER_METADATA = {
  runtimeId: "codex",
  source: "codex-acp-temporary-compat",
  label: "Codex ACP temporary-compat adapter",
  temporaryFallback: true,
  fallbackReason:
    "Codex app-server is the default desktop/chat adapter; ACP remains a labeled temporary-compat rollback path only when explicitly selected.",
  defaultDisableCondition: CODEX_ACP_TEMPORARY_COMPAT_DEFAULT_DISABLE_CONDITION,
  removalCondition: CODEX_ACP_TEMPORARY_COMPAT_REMOVAL_CONDITION,
} satisfies DesktopRuntimeAdapterMetadata

export const CODEX_APP_SERVER_DESKTOP_ADAPTER_METADATA = {
  runtimeId: "codex",
  source: "codex-app-server",
  label: "Codex app-server adapter",
  temporaryFallback: false,
  fallbackReason: null,
  defaultDisableCondition: null,
  removalCondition: null,
} satisfies DesktopRuntimeAdapterMetadata
