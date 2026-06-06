import { describe, expect, test } from "bun:test"
import {
  resolveClaudeAgentSdkProviderStartup,
  type ClaudeAgentSdkProviderStartupDependencies,
} from "../src/main/lib/claude/agent-sdk-provider-startup"

const credentialMetadata = {
  source: "test",
  storageFormat: "envelope",
  refreshable: false,
} as any

function providerProfile(overrides: Record<string, any> = {}) {
  return {
    id: "profile-1",
    name: "Profile 1",
    presetId: null,
    protocol: "anthropic",
    baseUrl: "https://provider.example.com",
    defaultModel: "claude-profile-model",
    authMode: "bearer",
    token: "profile-token",
    headers: {},
    targetRuntimes: ["claude"],
    capabilities: {},
    ...overrides,
  } as any
}

function dependencies(
  overrides: Partial<ClaudeAgentSdkProviderStartupDependencies> = {},
): Partial<ClaudeAgentSdkProviderStartupDependencies> {
  return {
    parseProviderProfileSource: (source) =>
      source?.startsWith("provider-profile:")
        ? source.slice("provider-profile:".length)
        : null,
    getProviderProfileRuntimeConfig: () => null,
    getProviderGatewayEndpoint: async (providerId, kind) => ({
      baseUrl: `http://127.0.0.1:45100/profile/${providerId}/${kind}/v1`,
      token: `gateway-token-${providerId}`,
      providerId,
    }),
    getLegacyClaudeProviderProfileId: () => null,
    getActiveClaudeProviderConfig: () => undefined,
    getValidClaudeCodeCredential: async () => ({
      accessToken: "oauth-token",
      metadata: credentialMetadata,
    }),
    checkOfflineFallback: async (config) => ({
      config,
      isUsingOllama: Boolean(config?.baseUrl.includes("localhost:11434")),
    }),
    assertOfficialCloudAllowed: () => {},
    ...overrides,
  }
}

describe("Claude Agent SDK provider startup", () => {
  test("resolves selected Claude provider profiles through the gateway", async () => {
    let credentialCalled = false
    const result = await resolveClaudeAgentSdkProviderStartup({
      modelSource: "provider-profile:profile-1",
      dependencies: dependencies({
        getProviderProfileRuntimeConfig: (id) => providerProfile({ id }),
        getValidClaudeCodeCredential: async () => {
          credentialCalled = true
          throw new Error("unexpected credential lookup")
        },
      }),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected startup success")
    expect(credentialCalled).toBe(false)
    expect(result.startup.selectedProviderProfileId).toBe("profile-1")
    expect(result.startup.claudeCodeToken).toBeNull()
    expect(result.startup.finalCustomConfig).toMatchObject({
      model: "claude-profile-model",
      baseUrl:
        "http://127.0.0.1:45100/profile/profile-1/anthropic/v1",
      token: "gateway-token-profile-1",
      authMode: "auth_token",
    })
  })

  test("blocks provider profiles that are missing or not Claude-capable", async () => {
    const result = await resolveClaudeAgentSdkProviderStartup({
      modelSource: "provider-profile:codex-only",
      dependencies: dependencies({
        getProviderProfileRuntimeConfig: () =>
          providerProfile({ id: "codex-only", targetRuntimes: ["codex"] }),
      }),
    })

    expect(result).toMatchObject({
      ok: false,
      blocker: {
        id: "provider-profile",
        status: "blocked",
        message: "Provider profile is not available for Claude.",
      },
    })
  })

  test("blocks custom-provider runs when neither legacy nor active config exists", async () => {
    let credentialCalled = false
    const result = await resolveClaudeAgentSdkProviderStartup({
      modelSource: "custom-provider",
      dependencies: dependencies({
        getValidClaudeCodeCredential: async () => {
          credentialCalled = true
          throw new Error("unexpected credential lookup")
        },
      }),
    })

    expect(credentialCalled).toBe(false)
    expect(result).toMatchObject({
      ok: false,
      blocker: {
        id: "provider-profile",
        status: "needs-auth",
        message: "Custom provider is not configured.",
      },
    })
  })

  test("uses Claude Code OAuth metadata before offline fallback", async () => {
    const result = await resolveClaudeAgentSdkProviderStartup({
      offlineModeEnabled: true,
      dependencies: dependencies({
        getValidClaudeCodeCredential: async () => ({
          accessToken: "oauth-token",
          metadata: credentialMetadata,
        }),
        checkOfflineFallback: async (_config, token, _model, offline) => {
          expect(token).toBe("oauth-token")
          expect(offline).toBe(true)
          return {
            config: {
              model: "qwen2.5-coder:7b",
              baseUrl: "http://localhost:11434/v1",
              token: "ollama",
            },
            isUsingOllama: true,
          }
        },
      }),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected startup success")
    expect(result.startup.claudeCodeToken).toBe("oauth-token")
    expect(result.startup.claudeCredentialMetadata).toBe(credentialMetadata)
    expect(result.startup.isUsingOllama).toBe(true)
    expect(result.startup.finalCustomConfig).toMatchObject({
      model: "qwen2.5-coder:7b",
      baseUrl: "http://localhost:11434/v1",
      token: "ollama",
      authMode: "auth_token",
    })
  })

  test("converts credential and offline failures into preflight blockers", async () => {
    const credentialResult = await resolveClaudeAgentSdkProviderStartup({
      dependencies: dependencies({
        getValidClaudeCodeCredential: async () => {
          throw new Error("expired")
        },
      }),
    })
    expect(credentialResult).toMatchObject({
      ok: false,
      blocker: {
        id: "provider-profile",
        status: "needs-auth",
        message: "Claude Code credential unavailable: expired",
      },
    })

    const offlineResult = await resolveClaudeAgentSdkProviderStartup({
      dependencies: dependencies({
        checkOfflineFallback: async () => ({
          config: undefined,
          isUsingOllama: false,
          error: "No internet connection and Ollama is not available.",
        }),
      }),
    })
    expect(offlineResult).toMatchObject({
      ok: false,
      blocker: {
        id: "provider-profile",
        status: "blocked",
        message:
          "Offline mode unavailable: No internet connection and Ollama is not available.",
      },
    })
  })

  test("keeps local-only endpoint blocking inside provider startup", async () => {
    const result = await resolveClaudeAgentSdkProviderStartup({
      modelSource: "custom-provider",
      dependencies: dependencies({
        getActiveClaudeProviderConfig: () => ({
          model: "claude",
          baseUrl: "https://api.anthropic.com",
          token: "token",
          authMode: "auth_token",
        }),
        assertOfficialCloudAllowed: () => {
          throw new Error(
            "Official cloud endpoints are blocked in local-only mode.",
          )
        },
      }),
    })

    expect(result).toMatchObject({
      ok: false,
      blocker: {
        id: "local-only",
        status: "blocked",
        message: "Official cloud endpoints are blocked in local-only mode.",
      },
    })
  })
})
