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

export const QWEN_ACP_CLIENT_DESKTOP_ADAPTER_METADATA = {
  runtimeId: "qwen-code",
  source: "qwen-acp-client",
  label: "Qwen ACP client adapter",
  temporaryFallback: false,
  fallbackReason: null,
  defaultDisableCondition: "LOCUS_ENABLE_QWEN_CODE_RUNTIME is not enabled",
  removalCondition: null,
} satisfies DesktopRuntimeAdapterMetadata

export const KUN_HTTP_SSE_DESKTOP_ADAPTER_METADATA = {
  runtimeId: "kun",
  source: "kun-http-sse",
  label: "Kun HTTP/SSE adapter",
  temporaryFallback: false,
  fallbackReason: null,
  defaultDisableCondition: "LOCUS_ENABLE_KUN_RUNTIME is not enabled",
  removalCondition: null,
} satisfies DesktopRuntimeAdapterMetadata
