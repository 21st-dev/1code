import type {
  DesktopRuntimeAdapter,
  DesktopRuntimeAdapterMetadata,
  DesktopRuntimeAdapterSource,
} from "../agent-runtime/desktop-runner"

export type CodexDesktopAdapterSource = Extract<
  DesktopRuntimeAdapterSource,
  "codex-app-server"
>

export type CodexDesktopAdapterMetadata = DesktopRuntimeAdapterMetadata & {
  runtimeId: "codex"
  source: CodexDesktopAdapterSource
}

export type CodexDesktopAdapter = DesktopRuntimeAdapter & {
  metadata: CodexDesktopAdapterMetadata
}
