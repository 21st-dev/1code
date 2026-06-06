import type { DesktopRunPreflightBlocker } from "../agent-runtime/preflight"
import type { ClaudeCodeCredentialMetadata } from "../claude-credentials"
import type { ProviderProfileRuntimeConfig } from "../provider-profiles/storage"
import { parseProviderProfileSource } from "../../../shared/provider-profile-types"
import {
  normalizeClaudeProviderRuntimeConfig,
  type ClaudeProviderRuntimeConfig,
} from "./provider-runtime-config"

type MaybePromise<T> = T | Promise<T>

type ProviderGatewayEndpoint = {
  baseUrl: string
  token: string
  providerId: string
}

type ClaudeOfflineFallbackConfig = Parameters<
  typeof normalizeClaudeProviderRuntimeConfig
>[0]

type ClaudeOfflineFallbackResult = {
  config: ClaudeOfflineFallbackConfig | undefined
  isUsingOllama: boolean
  error?: string
}

export type ClaudeAgentSdkProviderStartup = {
  selectedProviderProfileId: string | null
  claudeCodeToken: string | null
  claudeCredentialMetadata: ClaudeCodeCredentialMetadata | null
  finalCustomConfig?: ClaudeProviderRuntimeConfig
  isUsingOllama: boolean
}

export type ClaudeAgentSdkProviderStartupResult =
  | {
      ok: true
      startup: ClaudeAgentSdkProviderStartup
    }
  | {
      ok: false
      blocker: DesktopRunPreflightBlocker
    }

export type ClaudeAgentSdkProviderStartupDependencies = {
  parseProviderProfileSource: (
    source: string | undefined | null,
  ) => MaybePromise<string | null>
  getProviderProfileRuntimeConfig: (
    id: string,
  ) => MaybePromise<ProviderProfileRuntimeConfig | null>
  getProviderGatewayEndpoint: (
    providerId: string,
    kind: "anthropic",
  ) => Promise<ProviderGatewayEndpoint>
  getLegacyClaudeProviderProfileId: () => MaybePromise<string | null>
  getActiveClaudeProviderConfig: () => MaybePromise<
    ClaudeProviderRuntimeConfig | undefined
  >
  getValidClaudeCodeCredential: () => Promise<{
    accessToken: string | null
    metadata: ClaudeCodeCredentialMetadata
  }>
  checkOfflineFallback: (
    customConfig: ClaudeProviderRuntimeConfig | undefined,
    claudeCodeToken: string | null,
    selectedOllamaModel?: string | null,
    offlineModeEnabled?: boolean,
  ) => Promise<ClaudeOfflineFallbackResult>
  assertOfficialCloudAllowed: (
    operation: string,
    url?: string | null,
  ) => MaybePromise<void>
}

const defaultDependencies: ClaudeAgentSdkProviderStartupDependencies = {
  parseProviderProfileSource,
  getProviderProfileRuntimeConfig: async (id) => {
    const storage = await import("../provider-profiles/storage")
    return storage.getProviderProfileRuntimeConfig(id)
  },
  getProviderGatewayEndpoint: async (providerId, kind) => {
    const gateway = await import("../provider-profiles/gateway")
    return gateway.getProviderGatewayEndpoint(providerId, kind)
  },
  getLegacyClaudeProviderProfileId: async () => {
    const storage = await import("../provider-profiles/storage")
    return storage.getLegacyClaudeProviderProfileId()
  },
  getActiveClaudeProviderConfig: async () => {
    const store = await import("./provider-config-store")
    return store.getActiveClaudeProviderConfig()
  },
  getValidClaudeCodeCredential: async () => {
    const credentials = await import("../claude-credentials")
    return credentials.getValidClaudeCodeCredential()
  },
  checkOfflineFallback: async (
    customConfig,
    claudeCodeToken,
    selectedOllamaModel,
    offlineModeEnabled,
  ) => {
    const offline = await import("./offline-handler")
    return offline.checkOfflineFallback(
      customConfig,
      claudeCodeToken,
      selectedOllamaModel,
      offlineModeEnabled,
    )
  },
  assertOfficialCloudAllowed: async (operation, url) => {
    const localOnly = await import("../local-only")
    localOnly.assertOfficialCloudAllowed(operation, url)
  },
}

function withDefaultDependencies(
  dependencies:
    | Partial<ClaudeAgentSdkProviderStartupDependencies>
    | undefined,
): ClaudeAgentSdkProviderStartupDependencies {
  return { ...defaultDependencies, ...dependencies }
}

export async function resolveClaudeAgentSdkProviderStartup(input: {
  modelSource?: string | null
  offlineModeEnabled?: boolean
  dependencies?: Partial<ClaudeAgentSdkProviderStartupDependencies>
}): Promise<ClaudeAgentSdkProviderStartupResult> {
  const dependencies = withDefaultDependencies(input.dependencies)
  let providerConfig: ClaudeProviderRuntimeConfig | undefined

  const selectedProviderProfileId = await dependencies.parseProviderProfileSource(
    input.modelSource,
  )

  if (selectedProviderProfileId) {
    const profile = await dependencies.getProviderProfileRuntimeConfig(
      selectedProviderProfileId,
    )
    if (!profile || !profile.targetRuntimes.includes("claude")) {
      return {
        ok: false,
        blocker: {
          id: "provider-profile",
          status: "blocked",
          message: "Provider profile is not available for Claude.",
          hint: "Choose a provider profile that targets Claude.",
        },
      }
    }

    const gateway = await dependencies.getProviderGatewayEndpoint(
      profile.id,
      "anthropic",
    )
    providerConfig = {
      model: profile.defaultModel,
      baseUrl: gateway.baseUrl,
      token: gateway.token,
      authMode: "auth_token",
    }
  } else if (input.modelSource === "custom-provider") {
    const legacyProfileId =
      await dependencies.getLegacyClaudeProviderProfileId()
    if (legacyProfileId) {
      const profile = await dependencies.getProviderProfileRuntimeConfig(
        legacyProfileId,
      )
      if (profile) {
        const gateway = await dependencies.getProviderGatewayEndpoint(
          profile.id,
          "anthropic",
        )
        providerConfig = {
          model: profile.defaultModel,
          baseUrl: gateway.baseUrl,
          token: gateway.token,
          authMode: "auth_token",
        }
      }
    }

    providerConfig =
      providerConfig ||
      (await dependencies.getActiveClaudeProviderConfig())

    if (!providerConfig) {
      return {
        ok: false,
        blocker: {
          id: "provider-profile",
          status: "needs-auth",
          message: "Custom provider is not configured.",
          hint: "Configure a Claude provider profile or use Claude Code auth.",
        },
      }
    }
  }

  let claudeCodeToken: string | null = null
  let claudeCredentialMetadata: ClaudeCodeCredentialMetadata | null = null

  if (!providerConfig) {
    try {
      const credentialResult =
        await dependencies.getValidClaudeCodeCredential()
      claudeCodeToken = credentialResult.accessToken
      claudeCredentialMetadata = credentialResult.metadata
    } catch (credentialError) {
      return {
        ok: false,
        blocker: {
          id: "provider-profile",
          status: "needs-auth",
          message:
            credentialError instanceof Error
              ? `Claude Code credential unavailable: ${credentialError.message}`
              : `Claude Code credential unavailable: ${String(credentialError)}`,
          hint: "Reconnect Claude Code auth or choose a provider profile.",
        },
      }
    }
  }

  const offlineResult = await dependencies.checkOfflineFallback(
    providerConfig,
    claudeCodeToken,
    undefined,
    input.offlineModeEnabled ?? false,
  )

  if (offlineResult.error) {
    return {
      ok: false,
      blocker: {
        id: "provider-profile",
        status: "blocked",
        message: `Offline mode unavailable: ${offlineResult.error}`,
      },
    }
  }

  const finalCustomConfig = offlineResult.config
    ? normalizeClaudeProviderRuntimeConfig(offlineResult.config)
    : providerConfig
  const isUsingOllama = offlineResult.isUsingOllama

  if (finalCustomConfig?.baseUrl) {
    try {
      await dependencies.assertOfficialCloudAllowed(
        "use Claude provider endpoint",
        finalCustomConfig.baseUrl,
      )
    } catch (providerError) {
      return {
        ok: false,
        blocker: {
          id: "local-only",
          status: "blocked",
          message:
            providerError instanceof Error
              ? providerError.message
              : String(providerError),
        },
      }
    }
  }

  return {
    ok: true,
    startup: {
      selectedProviderProfileId,
      claudeCodeToken,
      claudeCredentialMetadata,
      finalCustomConfig,
      isUsingOllama,
    },
  }
}
