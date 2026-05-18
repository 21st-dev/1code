import { describe, expect, test } from "bun:test"
import {
  createClaudeCodeCredentialEnvelope,
  parseClaudeCodeCredentialPayload,
  type ClaudeCodeCredentialEnvelope,
} from "../src/shared/claude-code-credential-envelope"

describe("Claude Code credential envelope", () => {
  test("parses versioned refreshable envelopes", () => {
    const payload: ClaudeCodeCredentialEnvelope = {
      version: 1,
      kind: "claude_code_oauth",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: 1779081790895,
      scopes: ["user:inference"],
      source: "macos_keychain",
      importedAt: "2026-05-18T05:23:10.895Z",
      updatedAt: "2026-05-18T05:23:10.895Z",
    }

    const parsed = parseClaudeCodeCredentialPayload(JSON.stringify(payload))

    expect(parsed?.storageFormat).toBe("envelope")
    expect(parsed?.envelope.refreshToken).toBe("refresh-token")
    expect(parsed?.envelope.source).toBe("macos_keychain")
  })

  test("parses legacy encrypted rows as non-refreshable access tokens", () => {
    const parsed = parseClaudeCodeCredentialPayload(" legacy-access-token ")

    expect(parsed?.storageFormat).toBe("legacy_plain_token")
    expect(parsed?.envelope.accessToken).toBe("legacy-access-token")
    expect(parsed?.envelope.source).toBe("legacy_db")
    expect(parsed?.envelope.refreshToken).toBeUndefined()
    expect(parsed?.envelope.importedAt).toBe("1970-01-01T00:00:00.000Z")
  })

  test("rejects empty credential payloads", () => {
    expect(parseClaudeCodeCredentialPayload("   ")).toBeNull()
  })

  test("creates envelopes with default source and preserves original import time", () => {
    const previous: ClaudeCodeCredentialEnvelope = {
      version: 1,
      kind: "claude_code_oauth",
      accessToken: "old",
      source: "credentials_file",
      importedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }

    const created = createClaudeCodeCredentialEnvelope(
      {
        accessToken: "new",
        refreshToken: "refresh",
        expiresAt: 1779081790895,
      },
      undefined,
      previous,
    )

    expect(created.source).toBe("manual")
    expect(created.importedAt).toBe(previous.importedAt)
    expect(created.updatedAt).not.toBe(previous.updatedAt)
    expect(Number.isNaN(Date.parse(created.updatedAt))).toBe(false)
  })
})
