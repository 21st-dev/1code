import { describe, expect, mock, test } from "bun:test"
import { createServer, type IncomingMessage } from "node:http"

async function readRequestBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString("utf8")
}

async function createUpstreamErrorServer() {
  const server = createServer((req, res) => {
    void readRequestBody(req).then(() => {
      res.writeHead(401, { "content-type": "text/plain" })
      res.end(
        "upstream leaked provider-token-secret Bearer provider-token-secret x-extra-secret",
      )
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject)
      resolve()
    })
  })

  const address = server.address()
  if (!address || typeof address === "string") {
    server.close()
    throw new Error("failed to start upstream error server")
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

function expectNoGatewaySecrets(body: string, gatewayToken?: string) {
  expect(body).not.toContain("provider-token-secret")
  expect(body).not.toContain("Bearer provider-token-secret")
  expect(body).not.toContain("x-extra-secret")
  if (gatewayToken) {
    expect(body).not.toContain(gatewayToken)
  }
  expect(body).toContain("***")
}

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

  test("redacts direct upstream error bodies before returning them", async () => {
    const upstream = await createUpstreamErrorServer()
    try {
      runtimeProfiles.set("profile_gateway_secret_anthropic", {
        id: "profile_gateway_secret_anthropic",
        name: "Gateway Secret Anthropic",
        presetId: "test",
        protocol: "anthropic",
        baseUrl: upstream.baseUrl,
        defaultModel: "model-secret",
        authMode: "bearer",
        token: "provider-token-secret",
        headers: { "x-extra": "x-extra-secret" },
        targetRuntimes: ["claude"],
        capabilities: { claude: true },
      })
      runtimeProfiles.set("profile_gateway_secret_responses", {
        id: "profile_gateway_secret_responses",
        name: "Gateway Secret Responses",
        presetId: "test",
        protocol: "openai-responses",
        baseUrl: upstream.baseUrl,
        defaultModel: "model-secret",
        authMode: "bearer",
        token: "provider-token-secret",
        headers: { "x-extra": "x-extra-secret" },
        targetRuntimes: ["codex"],
        capabilities: { codex: true },
      })

      const anthropicEndpoint = await gatewayModule.getProviderGatewayEndpoint(
        "profile_gateway_secret_anthropic",
        "anthropic",
      )
      const responsesEndpoint = await gatewayModule.getProviderGatewayEndpoint(
        "profile_gateway_secret_responses",
        "responses",
      )

      const anthropicResponse = await fetch(`${anthropicEndpoint.baseUrl}/messages`, {
        method: "POST",
        headers: { authorization: `Bearer ${anthropicEndpoint.token}` },
        body: JSON.stringify({ model: "model-secret", messages: [] }),
      })
      const responsesResponse = await fetch(`${responsesEndpoint.baseUrl}/responses`, {
        method: "POST",
        headers: { authorization: `Bearer ${responsesEndpoint.token}` },
        body: JSON.stringify({ model: "model-secret", input: "hello" }),
      })

      const anthropicBody = await anthropicResponse.text()
      const responsesBody = await responsesResponse.text()

      expect(anthropicResponse.status).toBe(401)
      expect(responsesResponse.status).toBe(401)
      expectNoGatewaySecrets(anthropicBody, anthropicEndpoint.token)
      expectNoGatewaySecrets(responsesBody, responsesEndpoint.token)
    } finally {
      runtimeProfiles.delete("profile_gateway_secret_anthropic")
      runtimeProfiles.delete("profile_gateway_secret_responses")
      await upstream.close()
    }
  })

  test("redacts converted and streaming upstream gateway errors", async () => {
    const upstream = await createUpstreamErrorServer()
    const profileIds: string[] = []
    try {
      const cases = [
        {
          id: "profile_gateway_secret_chat_to_anthropic",
          protocol: "openai-chat",
          kind: "anthropic" as const,
          path: "messages",
          body: {
            model: "model-secret",
            max_tokens: 16,
            messages: [{ role: "user", content: "hello" }],
          },
        },
        {
          id: "profile_gateway_secret_responses_to_anthropic",
          protocol: "openai-responses",
          kind: "anthropic" as const,
          path: "messages",
          body: {
            model: "model-secret",
            max_tokens: 16,
            messages: [{ role: "user", content: "hello" }],
          },
        },
        {
          id: "profile_gateway_secret_chat_to_responses",
          protocol: "openai-chat",
          kind: "responses" as const,
          path: "responses",
          body: { model: "model-secret", input: "hello" },
        },
        {
          id: "profile_gateway_secret_chat_stream_to_anthropic",
          protocol: "openai-chat",
          kind: "anthropic" as const,
          path: "messages",
          body: {
            model: "model-secret",
            max_tokens: 16,
            stream: true,
            messages: [{ role: "user", content: "hello" }],
          },
        },
        {
          id: "profile_gateway_secret_chat_stream_to_responses",
          protocol: "openai-chat",
          kind: "responses" as const,
          path: "responses",
          body: { model: "model-secret", input: "hello", stream: true },
        },
      ]

      for (const testCase of cases) {
        profileIds.push(testCase.id)
        runtimeProfiles.set(testCase.id, {
          id: testCase.id,
          name: testCase.id,
          presetId: "test",
          protocol: testCase.protocol,
          baseUrl: upstream.baseUrl,
          defaultModel: "model-secret",
          authMode: "bearer",
          token: "provider-token-secret",
          headers: { "x-extra": "x-extra-secret" },
          targetRuntimes:
            testCase.kind === "anthropic" ? ["claude"] : ["codex"],
          capabilities:
            testCase.kind === "anthropic" ? { claude: true } : { codex: true },
        })

        const endpoint = await gatewayModule.getProviderGatewayEndpoint(
          testCase.id,
          testCase.kind,
        )
        const response = await fetch(`${endpoint.baseUrl}/${testCase.path}`, {
          method: "POST",
          headers: { authorization: `Bearer ${endpoint.token}` },
          body: JSON.stringify(testCase.body),
        })
        const body = await response.text()

        expect(response.status).toBe(401)
        expectNoGatewaySecrets(body, endpoint.token)
      }
    } finally {
      for (const profileId of profileIds) {
        runtimeProfiles.delete(profileId)
      }
      await upstream.close()
    }
  })
})
