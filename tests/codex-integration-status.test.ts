import { describe, expect, test } from "bun:test"
import {
  isCodexIntegrationConnected,
  normalizeCodexIntegrationState,
} from "../src/main/lib/codex/integration-state"

describe("Codex integration status", () => {
  test("normalizes Codex login status output", () => {
    expect(normalizeCodexIntegrationState("Logged in using ChatGPT")).toBe(
      "connected_chatgpt",
    )
    expect(normalizeCodexIntegrationState("logged in using an API key")).toBe(
      "connected_api_key",
    )
    expect(normalizeCodexIntegrationState("logged in using api key")).toBe(
      "connected_api_key",
    )
    expect(normalizeCodexIntegrationState("not logged in")).toBe(
      "not_logged_in",
    )
    expect(normalizeCodexIntegrationState("unexpected output")).toBe("unknown")
  })

  test("classifies connected states", () => {
    expect(isCodexIntegrationConnected("connected_chatgpt")).toBe(true)
    expect(isCodexIntegrationConnected("connected_api_key")).toBe(true)
    expect(isCodexIntegrationConnected("not_logged_in")).toBe(false)
    expect(isCodexIntegrationConnected("unknown")).toBe(false)
  })
})
