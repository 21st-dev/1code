import { describe, expect, test } from "bun:test"
import {
  bridgeOpenCodexBackendConfig,
  getOpenCodexBackendTemplate,
} from "./opencodex-backend-config"

describe("OpenCodex backend config bridge", () => {
  test("maps Codex subscription routes onto the codex runtime seam without an api key", () => {
    const bridge = bridgeOpenCodexBackendConfig({
      kind: "codex-subscription",
      authSource: "codex-local-auth",
    })

    expect(bridge.billingMethod).toBe("codex-subscription")
    expect(bridge.codexOnboardingCompleted).toBe(true)
    expect(bridge.codexOnboardingAuthMethod).toBe("chatgpt")
    expect(bridge.codexApiKey).toBe("")
    expect(bridge.lastSelectedAgentId).toBe("codex")
  })

  test("maps anthropic-compatible api routes onto the claude bridge state", () => {
    const bridge = bridgeOpenCodexBackendConfig({
      kind: "anthropic-compatible-api",
      authSource: "api-key",
      baseUrl: "https://api.anthropic.com",
      model: "claude-sonnet-4-6",
      apiKey: "sk-ant-123456789012345678901",
    })

    expect(bridge.billingMethod).toBe("api-key")
    expect(bridge.apiKeyOnboardingCompleted).toBe(true)
    expect(bridge.customClaudeConfig).toEqual({
      model: "claude-sonnet-4-6",
      token: "sk-ant-123456789012345678901",
      baseUrl: "https://api.anthropic.com",
    })
    expect(bridge.lastSelectedAgentId).toBe("claude-code")
  })

  test("maps custom endpoint routes onto the custom-model bridge state", () => {
    const bridge = bridgeOpenCodexBackendConfig({
      kind: "custom-endpoint",
      authSource: "api-key",
      providerFamily: "openai-compatible",
      baseUrl: "http://127.0.0.1:8000/v1",
      model: "opencodex-default",
      apiKey: "sk-custom-endpoint",
    })

    expect(bridge.billingMethod).toBe("custom-model")
    expect(bridge.customClaudeConfig).toEqual({
      model: "opencodex-default",
      token: "sk-custom-endpoint",
      baseUrl: "http://127.0.0.1:8000/v1",
    })
  })

  test("provides stable route templates for onboarding and settings", () => {
    expect(getOpenCodexBackendTemplate("openai-compatible-api")).toEqual({
      kind: "openai-compatible-api",
      authSource: "api-key",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-5.2",
      apiKey: "",
    })
    expect(getOpenCodexBackendTemplate("codex-subscription")).toEqual({
      kind: "codex-subscription",
      authSource: "codex-local-auth",
    })
    expect(getOpenCodexBackendTemplate("custom-endpoint")).toEqual({
      kind: "custom-endpoint",
      authSource: "api-key",
      providerFamily: "openai-compatible",
      baseUrl: "http://127.0.0.1:8000/v1",
      model: "opencodex-default",
      apiKey: "",
    })
  })
})