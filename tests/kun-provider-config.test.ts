import { describe, expect, mock, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { ProviderProfileRuntimeConfig } from "../src/main/lib/provider-profiles/storage"

const revokedTokens = new Set<string>()
const gatewayCalls: Array<{ providerId: string; kind: string; token: string }> =
  []

mock.module("electron", () => ({
  app: {
    getPath() {
      return join(tmpdir(), "locus-kun-provider-config-electron")
    },
  },
}))

mock.module("../src/main/lib/provider-profiles/gateway", () => ({
  getProviderGatewayEndpoint: async (providerId: string, kind: string) => {
    const token = `gateway-token-${gatewayCalls.length + 1}`
    gatewayCalls.push({ providerId, kind, token })
    return {
      baseUrl: `http://127.0.0.1:49152/profile/${providerId}/${kind}/v1`,
      providerId,
      token,
    }
  },
  revokeProviderGatewayToken: (token: string) => {
    revokedTokens.add(token)
    return true
  },
}))

const { synthesizeKunProviderConfig } = await import(
  "../src/main/lib/kun/kun-provider-config"
)

const profile: ProviderProfileRuntimeConfig = {
  id: "kun_profile",
  name: "Kun Profile",
  presetId: null,
  protocol: "openai-chat",
  baseUrl: "https://api.example.test/v1",
  defaultModel: "deepseek-v4-flash",
  authMode: "bearer",
  token: "provider-secret",
  headers: {},
  targetRuntimes: ["kun"],
  capabilities: { kun: true, streaming: true },
}

describe("Kun synthesized provider config", () => {
  test("writes a per-run gateway config and cleanup revokes the token", async () => {
    const userDataPath = mkdtempSync(
      join(tmpdir(), "locus-kun-provider-config-"),
    )
    try {
      const config = await synthesizeKunProviderConfig({
        runId: "run/with unsafe chars",
        profile,
        userDataPath,
      })
      const rawConfig = readFileSync(config.configPath, "utf8")
      const parsed = JSON.parse(rawConfig)

      expect(gatewayCalls.at(-1)).toMatchObject({
        providerId: profile.id,
        kind: "responses",
      })
      expect(parsed).toEqual({
        baseUrl: config.gatewayBaseUrl,
        apiKey: config.gatewayToken,
        endpointFormat: "responses",
        model: profile.defaultModel,
      })
      expect(rawConfig).toContain(config.gatewayToken)
      expect(rawConfig).not.toContain(profile.token)
      expect(config.secretHints).toContain(config.gatewayToken)
      expect(existsSync(config.configPath)).toBe(true)

      config.cleanup()
      config.cleanup()

      expect(existsSync(dirname(config.configPath))).toBe(false)
      expect(revokedTokens.has(config.gatewayToken)).toBe(true)
    } finally {
      rmSync(userDataPath, { recursive: true, force: true })
    }
  })

  test("rejects profiles that are not enabled for Kun", async () => {
    await expect(
      synthesizeKunProviderConfig({
        runId: "run",
        profile: {
          ...profile,
          targetRuntimes: ["codex"],
          capabilities: { codex: true },
        },
        userDataPath: tmpdir(),
      }),
    ).rejects.toThrow("Selected provider profile does not target Kun.")
  })
})
