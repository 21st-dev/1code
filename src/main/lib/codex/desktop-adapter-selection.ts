import type { CodexDesktopAdapterSource } from "./adapter-types"

type EnvLike = Record<string, string | undefined>

export type CodexDesktopAdapterSelection = {
  source: CodexDesktopAdapterSource
  useAppServer: true
  reason: string
}

export function resolveCodexDesktopAdapterSelection(
  _env: EnvLike = process.env,
): CodexDesktopAdapterSelection {
  return {
    source: "codex-app-server",
    useAppServer: true,
    reason: "Codex app-server is the only desktop chat adapter.",
  }
}
