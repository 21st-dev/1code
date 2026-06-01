import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

let userDataDir = ""

mock.module("electron", () => ({
  app: {
    isPackaged: false,
    getPath(name: string) {
      if (name !== "userData") {
        throw new Error(`unexpected app path request: ${name}`)
      }
      return userDataDir
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
const gatewayModule = await import("../src/main/lib/provider-profiles/gateway")
const securityModule = await import("../src/shared/provider-profile-security")

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString("utf8")
}

async function createProviderServer(handler: (params: {
  req: IncomingMessage
  res: ServerResponse
  body: string
}) => void | Promise<void>) {
  const server = createServer((req, res) => {
    void readBody(req)
      .then((body) => handler({ req, res, body }))
      .catch((error) => {
        res.writeHead(500, { "content-type": "application/json" })
        res.end(JSON.stringify({ error: String(error) }))
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
    throw new Error("failed to start test provider")
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

describe("provider diagnostics", () => {
  beforeEach(async () => {
    userDataDir = await mkdtemp(join(tmpdir(), "locus-provider-diagnostics-"))
  })

  afterEach(async () => {
    await rm(userDataDir, { force: true, recursive: true })
    userDataDir = ""
  })

  test("classifies common provider setup failures", () => {
    expect(
      gatewayModule.classifyProviderDiagnosticFailure({
        errorName: "AbortError",
        message: "The operation timed out",
      }),
    ).toBe("endpoint_unreachable")
    expect(
      gatewayModule.classifyProviderDiagnosticFailure({
        status: 401,
        message: "bad key",
      }),
    ).toBe("auth_failed")
    expect(
      gatewayModule.classifyProviderDiagnosticFailure({
        status: 403,
        message: "model access denied",
      }),
    ).toBe("model_denied")
    expect(
      gatewayModule.classifyProviderDiagnosticFailure({
        status: 404,
        message: "route missing",
      }),
    ).toBe("protocol_mismatch")
  })

  test("redacts exact provider, gateway, and custom header secrets", () => {
    const redacted = securityModule.redactProviderSecrets(
      "bad provider-token-123 Bearer gateway-token-456 custom-header-secret",
      ["provider-token-123", "Bearer gateway-token-456", "custom-header-secret"],
    )

    expect(redacted).not.toContain("provider-token-123")
    expect(redacted).not.toContain("gateway-token-456")
    expect(redacted).not.toContain("custom-header-secret")
    expect(redacted).toContain("***")
  })

  test("stores structured success diagnostics without exposing custom headers", async () => {
    const provider = await createProviderServer(({ req, res, body }) => {
      expect(req.headers.authorization).toBe("Bearer provider-token-123")
      expect(req.headers["x-custom-secret"]).toBe("custom-header-secret")
      const parsed = JSON.parse(body || "{}") as { stream?: boolean }
      if (parsed.stream) {
        res.writeHead(200, { "content-type": "text/event-stream" })
        res.end("data: [DONE]\n\n")
        return
      }
      res.writeHead(200, { "content-type": "application/json" })
      res.end(
        JSON.stringify({
          id: "chatcmpl_test",
          choices: [{ message: { content: "OK" }, finish_reason: "stop" }],
        }),
      )
    })

    try {
      const runtimeProfile = {
        id: "profile_success",
        name: "Diagnostics Provider",
        presetId: "test",
        protocol: "openai-chat",
        baseUrl: provider.baseUrl,
        defaultModel: "test-model",
        authMode: "bearer",
        token: "provider-token-123",
        headers: { "x-custom-secret": "custom-header-secret" },
        targetRuntimes: ["codex", "helpers"],
        capabilities: { codex: true, helpers: true, streaming: true },
      } as const

      const status = await gatewayModule.runProviderProfileDiagnostics(runtimeProfile)
      expect(status).toMatchObject({
        ok: true,
        diagnosticVersion: 1,
        message: "Provider diagnostics completed",
      })
      expect(status.checks?.map((check) => check.id)).toEqual([
        "endpoint",
        "auth",
        "model",
        "protocol",
        "streaming",
        "tools",
        "vision",
        "gateway",
        "runtime",
      ])
      expect(status.checks?.find((check) => check.id === "streaming")).toMatchObject({
        status: "ok",
      })

      expect(storageModule.headersForRenderer(runtimeProfile.headers)).toEqual({
        "x-custom-secret": "<redacted>",
      })
      expect(JSON.stringify(status)).not.toContain("provider-token-123")
      expect(JSON.stringify(status)).not.toContain("custom-header-secret")
    } finally {
      await provider.close()
    }
  })

  test("keeps legacy statuses and preserves headers when edit payload omits them", () => {
    const legacyStatus = storageModule.providerProfileTestStatusSchema.parse({
      ok: false,
      checkedAt: "2026-06-01T00:00:00.000Z",
      message: "Legacy failure",
    })
    const existingHeadersJson = JSON.stringify({
      "x-custom-secret": "custom-header-secret",
    })

    expect(legacyStatus).toEqual({
      ok: false,
      checkedAt: "2026-06-01T00:00:00.000Z",
      message: "Legacy failure",
    })
    expect(
      storageModule.providerHeadersJsonForSave(undefined, existingHeadersJson),
    ).toBe(existingHeadersJson)
    expect(storageModule.providerHeadersJsonForSave({}, existingHeadersJson)).toBe(
      "{}",
    )
    expect(
      storageModule.headersForRenderer(JSON.parse(existingHeadersJson)),
    ).toEqual({
      "x-custom-secret": "<redacted>",
    })
  })

  test("redacts failed diagnostic messages before returning and persisting", async () => {
    const provider = await createProviderServer(({ res }) => {
      res.writeHead(401, { "content-type": "application/json" })
      res.end(
        JSON.stringify({
          error: {
            message:
              "rejected provider-token-abc Bearer provider-token-abc custom-header-secret",
          },
        }),
      )
    })

    try {
      const runtimeProfile = {
        id: "profile_rejected",
        name: "Rejected Provider",
        presetId: "test",
        protocol: "openai-chat",
        baseUrl: provider.baseUrl,
        defaultModel: "test-model",
        authMode: "bearer",
        token: "provider-token-abc",
        headers: { "x-custom-secret": "custom-header-secret" },
        targetRuntimes: ["codex"],
        capabilities: { codex: true },
      } as const

      const status = await gatewayModule.runProviderProfileDiagnostics(runtimeProfile)
      expect(status).toMatchObject({
        ok: false,
        diagnosticVersion: 1,
        category: "auth_failed",
      })
      expect(JSON.stringify(status)).not.toContain("provider-token-abc")
      expect(JSON.stringify(status)).not.toContain("custom-header-secret")
    } finally {
      await provider.close()
    }
  })
})
