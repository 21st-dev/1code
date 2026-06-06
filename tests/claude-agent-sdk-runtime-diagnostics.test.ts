import { describe, expect, test } from "bun:test"
import {
  logClaudeAgentSdkAuthDiagnostics,
  logClaudeAgentSdkProviderDiagnostics,
  logClaudeAgentSdkSessionDiagnostics,
  logClaudeAgentSdkStartupDiagnostics,
} from "../src/main/lib/claude/agent-sdk-runtime-diagnostics"

function captureLogger() {
  const calls: any[][] = []
  return {
    calls,
    logger: {
      log: (...args: any[]) => calls.push(args),
    },
  }
}

describe("Claude Agent SDK runtime diagnostics", () => {
  test("logs auth diagnostics with redacted provider endpoint values", () => {
    const { calls, logger } = captureLogger()

    logClaudeAgentSdkAuthDiagnostics({
      hasExistingApiConfig: true,
      claudeCodeToken: "oauth-token",
      credentialMetadata: {
        source: "stored",
        storageFormat: "json",
        refreshable: true,
        expiresAt: "2026-06-07T00:00:00.000Z",
      },
      finalEnv: {
        ANTHROPIC_API_KEY: "sk-secret",
        ANTHROPIC_BASE_URL: "https://api.example.com?api_key=secret-token",
        CLAUDE_CODE_OAUTH_TOKEN: "oauth-token",
      },
      logger,
    })

    const serialized = JSON.stringify(calls)
    expect(serialized).toContain("Using explicit Claude provider config")
    expect(serialized).toContain("[claude-auth] hasExistingApiConfig:")
    expect(serialized).toContain("[claude-auth] credential metadata:")
    expect(serialized).not.toContain("secret-token")
  })

  test("logs session diagnostics with the expected Claude session path", () => {
    const { calls, logger } = captureLogger()

    logClaudeAgentSdkSessionDiagnostics({
      subChatId: "sub-1",
      cwd: "/repo/app",
      isolatedConfigDir: "/tmp/claude-sessions/sub-1",
      resumeSessionId: "session-1",
      existingSessionId: "session-0",
      resumeAtUuid: "uuid-1",
      shouldForkResume: true,
      forkResumeAtUuid: "uuid-fork",
      logger,
    })

    const serialized = JSON.stringify(calls)
    expect(serialized).toContain("SESSION DEBUG")
    expect(serialized).toContain("-repo-app")
    expect(serialized).toContain(
      "/tmp/claude-sessions/sub-1/projects/-repo-app/session-1.jsonl",
    )
    expect(serialized).toContain("Fork resume: true")
  })

  test("logs provider diagnostics for default, Ollama, and custom provider runs", () => {
    const defaultLogs = captureLogger()
    logClaudeAgentSdkProviderDiagnostics({
      cwd: "/repo",
      projectPath: "/project",
      mcpServers: { git: {}, fs: {} },
      isUsingOllama: false,
      logger: defaultLogs.logger,
    })
    expect(JSON.stringify(defaultLogs.calls)).toContain("mcpServers: git, fs")

    const ollamaLogs = captureLogger()
    logClaudeAgentSdkProviderDiagnostics({
      cwd: "/repo",
      finalCustomConfig: {
        model: "qwen",
        baseUrl: "http://127.0.0.1:11434",
        token: "token",
        authMode: "auth_token",
      },
      isUsingOllama: true,
      logger: ollamaLogs.logger,
    })
    expect(JSON.stringify(ollamaLogs.calls)).toContain(
      "Using offline mode - Model: qwen",
    )

    const providerLogs = captureLogger()
    logClaudeAgentSdkProviderDiagnostics({
      cwd: "/repo",
      finalCustomConfig: {
        model: "claude-sonnet",
        baseUrl: "https://api.anthropic.com",
        token: "token",
        authMode: "api_key",
      },
      isUsingOllama: false,
      logger: providerLogs.logger,
    })
    expect(JSON.stringify(providerLogs.calls)).toContain(
      "Custom provider config",
    )
  })

  test("logs startup diagnostics through the Claude runtime owner helper", () => {
    const { calls, logger } = captureLogger()

    logClaudeAgentSdkStartupDiagnostics({
      auth: {
        hasExistingApiConfig: true,
        claudeCodeToken: "oauth-token",
        credentialMetadata: { source: "stored" },
        finalEnv: {
          ANTHROPIC_API_KEY: "sk-secret",
          CLAUDE_CODE_OAUTH_TOKEN: "oauth-token",
        },
      },
      session: {
        subChatId: "sub-1",
        cwd: "/repo",
        isolatedConfigDir: "/tmp/claude-sessions/sub-1",
        resumeSessionId: "session-1",
        existingSessionId: "session-0",
        shouldForkResume: false,
      },
      provider: {
        cwd: "/repo",
        projectPath: "/project",
        mcpServers: { git: {} },
        isUsingOllama: false,
      },
      logger,
    })

    const serialized = JSON.stringify(calls)
    expect(serialized).toContain("AUTH METHOD USED")
    expect(serialized).toContain("SESSION DEBUG")
    expect(serialized).toContain("mcpServers: git")
    expect(serialized.indexOf("AUTH METHOD USED")).toBeLessThan(
      serialized.indexOf("SESSION DEBUG"),
    )
    expect(serialized.indexOf("SESSION DEBUG")).toBeLessThan(
      serialized.indexOf("mcpServers: git"),
    )
  })
})
