import { describe, expect, test } from "bun:test"
import {
  getOpenCodexAgentsChangelogUrl,
  getOpenCodexChangelogApiUrl,
  getOpenCodexChangelogUrl,
} from "./changelog-url"

describe("getOpenCodexChangelogUrl", () => {
  test("builds the changelog URL from the desktop-owned web base url", () => {
    expect(
      getOpenCodexChangelogUrl("https://desktop.opencodex.example"),
    ).toBe("https://desktop.opencodex.example/changelog")
  })

  test("trims trailing slashes and appends a version anchor when provided", () => {
    expect(
      getOpenCodexChangelogUrl("https://desktop.opencodex.example/root/", "1.2.3"),
    ).toBe("https://desktop.opencodex.example/root/changelog#v1.2.3")
  })
})

describe("agents changelog paths", () => {
  test("builds the agents changelog URL from the desktop-owned web base url", () => {
    expect(
      getOpenCodexAgentsChangelogUrl("https://desktop.opencodex.example/root/", "0.9.0"),
    ).toBe("https://desktop.opencodex.example/root/agents/changelog#0.9.0")
  })

  test("builds the changelog api URL from the desktop-owned web base url", () => {
    expect(
      getOpenCodexChangelogApiUrl("https://desktop.opencodex.example/root/", 3),
    ).toBe("https://desktop.opencodex.example/root/api/changelog/desktop?per_page=3")
  })
})
