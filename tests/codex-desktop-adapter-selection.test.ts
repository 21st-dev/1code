import { describe, expect, test } from "bun:test"
import { resolveCodexDesktopAdapterSelection } from "../src/main/lib/codex/desktop-adapter-selection"

describe("Codex desktop adapter selection", () => {
  test("selects app-server as the only desktop chat adapter", () => {
    expect(resolveCodexDesktopAdapterSelection({})).toMatchObject({
      source: "codex-app-server",
      useAppServer: true,
      reason: expect.stringContaining("only desktop chat adapter"),
    })
  })

  test("ignores adapter-selection env input", () => {
    expect(
      resolveCodexDesktopAdapterSelection({
        ANY_LEGACY_ADAPTER_ENV: "0",
        ANY_ROLLBACK_ADAPTER_ENV: "1",
      }),
    ).toMatchObject({
      source: "codex-app-server",
      useAppServer: true,
    })
  })
})
