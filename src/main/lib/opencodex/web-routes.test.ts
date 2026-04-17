import { describe, expect, test } from "bun:test"
import {
  getOpenCodexAgentsApiBaseUrl,
  getOpenCodexAutomationsUrl,
} from "./web-routes"

describe("OpenCodex web routes", () => {
  test("derives the agents api base url from the OpenCodex web host seam", () => {
    expect(getOpenCodexAgentsApiBaseUrl({})).toBe("https://opencodex.invalid")
    expect(
      getOpenCodexAgentsApiBaseUrl({ OPENCODEX_WEB_URL: " https://desktop.opencodex.example/root/ " }),
    ).toBe("https://desktop.opencodex.example/root")
    expect(
      getOpenCodexAgentsApiBaseUrl({ MAIN_VITE_API_URL: " https://api.opencodex.example/base/ " }),
    ).toBe("https://api.opencodex.example/base")
  })

  test("builds automations url from the OpenCodex web host seam", () => {
    expect(getOpenCodexAutomationsUrl("https://desktop.opencodex.example/root/")).toBe(
      "https://desktop.opencodex.example/root/agents/app/automations",
    )
  })
})
