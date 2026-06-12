import { describe, expect, mock, test } from "bun:test"
import { createServer, type IncomingMessage } from "node:http"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

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

async function createUpstreamCaptureServer() {
  const requests: Array<{
    url: string | undefined
    body: any
  }> = []
  const server = createServer((req, res) => {
    void readRequestBody(req).then((text) => {
      requests.push({
        url: req.url,
        body: text ? JSON.parse(text) : {},
      })
      res.writeHead(200, { "content-type": "application/json" })
      res.end(
        JSON.stringify({
          id: "chatcmpl_gateway_trace",
          model: "upstream-model",
          choices: [
            {
              message: { role: "assistant", content: "ok" },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
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
    throw new Error("failed to start upstream capture server")
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    requests,
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

  test("traces incoming and forwarded tool payload summaries without prompt or secrets", async () => {
    const upstream = await createUpstreamCaptureServer()
    const traceDir = mkdtempSync(join(tmpdir(), "locus-provider-gateway-trace-"))
    const tracePath = join(traceDir, "trace.jsonl")
    const profileId = "profile_gateway_tool_trace"
    try {
      process.env.LOCUS_PROVIDER_GATEWAY_TOOL_TRACE_PATH = tracePath
      runtimeProfiles.set(profileId, {
        id: profileId,
        name: "Gateway Tool Trace",
        presetId: "test",
        protocol: "openai-chat",
        baseUrl: upstream.baseUrl,
        defaultModel: "model-tools",
        authMode: "none",
        token: null,
        headers: {},
        targetRuntimes: ["codex"],
        capabilities: { codex: true, tools: true },
      })

      const endpoint = await gatewayModule.getProviderGatewayEndpoint(
        profileId,
        "responses",
      )
      const response = await fetch(`${endpoint.baseUrl}/responses`, {
        method: "POST",
        headers: { authorization: `Bearer ${endpoint.token}` },
        body: JSON.stringify({
          model: "gpt-5.5",
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: "secret prompt text must not be traced",
                },
              ],
            },
          ],
          tools: [
            {
              type: "function",
              name: "propose_file_edit",
              description: "Propose a file edit.",
              parameters: {
                type: "object",
                properties: { path: { type: "string" } },
              },
            },
            {
              type: "namespace",
              name: "mcp__locus_edit__",
              description: "Tools in the mcp__locus_edit__ namespace.",
              tools: [
                {
                  type: "function",
                  name: "propose_file_edit",
                  description: "Propose a Locus-controlled file edit.",
                  parameters: {
                    type: "object",
                    properties: { path: { type: "string" } },
                  },
                },
              ],
            },
          ],
        }),
      })

      expect(response.status).toBe(200)
      expect(upstream.requests).toHaveLength(1)
      expect(upstream.requests[0]?.url).toBe("/v1/chat/completions")
      expect(upstream.requests[0]?.body.tools?.[0]?.function?.name).toBe(
        "propose_file_edit",
      )
      expect(upstream.requests[0]?.body.tools?.[1]?.function?.name).toBe(
        "mcp__locus_edit__propose_file_edit",
      )

      const traceText = readFileSync(tracePath, "utf8")
      const trace = traceText
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
      expect(trace.map((entry) => entry.phase)).toEqual([
        "incoming",
        "forwarded",
      ])
      expect(trace[0]).toMatchObject({
        phase: "incoming",
        endpointKind: "responses",
        profileId,
        payload: {
          toolCount: 2,
          tools: [
            { type: "function", name: "propose_file_edit" },
            {
              type: "namespace",
              name: "mcp__locus_edit__",
              nestedTools: [{ type: "function", name: "propose_file_edit" }],
            },
          ],
          inputKinds: [{ role: "user" }],
        },
      })
      expect(trace[1]).toMatchObject({
        phase: "forwarded",
        upstreamProtocol: "openai-chat",
        payload: {
          toolCount: 2,
          tools: [
            { type: "function", name: "propose_file_edit" },
            { type: "function", name: "mcp__locus_edit__propose_file_edit" },
          ],
          messageRoles: [{ role: "user" }],
        },
      })
      expect(traceText).not.toContain("secret prompt text")
      expect(traceText).not.toContain(endpoint.token)
    } finally {
      delete process.env.LOCUS_PROVIDER_GATEWAY_TOOL_TRACE_PATH
      runtimeProfiles.delete(profileId)
      rmSync(traceDir, { recursive: true, force: true })
      await upstream.close()
    }
  })
})
