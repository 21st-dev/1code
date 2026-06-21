import { describe, expect, test } from "bun:test"
import type { AuthUser } from "../../auth-store"
import { buildMossAccountEntitlement } from "./entitlement"

const user: AuthUser = {
  id: "user_1",
  email: "moss@example.com",
  name: "Moss User",
  imageUrl: null,
  username: "moss",
}

const providerReadResult = {
  status: "found" as const,
  sourcePath: "/repo/.moss/providers.yaml",
  config: {
    version: 1,
    defaultProvider: "moss",
    credentialPolicy: {
      singleUserConfiguration: true,
      allowCustomBaseUrl: true,
      allowCustomApiKey: true,
      shareAcrossEngines: true,
    },
    providers: {
      moss: {
        id: "moss",
        label: "Moss Managed",
        mode: "bundled-quota",
        runtime: "any",
        engines: {
          hermes: { model: "moss-default" },
          "claude-code": { model: "opus" },
          codex: { model: "gpt-5.5/high" },
          "custom-acp": { model: "custom-acp" },
        },
      },
      custom: {
        id: "custom",
        label: "Custom",
        mode: "custom-url-key",
        runtime: "any",
        apiKeyEnv: "MOSS_CUSTOM_API_KEY",
        baseUrl: "https://custom.test/v1",
        baseUrlEnv: "MOSS_CUSTOM_BASE_URL",
        engines: {
          hermes: { model: "moss-custom" },
          "claude-code": { model: "opus-custom" },
          codex: { model: "gpt-custom/high" },
          "custom-acp": { model: "custom-acp-custom" },
        },
      },
    },
  },
}

describe("Moss account entitlement", () => {
  test("requires sign-in for Moss managed quota when no user is present", () => {
    const entitlement = buildMossAccountEntitlement({
      user: null,
      providerReadResult,
    })

    expect(entitlement.status).toBe("needs-sign-in")
    expect(entitlement.account.signedIn).toBe(false)
    expect(entitlement.quota.status).toBe("needs-sign-in")
    expect(entitlement.provider.credentialStatus).toBe("moss-managed")
    expect(entitlement.engines.every((engine) => engine.status === "needs-sign-in")).toBe(true)
  })

  test("marks Moss managed quota ready for an active paid account", () => {
    const entitlement = buildMossAccountEntitlement({
      user,
      plan: {
        plan: "moss_pro",
        status: "active",
        source: "backend",
      },
      providerReadResult,
    })

    expect(entitlement.status).toBe("ready")
    expect(entitlement.account.email).toBe("moss@example.com")
    expect(entitlement.plan.isPaid).toBe(true)
    expect(entitlement.quota.status).toBe("available")
    expect(entitlement.quota.includedCredits).toBe(10000)
    expect(entitlement.quota.remainingCredits).toBe(null)
    expect(entitlement.quota.source).toBe("plan-default")
    expect(entitlement.engines.map((engine) => engine.providerId)).toEqual([
      "moss",
      "moss",
      "moss",
      "moss",
    ])
    expect(entitlement.engines.every((engine) => engine.status === "ready")).toBe(true)
  })

  test("makes active free Moss quota available without marking the plan paid", () => {
    const entitlement = buildMossAccountEntitlement({
      user,
      plan: {
        plan: "moss_free",
        status: "active",
        source: "backend",
      },
      providerReadResult,
    })

    expect(entitlement.status).toBe("ready")
    expect(entitlement.plan.isPaid).toBe(false)
    expect(entitlement.quota.status).toBe("available")
    expect(entitlement.quota.includedCredits).toBe(250)
    expect(entitlement.quota.unit).toBe("credits")
    expect(entitlement.engines.every((engine) => engine.status === "ready")).toBe(true)
  })

  test("uses backend quota usage when the Moss account service returns it", () => {
    const entitlement = buildMossAccountEntitlement({
      user,
      plan: {
        plan: "moss_pro",
        status: "active",
        source: "backend",
        quota: {
          includedCredits: 10000,
          usedCredits: 1234,
          resetAt: "2026-07-01T00:00:00.000Z",
          unit: "credits",
          source: "backend",
        },
      },
      providerReadResult,
    })

    expect(entitlement.status).toBe("ready")
    expect(entitlement.quota.source).toBe("backend")
    expect(entitlement.quota.usedCredits).toBe(1234)
    expect(entitlement.quota.remainingCredits).toBe(8766)
    expect(entitlement.quota.resetAt).toBe("2026-07-01T00:00:00.000Z")
  })

  test("allows custom shared key route without a Moss paid plan", () => {
    const customProviderReadResult = {
      ...providerReadResult,
      config: {
        ...providerReadResult.config,
        defaultProvider: "custom",
      },
    }

    const entitlement = buildMossAccountEntitlement({
      user: null,
      providerReadResult: customProviderReadResult,
      storedSecrets: {
        custom: { hasApiKey: true },
      },
    })

    expect(entitlement.status).toBe("custom-ready")
    expect(entitlement.provider.useCustomProvider).toBe(true)
    expect(entitlement.provider.credentialStatus).toBe("stored-key")
    expect(entitlement.provider.baseUrlStatus).toBe("configured-url")
    expect(entitlement.engines.map((engine) => engine.model)).toEqual([
      "opus-custom",
      "gpt-custom/high",
      "moss-custom",
      "custom-acp-custom",
    ])
    expect(entitlement.engines.every((engine) => engine.status === "ready")).toBe(true)
    expect(JSON.stringify(entitlement)).not.toContain("sk-")
  })

  test("surfaces custom provider env-key state across every engine", () => {
    const customProviderReadResult = {
      ...providerReadResult,
      config: {
        ...providerReadResult.config,
        defaultProvider: "custom",
      },
    }

    const entitlement = buildMossAccountEntitlement({
      user,
      providerReadResult: customProviderReadResult,
    })

    expect(entitlement.status).toBe("custom-ready")
    expect(entitlement.provider.credentialStatus).toBe("env-key")
    expect(entitlement.provider.baseUrlStatus).toBe("configured-url")
    expect(entitlement.engines.every((engine) => engine.status === "ready")).toBe(true)
  })

  test("requires a custom provider base URL before the shared route is ready", () => {
    const customProviderReadResult = {
      ...providerReadResult,
      config: {
        ...providerReadResult.config,
        defaultProvider: "custom",
        providers: {
          ...providerReadResult.config.providers,
          custom: {
            ...providerReadResult.config.providers.custom,
            baseUrl: undefined,
            baseUrlEnv: undefined,
          },
        },
      },
    }

    const entitlement = buildMossAccountEntitlement({
      user: null,
      providerReadResult: customProviderReadResult,
      storedSecrets: {
        custom: { hasApiKey: true },
      },
    })

    expect(entitlement.status).toBe("custom-needs-url")
    expect(entitlement.provider.credentialStatus).toBe("stored-key")
    expect(entitlement.provider.baseUrlStatus).toBe("missing-url")
    expect(entitlement.provider.reason).toContain("requires one base URL")
    expect(entitlement.engines.every((engine) => engine.status === "needs-base-url")).toBe(true)
  })
})
