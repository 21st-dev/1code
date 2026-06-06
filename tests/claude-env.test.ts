import { describe, expect, test } from "bun:test"
import { createClaudeAgentSdkRuntimeEnv } from "../src/main/lib/claude/env"

describe("Claude runtime environment", () => {
  test("adds OAuth token only when no explicit API config exists", () => {
    expect(
      createClaudeAgentSdkRuntimeEnv({
        claudeEnv: { PATH: "/bin" },
        claudeCodeToken: "oauth-token",
        isolatedConfigDir: "/tmp/claude-config",
      }),
    ).toEqual({
      hasExistingApiConfig: false,
      env: {
        PATH: "/bin",
        CLAUDE_CODE_OAUTH_TOKEN: "oauth-token",
        CLAUDE_CONFIG_DIR: "/tmp/claude-config",
      },
    })

    expect(
      createClaudeAgentSdkRuntimeEnv({
        claudeEnv: {
          ANTHROPIC_AUTH_TOKEN: "provider-token",
          ANTHROPIC_BASE_URL: "https://provider.example.com",
        },
        claudeCodeToken: "oauth-token",
        isolatedConfigDir: "/tmp/claude-config",
      }),
    ).toEqual({
      hasExistingApiConfig: true,
      env: {
        ANTHROPIC_AUTH_TOKEN: "provider-token",
        ANTHROPIC_BASE_URL: "https://provider.example.com",
        CLAUDE_CONFIG_DIR: "/tmp/claude-config",
      },
    })
  })
})
