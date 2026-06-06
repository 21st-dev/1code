import { describe, expect, test } from "bun:test"
import {
  createClaudeAgentSdkRuntimeEnv,
  prepareClaudeAgentSdkRuntimeEnvironment,
} from "../src/main/lib/claude/env"

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

  test("prepares Claude Agent SDK runtime environment with provider overrides and dev logging", () => {
    const buildCalls: unknown[] = []
    const logCalls: unknown[][] = []

    const runtimeEnvironment = prepareClaudeAgentSdkRuntimeEnvironment({
      customConfig: {
        model: "claude-sonnet-4",
        baseUrl: "https://provider.example.com",
        token: "provider-token",
        authMode: "auth_token",
      },
      enableTasks: false,
      claudeCodeToken: "oauth-token",
      isolatedConfigDir: "/tmp/claude-config",
      logPrefix: "[sub-1] ",
      nodeEnv: "development",
      buildEnv: (options) => {
        buildCalls.push(options)
        return {
          PATH: "/bin",
          ...(options?.customEnv ?? {}),
          CLAUDE_CODE_ENABLE_TASKS:
            options?.enableTasks === false ? "false" : "true",
        }
      },
      logEnv: (...args) => {
        logCalls.push(args)
      },
    })

    expect(buildCalls).toEqual([
      {
        customEnv: {
          ANTHROPIC_BASE_URL: "https://provider.example.com",
          ANTHROPIC_AUTH_TOKEN: "provider-token",
          ANTHROPIC_API_KEY: "",
        },
        enableTasks: false,
      },
    ])
    expect(logCalls).toEqual([
      [
        {
          PATH: "/bin",
          ANTHROPIC_BASE_URL: "https://provider.example.com",
          ANTHROPIC_AUTH_TOKEN: "provider-token",
          ANTHROPIC_API_KEY: "",
          CLAUDE_CODE_ENABLE_TASKS: "false",
        },
        "[sub-1] ",
      ],
    ])
    expect(runtimeEnvironment).toEqual({
      claudeEnv: {
        PATH: "/bin",
        ANTHROPIC_BASE_URL: "https://provider.example.com",
        ANTHROPIC_AUTH_TOKEN: "provider-token",
        ANTHROPIC_API_KEY: "",
        CLAUDE_CODE_ENABLE_TASKS: "false",
      },
      finalEnv: {
        PATH: "/bin",
        ANTHROPIC_BASE_URL: "https://provider.example.com",
        ANTHROPIC_AUTH_TOKEN: "provider-token",
        ANTHROPIC_API_KEY: "",
        CLAUDE_CODE_ENABLE_TASKS: "false",
        CLAUDE_CONFIG_DIR: "/tmp/claude-config",
      },
      hasExistingApiConfig: true,
    })
  })
})
