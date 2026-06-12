import { describe, expect, test } from "bun:test"
import {
  LEGACY_LOCUS_CODEX_APP_SERVER_ADAPTER_ENV,
  LOCUS_CODEX_USE_ACP_TEMPORARY_COMPAT_ENV,
  resolveCodexDesktopAdapterSelection,
} from "../src/main/lib/codex/desktop-adapter-selection"

describe("Codex desktop adapter selection", () => {
  test("selects app-server by default", () => {
    expect(resolveCodexDesktopAdapterSelection({})).toMatchObject({
      source: "codex-app-server",
      useAppServer: true,
      acpFallbackAvailable: true,
      reason: expect.stringContaining("selected by default"),
    })
  })

  test("keeps the legacy app-server opt-in env as a non-breaking no-op", () => {
    expect(
      resolveCodexDesktopAdapterSelection({
        [LEGACY_LOCUS_CODEX_APP_SERVER_ADAPTER_ENV]: "1",
      }),
    ).toMatchObject({
      source: "codex-app-server",
      useAppServer: true,
      reason: expect.stringContaining("legacy explicit adapter gate"),
    })
  })

  test("selects ACP only through an explicit rollback env", () => {
    expect(
      resolveCodexDesktopAdapterSelection({
        [LOCUS_CODEX_USE_ACP_TEMPORARY_COMPAT_ENV]: "1",
      }),
    ).toMatchObject({
      source: "codex-acp-temporary-compat",
      useAppServer: false,
      reason: expect.stringContaining(
        "ACP temporary-compat fallback selected",
      ),
    })
  })

  test("preserves legacy disabled gate as a rollback escape hatch", () => {
    expect(
      resolveCodexDesktopAdapterSelection({
        [LEGACY_LOCUS_CODEX_APP_SERVER_ADAPTER_ENV]: "0",
      }),
    ).toMatchObject({
      source: "codex-acp-temporary-compat",
      useAppServer: false,
      reason: expect.stringContaining("legacy"),
    })
  })
})
