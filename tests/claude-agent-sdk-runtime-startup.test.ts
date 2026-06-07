import { describe, expect, mock, test } from "bun:test"
import { join } from "node:path"
import {
  prepareClaudeAgentSdkRuntimeStartupForDesktopRun,
  prepareClaudeAgentSdkRuntimeStartupContext,
  prepareClaudeAgentSdkRuntimeStartupDiagnostics,
} from "../src/main/lib/claude/agent-sdk-runtime-startup"

describe("Claude Agent SDK runtime startup", () => {
  test("prepares isolated config and runtime environment through one owner helper", () => {
    const startup = prepareClaudeAgentSdkRuntimeStartupContext({
      chatId: "chat-1",
      subChatId: "sub-1",
      isUsingOllama: false,
      getUserDataDir: () => "/tmp/locus-user-data",
      customConfig: {
        model: "provider-model",
        baseUrl: "https://provider.example.com",
        token: "provider-token",
        authMode: "auth_token",
      },
      requestedModel: "requested-model",
      nodeEnv: "production",
      buildEnv: (options) => ({
        ...(options?.customEnv ?? {}),
      }),
    })

    expect(startup.isolatedConfig).toEqual({
      isolatedConfigDir: join("/tmp/locus-user-data", "claude-sessions", "sub-1"),
      cacheKey: "sub-1",
    })
    expect(startup.isolatedConfigDir).toBe(startup.isolatedConfig.isolatedConfigDir)
    expect(startup.resolvedModel).toBe("provider-model")
    expect(startup.finalEnv).toMatchObject({
      ANTHROPIC_BASE_URL: "https://provider.example.com",
      ANTHROPIC_AUTH_TOKEN: "provider-token",
      CLAUDE_CONFIG_DIR: startup.isolatedConfigDir,
    })
    expect(startup.hasExistingApiConfig).toBe(true)
  })

  test("uses chat-scoped config for Ollama startup and requested model fallback", () => {
    const startup = prepareClaudeAgentSdkRuntimeStartupContext({
      chatId: "chat-1",
      subChatId: "sub-1",
      isUsingOllama: true,
      getUserDataDir: () => "/tmp/locus-user-data",
      requestedModel: "requested-model",
      nodeEnv: "production",
      buildEnv: () => ({}),
    })

    expect(startup.isolatedConfig).toEqual({
      isolatedConfigDir: join("/tmp/locus-user-data", "claude-sessions", "chat-1"),
      cacheKey: "chat-1",
    })
    expect(startup.resolvedModel).toBe("requested-model")
  })

  test("ensures isolated config during desktop runtime startup", async () => {
    const ensureIsolatedConfigDir = mock(async () => {})

    const result = await prepareClaudeAgentSdkRuntimeStartupForDesktopRun({
      chatId: "chat-1",
      subChatId: "sub-1",
      isUsingOllama: false,
      getUserDataDir: () => "/tmp/locus-user-data",
      requestedModel: "requested-model",
      nodeEnv: "production",
      buildEnv: () => ({}),
      ensureIsolatedConfigDir,
    })

    expect(result.isolatedConfigReady).toBe(true)
    expect(result.runtimeStartup.isolatedConfig).toEqual({
      isolatedConfigDir: join(
        "/tmp/locus-user-data",
        "claude-sessions",
        "sub-1",
      ),
      cacheKey: "sub-1",
    })
    expect(ensureIsolatedConfigDir).toHaveBeenCalledWith(
      result.runtimeStartup.isolatedConfig,
    )
  })

  test("keeps startup context when isolated config setup fails", async () => {
    const setupError = new Error("mkdir failed")
    const ensureIsolatedConfigDir = mock(async () => {
      throw setupError
    })
    const error = mock(() => {})

    const result = await prepareClaudeAgentSdkRuntimeStartupForDesktopRun({
      chatId: "chat-1",
      subChatId: "sub-1",
      isUsingOllama: false,
      getUserDataDir: () => "/tmp/locus-user-data",
      requestedModel: "requested-model",
      nodeEnv: "production",
      buildEnv: () => ({}),
      ensureIsolatedConfigDir,
      error,
    })

    expect(result.isolatedConfigReady).toBe(false)
    expect(result.runtimeStartup.isolatedConfig.cacheKey).toBe("sub-1")
    expect(error).toHaveBeenCalledWith(
      "[claude] Failed to setup isolated config dir:",
      setupError,
    )
  })

  test("maps runtime startup context into Ollama diagnostics", async () => {
    const runtimeStartup = prepareClaudeAgentSdkRuntimeStartupContext({
      chatId: "chat-1",
      subChatId: "sub-1",
      isUsingOllama: true,
      getUserDataDir: () => "/tmp/locus-user-data",
      customConfig: {
        model: "qwen",
        baseUrl: "http://127.0.0.1:11434/v1",
        token: "ollama",
        authMode: "auth_token",
      },
      requestedModel: "requested-model",
      nodeEnv: "production",
      buildEnv: (options) => ({
        ...(options?.customEnv ?? {}),
      }),
    })
    const calls: unknown[] = []

    await prepareClaudeAgentSdkRuntimeStartupDiagnostics({
      isUsingOllama: true,
      customConfig: {
        model: "qwen",
        baseUrl: "http://127.0.0.1:11434/v1",
      },
      runtimeStartup,
      cwd: "/repo",
      resumeSessionId: "session-1",
      prepareOllamaStartupDiagnostics: async (input) => {
        calls.push(input)
      },
    })

    expect(calls).toEqual([
      {
        isUsingOllama: true,
        customConfig: {
          model: "qwen",
          baseUrl: "http://127.0.0.1:11434/v1",
        },
        model: "qwen",
        baseUrl: "http://127.0.0.1:11434/v1",
        cwd: "/repo",
        configDir: join("/tmp/locus-user-data", "claude-sessions", "chat-1"),
        hasAuthToken: true,
        resumeSessionId: "session-1",
      },
    ])
  })
})
