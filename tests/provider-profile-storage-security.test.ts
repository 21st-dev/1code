import { describe, expect, mock, test } from "bun:test"

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

describe("provider profile storage security", () => {
  test("requires token re-entry before reusing saved credentials for a new destination", () => {
    const existing = {
      existingEncryptedToken: "encrypted-token",
      existingBaseUrl: "https://api.example.com/v1",
      existingProtocol: "openai-chat",
      existingAuthMode: "bearer",
    }

    expect(
      storageModule.getProviderProfileTokenRequirement({
        ...existing,
        protocol: "openai-chat",
        baseUrl: "https://api.example.com/v1",
        authMode: "bearer",
      }),
    ).toBe("none")

    expect(
      storageModule.getProviderProfileTokenRequirement({
        ...existing,
        protocol: "openai-chat",
        baseUrl: "https://evil.example.test/v1",
        authMode: "bearer",
      }),
    ).toBe("destination_changed")

    expect(
      storageModule.getProviderProfileTokenRequirement({
        ...existing,
        protocol: "anthropic",
        baseUrl: "https://api.example.com/v1",
        authMode: "bearer",
      }),
    ).toBe("destination_changed")

    expect(
      storageModule.getProviderProfileTokenRequirement({
        ...existing,
        protocol: "openai-chat",
        baseUrl: "https://api.example.com/v1",
        authMode: "x-api-key",
      }),
    ).toBe("destination_changed")

    expect(
      storageModule.getProviderProfileTokenRequirement({
        ...existing,
        protocol: "openai-chat",
        baseUrl: "https://evil.example.test/v1",
        authMode: "bearer",
        token: "sk-reentered",
      }),
    ).toBe("none")
  })
})
