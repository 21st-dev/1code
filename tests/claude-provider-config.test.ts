import { describe, expect, test } from "bun:test"
import {
  buildClaudeProviderEnv,
  normalizeClaudeProviderRuntimeConfig,
  redactClaudeProviderEnvValueForLog,
} from "../src/main/lib/claude/provider-runtime-config"

describe("Claude provider config helpers", () => {
  test("normalizes runtime provider configs with auth token default", () => {
    expect(
      normalizeClaudeProviderRuntimeConfig({
        model: "claude-sonnet",
        token: "token-1",
        baseUrl: "http://127.0.0.1:11434/v1",
      }),
    ).toEqual({
      model: "claude-sonnet",
      token: "token-1",
      baseUrl: "http://127.0.0.1:11434/v1",
      authMode: "auth_token",
    })

    expect(
      normalizeClaudeProviderRuntimeConfig({
        model: "claude-sonnet",
        token: "sk-test",
        baseUrl: "https://api.anthropic.com",
        authMode: "api_key",
      }),
    ).toMatchObject({ authMode: "api_key" })
  })

  test("builds provider env and redacts provider log values", () => {
    expect(
      buildClaudeProviderEnv({
        model: "claude-sonnet",
        token: "token-1",
        baseUrl: "https://api.example.com",
        authMode: "auth_token",
      }),
    ).toEqual({
      ANTHROPIC_BASE_URL: "https://api.example.com",
      ANTHROPIC_AUTH_TOKEN: "token-1",
      ANTHROPIC_API_KEY: "",
    })

    expect(redactClaudeProviderEnvValueForLog(undefined)).toBe("(default)")
    expect(redactClaudeProviderEnvValueForLog("Bearer secret-token")).toBe(
      "Bearer ***",
    )
  })
})
