import { describe, expect, mock, test } from "bun:test"

mock.module("electron", () => ({
  app: {
    isPackaged: false,
    getPath() {
      return "/tmp/locus-local-api-provider-unused"
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
      return raw.startsWith("encrypted:") ? raw.slice("encrypted:".length) : ""
    },
  },
}))

const {
  getLocalApiProviderTokenRequirement,
  localApiProviderPurposeSchema,
} = await import("../src/main/lib/trpc/routers/local-api-provider-config")

describe("local API provider config security", () => {
  test("accepts voice transcription as a helper provider purpose", () => {
    expect(localApiProviderPurposeSchema.parse("voice_transcription")).toBe(
      "voice_transcription",
    )
  })

  test("requires token re-entry when changing a provider endpoint", () => {
    expect(
      getLocalApiProviderTokenRequirement({
        baseUrl: "https://api.example.com/v1",
        existingBaseUrl: "https://api.example.com/v1",
        existingEncryptedToken: "encrypted-token",
      }),
    ).toBe("none")

    expect(
      getLocalApiProviderTokenRequirement({
        baseUrl: "https://attacker.example.com/v1",
        existingBaseUrl: "https://api.example.com/v1",
        existingEncryptedToken: "encrypted-token",
      }),
    ).toBe("destination_changed")

    expect(
      getLocalApiProviderTokenRequirement({
        baseUrl: "https://attacker.example.com/v1",
        token: "sk-new-token",
        existingBaseUrl: "https://api.example.com/v1",
        existingEncryptedToken: "encrypted-token",
      }),
    ).toBe("none")

    expect(
      getLocalApiProviderTokenRequirement({
        baseUrl: "https://api.example.com/v1",
      }),
    ).toBe("missing")
  })
})
