import { describe, expect, mock, test } from "bun:test"

const runtimeProfiles = new Map<string, any>([
  [
    "profile_gateway_a",
    {
      id: "profile_gateway_a",
      name: "Gateway A",
      presetId: "test",
      protocol: "openai-chat",
      baseUrl: "http://127.0.0.1:1/v1",
      defaultModel: "model-a",
      authMode: "none",
      token: null,
      headers: {},
      targetRuntimes: ["codex"],
      capabilities: { codex: true },
    },
  ],
  [
    "profile_gateway_b",
    {
      id: "profile_gateway_b",
      name: "Gateway B",
      presetId: "test",
      protocol: "openai-chat",
      baseUrl: "http://127.0.0.1:1/v1",
      defaultModel: "model-b",
      authMode: "none",
      token: null,
      headers: {},
      targetRuntimes: ["codex"],
      capabilities: { codex: true },
    },
  ],
])

mock.module("../src/main/lib/provider-profiles/storage", () => ({
  getProviderProfileRuntimeConfig(id: string) {
    return runtimeProfiles.get(id) ?? null
  },
  normalizeProviderBaseUrl(baseUrl: string) {
    return baseUrl.trim().replace(/\/+$/, "")
  },
  saveProviderProfile(input: any) {
    return input
  },
}))

const gatewayModule = await import("../src/main/lib/provider-profiles/gateway")

describe("provider profile gateway token scope", () => {
  test("scopes gateway tokens to one profile and endpoint kind", async () => {
    const endpointA = await gatewayModule.getProviderGatewayEndpoint(
      "profile_gateway_a",
      "responses",
    )
    const endpointB = await gatewayModule.getProviderGatewayEndpoint(
      "profile_gateway_b",
      "responses",
    )
    const endpointBAnthropic = await gatewayModule.getProviderGatewayEndpoint(
      "profile_gateway_b",
      "anthropic",
    )

    const crossProfileResponse = await fetch(`${endpointB.baseUrl}/models`, {
      headers: { authorization: `Bearer ${endpointA.token}` },
    })
    const crossKindResponse = await fetch(`${endpointB.baseUrl}/models`, {
      headers: { authorization: `Bearer ${endpointBAnthropic.token}` },
    })
    const sameProfileResponse = await fetch(`${endpointB.baseUrl}/models`, {
      headers: { authorization: `Bearer ${endpointB.token}` },
    })
    const modelsBody = await sameProfileResponse.json()

    expect(crossProfileResponse.status).toBe(401)
    expect(crossKindResponse.status).toBe(401)
    expect(sameProfileResponse.status).toBe(200)
    expect(JSON.stringify(modelsBody)).toContain("model-b")
    expect(JSON.stringify(modelsBody)).not.toContain(endpointB.token)
  })
})
