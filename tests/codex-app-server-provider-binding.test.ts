import { describe, expect, test } from "bun:test"
import type { DesktopRunRequest } from "../src/main/lib/agent-runtime/desktop-run-request"
import {
  assertNoCodexAppServerRendererSecrets,
  buildCodexAppServerProviderBinding,
} from "../src/main/lib/codex/app-server-provider-binding"

function requestWithProviderBinding(
  providerBinding: DesktopRunRequest["providerBinding"],
): Pick<DesktopRunRequest, "providerBinding"> {
  return { providerBinding }
}

describe("Codex app-server provider binding", () => {
  test("binds provider profiles through main-process gateway env without leaking token into client config", () => {
    const binding = buildCodexAppServerProviderBinding({
      request: requestWithProviderBinding({
        authMode: "provider-profile",
        providerProfileId: "profile-1",
        gatewayEndpoint:
          "http://127.0.0.1:4321/profile/profile-1/responses/v1",
        model: "deepseek-chat",
      }),
      processEnv: {
        PATH: "/usr/bin",
        OPENAI_API_KEY: "stale-openai",
        CODEX_API_KEY: "stale-codex",
        GITHUB_TOKEN: "stale-github",
      },
      providerGatewayToken: "selected-gateway-token",
      appManagedApiKey: "sk-should-not-win",
    })

    expect(binding.authMode).toBe("provider-profile")
    expect(binding.runtimeEnv).toEqual({
      PATH: "/usr/bin",
      LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN: "selected-gateway-token",
    })
    expect(binding.client).toEqual({
      modelProvider: "locus_profile",
      config: {
        "model_providers.locus_profile.name": "Locus provider profile",
        "model_providers.locus_profile.base_url":
          "http://127.0.0.1:4321/profile/profile-1/responses/v1",
        "model_providers.locus_profile.env_key":
          "LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN",
        "model_providers.locus_profile.wire_api": "responses",
      },
    })
    expect(JSON.stringify(binding.client)).not.toContain(
      "selected-gateway-token",
    )
    expect(JSON.stringify(binding.client)).not.toContain("sk-should-not-win")
  })

  test("fails closed when provider-profile runs lack selected gateway token", () => {
    expect(() =>
      buildCodexAppServerProviderBinding({
        request: requestWithProviderBinding({
          authMode: "provider-profile",
          providerProfileId: "profile-1",
          gatewayEndpoint:
            "http://127.0.0.1:4321/profile/profile-1/responses/v1",
        }),
      }),
    ).toThrow(
      "Codex app-server provider-profile binding requires main-process gateway endpoint and token.",
    )
  })

  test("uses only app-managed key selected in main process for app-managed runs", () => {
    const binding = buildCodexAppServerProviderBinding({
      request: requestWithProviderBinding({
        authMode: "app-managed",
      }),
      processEnv: {
        PATH: "/usr/bin",
        OPENAI_API_KEY: "stale-openai",
        CODEX_API_KEY: "stale-codex",
      },
      appManagedApiKey: "sk-selected",
    })

    expect(binding).toEqual({
      authMode: "app-managed",
      runtimeEnv: {
        PATH: "/usr/bin",
        CODEX_API_KEY: "sk-selected",
      },
      client: {},
    })
  })

  test("rejects renderer-supplied raw secrets before app-server startup", () => {
    expect(() =>
      assertNoCodexAppServerRendererSecrets({
        providerProfileId: "profile-1",
        nested: {
          headers: {
            Authorization: "Bearer raw",
          },
        },
      }),
    ).toThrow(
      "Secret-bearing Codex app-server renderer input is not allowed: input.nested.headers.",
    )

    expect(() =>
      assertNoCodexAppServerRendererSecrets({
        providerProfileId: "profile-1",
        model: "gpt-5",
      }),
    ).not.toThrow()
  })

  test("rejects renderer-supplied env, header, token, provider config, and MCP server payload keys", () => {
    const forbiddenInputs = [
      { apiKey: "sk-raw" },
      { api_key: "sk-raw" },
      { openaiApiKey: "sk-raw" },
      { codexApiKey: "sk-raw" },
      { token: "raw-token" },
      { accessToken: "raw-token" },
      { access_token: "raw-token" },
      { refreshToken: "raw-token" },
      { refresh_token: "raw-token" },
      { idToken: "raw-token" },
      { oauthToken: "raw-token" },
      { oauth: { access_token: "raw-token" } },
      { authConfig: { apiKey: "sk-raw" } },
      { auth_config: { apiKey: "sk-raw" } },
      { authorization: "Bearer raw" },
      { Authorization: "Bearer raw" },
      { bearerToken: "raw-token" },
      { bearer_token: "raw-token" },
      { bearer_token_env_var: "TOKEN_ENV" },
      { cookie: "session=raw" },
      { password: "raw" },
      { secret: "raw" },
      { clientSecret: "raw" },
      { client_secret: "raw" },
      { providerToken: "raw" },
      { provider_token: "raw" },
      { gatewayToken: "raw" },
      { providerGatewayToken: "raw" },
      { LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN: "raw" },
      { env: { OPENAI_API_KEY: "raw" } },
      { environment: { CODEX_API_KEY: "raw" } },
      { processEnv: { PATH: "/usr/bin" } },
      { shellEnv: { PATH: "/usr/bin" } },
      { customEnv: { SAFE: "1" } },
      { envVars: ["OPENAI_API_KEY"] },
      { env_vars: ["OPENAI_API_KEY"] },
      { envHttpHeaders: { Authorization: "Bearer raw" } },
      { env_http_headers: { Authorization: "Bearer raw" } },
      { headers: { Authorization: "Bearer raw" } },
      { httpHeaders: { Authorization: "Bearer raw" } },
      { http_headers: { Authorization: "Bearer raw" } },
      { providerConfig: { baseUrl: "https://provider.example.com" } },
      { mcpServers: { docs: { env: { TOKEN: "raw" } } } },
    ]

    for (const input of forbiddenInputs) {
      expect(() =>
        assertNoCodexAppServerRendererSecrets({
          providerProfileId: "profile-1",
          ...input,
        }),
      ).toThrow("Secret-bearing Codex app-server renderer input is not allowed")
    }

    expect(() =>
      assertNoCodexAppServerRendererSecrets({
        providerProfileId: "profile-1",
        model: "gpt-5",
        mcp: {
          status: "ready",
          serverNames: ["docs"],
          blockers: [],
        },
      }),
    ).not.toThrow()
  })
})
