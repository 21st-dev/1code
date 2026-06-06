import type { DesktopRuntimeAdapterMetadata } from "./desktop-runner"

export const CLAUDE_AGENT_SDK_DESKTOP_ADAPTER_METADATA: DesktopRuntimeAdapterMetadata = {
  runtimeId: "claude-code",
  source: "claude-agent-sdk",
  label: "Claude Agent SDK",
  temporaryFallback: false,
  fallbackReason: null,
}

export const CODEX_ACP_TEMPORARY_COMPAT_DESKTOP_ADAPTER_METADATA: DesktopRuntimeAdapterMetadata = {
  runtimeId: "codex",
  source: "codex-acp-temporary-compat",
  label: "Codex ACP temporary compatibility adapter",
  temporaryFallback: true,
  fallbackReason:
    "Codex app-server is the target desktop/chat adapter but is not implemented in this change.",
}

