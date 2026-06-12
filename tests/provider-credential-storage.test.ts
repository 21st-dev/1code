import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

let encryptionAvailable = false
let userDataDir = ""
const originalConsoleError = console.error

mock.module("electron", () => ({
  app: {
    getPath(name: string) {
      if (name !== "userData") {
        throw new Error(`unexpected app path request: ${name}`)
      }
      return userDataDir
    },
  },
  safeStorage: {
    isEncryptionAvailable() {
      return encryptionAvailable
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

const secureStorage = await import("../src/main/lib/secure-storage")
const authStoreModule = await import("../src/main/auth-store")
const codexChatInputSchemaModule = await import(
  "../src/main/lib/codex/chat-input-schema"
)

describe("provider credential storage hardening", () => {
  beforeEach(async () => {
    encryptionAvailable = false
    userDataDir = await mkdtemp(join(tmpdir(), "locus-provider-credentials-"))
    console.error = mock(() => {}) as typeof console.error
  })

  afterEach(async () => {
    console.error = originalConsoleError
    await rm(userDataDir, { force: true, recursive: true })
    userDataDir = ""
    delete process.env.LOCUS_DISABLE_SAFE_STORAGE
    delete process.env.AGENT_CODE_FOR_ME_DISABLE_SAFE_STORAGE
  })

  test("secure storage fails closed instead of writing base64 fallback", () => {
    expect(() => secureStorage.encryptStringForStorage("sk-secret")).toThrow(
      /secure storage/i,
    )

    try {
      secureStorage.encryptStringForStorage("sk-secret")
    } catch (error) {
      expect(String(error)).not.toContain("locus:v1:base64:")
    }
  })

  test("legacy base64 fallback is read-only compatible", () => {
    const legacy = `locus:v1:base64:${Buffer.from("sk-legacy", "utf-8").toString("base64")}`

    expect(secureStorage.decryptStringFromStorage(legacy)).toBe("sk-legacy")
    expect(
      secureStorage.decryptStringFromStorage(
        Buffer.from("sk-plain-base64", "utf-8").toString("base64"),
      ),
    ).toBeNull()
  })

  test("AuthStore refuses plaintext json fallback writes", () => {
    const store = new authStoreModule.AuthStore(userDataDir)

    expect(() =>
      store.save({
        token: "token",
        refreshToken: "refresh",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        user: {
          id: "user_1",
          email: "user@example.com",
          name: null,
          imageUrl: null,
          username: null,
        },
      }),
    ).toThrow(/secure storage/i)

    expect(existsSync(join(userDataDir, "auth.dat"))).toBe(false)
    expect(existsSync(join(userDataDir, "auth.dat.json"))).toBe(false)
  })

  test("renderer and chat sources do not persist or transmit plaintext Codex keys", () => {
    const atomsSource = readFileSync(
      join(process.cwd(), "src/renderer/lib/atoms/index.ts"),
      "utf-8",
    )
    const transportSource = readFileSync(
      join(process.cwd(), "src/renderer/features/agents/lib/acp-chat-transport.ts"),
      "utf-8",
    )
    const codexRouterSource = readFileSync(
      join(process.cwd(), "src/main/lib/trpc/routers/codex.ts"),
      "utf-8",
    )
    const codexProviderBindingSource = readFileSync(
      join(process.cwd(), "src/main/lib/codex/provider-runtime-binding.ts"),
      "utf-8",
    )
    const codexAcpAdapterSource = readFileSync(
      join(process.cwd(), "src/main/lib/codex/acp-adapter.ts"),
      "utf-8",
    )
    const codexTemporaryCompatAdapterSource = readFileSync(
      join(process.cwd(), "src/main/lib/codex/acp-temporary-compat-adapter.ts"),
      "utf-8",
    )

    expect(atomsSource).not.toContain("codexApiKeyAtom")
    expect(atomsSource).not.toContain("onboarding:codex-api-key")
    expect(transportSource).not.toContain("authConfig")
    expect(transportSource).not.toContain("apiKey:")
    expect(codexRouterSource).not.toContain("authConfig")
    expect(codexRouterSource).toContain("codexAuthMethod")
    expect(codexRouterSource).toContain("createCodexAcpTemporaryCompatAdapter")
    expect(codexRouterSource).not.toContain("getOrCreateCodexAcpProvider")
    expect(codexTemporaryCompatAdapterSource).toContain(
      "getOrCreateCodexAcpProvider",
    )
    expect(codexAcpAdapterSource).toContain("buildCodexProviderEnv")
    expect(codexProviderBindingSource).toContain("\"CODEX_API_KEY\"")
    expect(codexProviderBindingSource).toContain("\"OPENAI_API_KEY\"")
    expect(codexProviderBindingSource).toContain("LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN")
  })

  test("Codex chat input rejects legacy authConfig API key payloads", () => {
    const validInput = {
      subChatId: "sub_1",
      chatId: "chat_1",
      runId: "run_1",
      prompt: "hello",
      cwd: process.cwd(),
      codexAuthMethod: "api_key" as const,
    }

    expect(
      codexChatInputSchemaModule.codexChatInputSchema.safeParse(validInput)
        .success,
    ).toBe(true)
    expect(
      codexChatInputSchemaModule.codexChatInputSchema.safeParse({
        ...validInput,
        authConfig: { apiKey: "sk-secret" },
      }).success,
    ).toBe(false)
    for (const forbidden of [
      { env: { OPENAI_API_KEY: "sk-secret" } },
      { headers: { Authorization: "Bearer raw" } },
      { providerConfig: { apiKey: "sk-secret" } },
      { mcpServers: { docs: { env: { TOKEN: "raw" } } } },
    ]) {
      expect(
        codexChatInputSchemaModule.codexChatInputSchema.safeParse({
          ...validInput,
          ...forbidden,
        }).success,
      ).toBe(false)
    }
  })
})
