import type { DesktopRuntimeAdapterMetadata } from "./desktop-runner"

export const CLAUDE_AGENT_SDK_DESKTOP_ADAPTER_METADATA = {
  runtimeId: "claude-code",
  source: "claude-agent-sdk",
  label: "Claude Agent SDK",
  temporaryFallback: false,
  fallbackReason: null,
  defaultDisableCondition: null,
  removalCondition: null,
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
