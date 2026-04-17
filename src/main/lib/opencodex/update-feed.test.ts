import { describe, expect, test } from "bun:test"
import { getOpenCodexUpdateFeedBaseUrl } from "./update-feed"

describe("getOpenCodexUpdateFeedBaseUrl", () => {
  test("uses an explicit OpenCodex update feed override when configured", () => {
    expect(
      getOpenCodexUpdateFeedBaseUrl({
        OPENCODEX_UPDATE_BASE_URL: "https://updates.opencodex.test/releases/desktop/",
      }),
    ).toBe("https://updates.opencodex.test/releases/desktop")
  })

  test("falls back to the OpenCodex-owned placeholder feed when no update target is configured", () => {
    expect(getOpenCodexUpdateFeedBaseUrl({})).toBe("https://updates.opencodex.invalid/releases/desktop")
  })
})
