import { describe, expect, mock, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

mock.module("electron", () => ({
  app: {
    isPackaged: false,
    getPath(name: string) {
      if (name !== "userData") {
        throw new Error(`unexpected app path request: ${name}`)
      }
      return "/tmp/locus-provider-runtime-unused"
    },
  },
  safeStorage: {
    isEncryptionAvailable() {
      return true
    },
    encryptString(value: string) {
      return Buffer.from(`encrypted:${value}`, "utf-8")
    },
    decryptString(value: Buffer) {
      const raw = value.toString("utf-8")
      if (!raw.startsWith("encrypted:")) {
        throw new Error("not encrypted")
      }
      return raw.slice("encrypted:".length)
    },
  },
}))

const storageModule = await import("../src/main/lib/provider-profiles/storage")
const codexBindingModule = await import(
  "../src/main/lib/codex/provider-runtime-binding"
)

describe("Codex provider profile runtime binding", () => {
  test("builds a Codex env from non-secret process and shell variables only", () => {
    const env = codexBindingModule.buildCodexProviderEnv({
      processEnv: {
        PATH: "/usr/bin",
        SAFE_FLAG: "1",
        CODEX_API_KEY: "stale-codex",
        OPENAI_API_KEY: "stale-openai",
        ANTHROPIC_AUTH_TOKEN: "stale-anthropic",
        GITHUB_TOKEN: "stale-github",
      },
      shellEnv: {
        PATH: "/bin",
        NPM_CONFIG_PREFIX: "/tmp/npm",
        ANTHROPIC_API_KEY: "stale-anthropic-key",
      },
      providerGatewayToken: "gateway-token",
    })

    expect(env).toMatchObject({
      PATH: "/bin",
      SAFE_FLAG: "1",
      NPM_CONFIG_PREFIX: "/tmp/npm",
      LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN: "gateway-token",
    })
    expect(env).not.toHaveProperty("CODEX_API_KEY")
    expect(env).not.toHaveProperty("OPENAI_API_KEY")
    expect(env).not.toHaveProperty("ANTHROPIC_AUTH_TOKEN")
    expect(env).not.toHaveProperty("ANTHROPIC_API_KEY")
    expect(env).not.toHaveProperty("GITHUB_TOKEN")
  })

  test("uses explicit app-managed Codex keys without forwarding stale OpenAI env", () => {
    const env = codexBindingModule.buildCodexProviderEnv({
      processEnv: {
        OPENAI_API_KEY: "stale-openai",
      },
      appManagedApiKey: "sk-codex",
    })

    expect(env.CODEX_API_KEY).toBe("sk-codex")
    expect(env).not.toHaveProperty("OPENAI_API_KEY")
  })

  test("does not inject app-managed Codex keys into provider-profile runs", () => {
    const env = codexBindingModule.buildCodexProviderEnv({
      appManagedApiKey: "sk-codex",
      providerGatewayToken: "gateway-token",
    })

    expect(env).toEqual({
      LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN: "gateway-token",
    })
  })

  test("selects Codex auth mode only for official ChatGPT or app-managed key paths", () => {
    expect(codexBindingModule.getCodexAuthMethodId()).toBe("chatgpt")
    expect(
      codexBindingModule.getCodexAuthMethodId({
        appManagedApiKey: "sk-codex",
      }),
    ).toBe("codex-api-key")
    expect(
      codexBindingModule.getCodexAuthMethodId({
        appManagedApiKey: "sk-codex",
        providerProfile: { id: "profile_1" },
      }),
    ).toBeUndefined()
  })

  test("builds provider-profile ACP args and redacts configured endpoint metadata", () => {
    const args = codexBindingModule.buildCodexProviderProfileArgs({
      name: "DeepSeek Private",
      baseUrl: "http://127.0.0.1:1234/profile/profile_1/responses/v1",
    })
    const redacted = codexBindingModule.redactCodexProviderProfileArgs(args)

    expect(args).toContain('model_provider="locus_profile"')
    expect(args).toContain('model_providers.locus_profile.name="DeepSeek Private"')
    expect(args).toContain(
      'model_providers.locus_profile.base_url="http://127.0.0.1:1234/profile/profile_1/responses/v1"',
    )
    expect(args).toContain(
      'model_providers.locus_profile.env_key="LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN"',
    )
    expect(args).toContain('model_providers.locus_profile.wire_api="responses"')
    expect(JSON.stringify(redacted)).not.toContain("DeepSeek Private")
    expect(JSON.stringify(redacted)).not.toContain("127.0.0.1:1234")
  })

  test("rejects secret-bearing custom headers and scrubs unsafe legacy header JSON", () => {
    expect(() =>
      storageModule.providerHeadersJsonForSave({
        "x-custom-secret": "custom-header-secret",
      }),
    ).toThrow("Store credentials in the profile auth mode instead")

    expect(
      storageModule.providerHeadersJsonForSave(
        undefined,
        JSON.stringify({ "x-custom-secret": "custom-header-secret" }),
      ),
    ).toBe("{}")
  })

  test("keeps plaintext legacy provider config out of the Claude chat API", () => {
    const claudeRouterSource = readFileSync(
      join(process.cwd(), "src/main/lib/trpc/routers/claude.ts"),
      "utf-8",
    )
    // The legacy custom-Claude token migration now lives in a dedicated hook.
    const migrationsSource = readFileSync(
      join(
        process.cwd(),
        "src/renderer/features/onboarding/lib/use-legacy-migrations.ts",
      ),
      "utf-8",
    )

    expect(claudeRouterSource).not.toContain("customConfig: z")
    expect(claudeRouterSource).not.toContain("input.customConfig")
    expect(claudeRouterSource).not.toContain("legacyProviderConfig")
    expect(migrationsSource).toContain(
      'setLegacyCustomClaudeConfig({ model: "", token: "", baseUrl: "" })',
    )
    expect(migrationsSource).not.toContain(
      "providerConfigAttemptedRef.current = false",
    )
  })
})
