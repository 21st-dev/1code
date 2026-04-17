import type {
  BillingMethod,
  CodexOnboardingAuthMethod,
  CustomClaudeConfig,
} from "../../lib/atoms"
import {
  getOpenCodexBackendRouteTemplate,
  type OpenCodexBackendRoute,
  type OpenCodexBackendRouteKind,
} from "../../../shared/opencodex-backend-route"

export type OpenCodexBackendConfig = OpenCodexBackendRoute
export type OpenCodexBackendProviderFamily = OpenCodexBackendRouteKind

export type OpenCodexBackendRuntimeBridge = {
  billingMethod: BillingMethod
  customClaudeConfig: CustomClaudeConfig
  apiKeyOnboardingCompleted: boolean
  codexOnboardingCompleted: boolean
  codexOnboardingAuthMethod: CodexOnboardingAuthMethod
  codexApiKey: string
  lastSelectedAgentId: "claude-code" | "codex"
}

export function getOpenCodexBackendTemplate(
  kind: OpenCodexBackendRouteKind,
): OpenCodexBackendConfig {
  return getOpenCodexBackendRouteTemplate(kind)
}

export function bridgeOpenCodexBackendConfig(
  config: OpenCodexBackendConfig,
): OpenCodexBackendRuntimeBridge {
  switch (config.kind) {
    case "codex-subscription":
      return {
        billingMethod: "codex-subscription",
        customClaudeConfig: {
          model: "",
          token: "",
          baseUrl: "",
        },
        apiKeyOnboardingCompleted: false,
        codexOnboardingCompleted: true,
        codexOnboardingAuthMethod: "chatgpt",
        codexApiKey: "",
        lastSelectedAgentId: "codex",
      }
    case "openai-compatible-api":
      return {
        billingMethod: "codex-api-key",
        customClaudeConfig: {
          model: "",
          token: "",
          baseUrl: "",
        },
        apiKeyOnboardingCompleted: false,
        codexOnboardingCompleted: true,
        codexOnboardingAuthMethod: "api_key",
        codexApiKey: config.apiKey,
        lastSelectedAgentId: "codex",
      }
    case "anthropic-compatible-api":
      return {
        billingMethod: "api-key",
        customClaudeConfig: {
          model: config.model,
          token: config.apiKey,
          baseUrl: config.baseUrl,
        },
        apiKeyOnboardingCompleted: true,
        codexOnboardingCompleted: false,
        codexOnboardingAuthMethod: "api_key",
        codexApiKey: "",
        lastSelectedAgentId: "claude-code",
      }
    case "claude-subscription":
      return {
        billingMethod: "claude-subscription",
        customClaudeConfig: {
          model: "",
          token: "",
          baseUrl: "",
        },
        apiKeyOnboardingCompleted: false,
        codexOnboardingCompleted: false,
        codexOnboardingAuthMethod: "api_key",
        codexApiKey: "",
        lastSelectedAgentId: "claude-code",
      }
    case "custom-endpoint":
      return {
        billingMethod: "custom-model",
        customClaudeConfig: {
          model: config.model,
          token: config.apiKey,
          baseUrl: config.baseUrl,
        },
        apiKeyOnboardingCompleted: true,
        codexOnboardingCompleted: false,
        codexOnboardingAuthMethod: "api_key",
        codexApiKey: "",
        lastSelectedAgentId: "claude-code",
      }
  }
}