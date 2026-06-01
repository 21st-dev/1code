import { describe, expect, test } from "bun:test"
import {
  parseMcpImportLink,
  sanitizeDeepLinkForLog,
  sanitizeMcpConfigForRenderer,
  sanitizeMcpCommandArgs,
} from "../src/shared/mcp-import-preview"

function importUrl(payload: Record<string, unknown>, extraQuery = "") {
  const encoded = encodeURIComponent(JSON.stringify(payload))
  return `locus://mcp/import?payload=${encoded}${extraQuery}`
}

describe("MCP deep-link import preview", () => {
  test("previews stdio imports with hidden args redacted and disabled", () => {
    const result = parseMcpImportLink(importUrl({
      name: "deep-tools",
      runtime: "codex",
      scope: "global",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@example/mcp", "--token", "arg-secret"],
      env: {
        OPENAI_API_KEY: "${OPENAI_API_KEY}",
        INLINE_TOKEN: "inline-secret",
      },
      enabled: true,
      autoStart: true,
    }))

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.message)

    expect(result.preview).toMatchObject({
      serverName: "deep-tools",
      runtime: "codex",
      scope: "global",
      transport: "stdio",
      command: "npx",
      requestedEnabled: true,
      effectiveEnabled: false,
      state: "pending",
    })
    expect(result.preview.args.map((arg) => arg.value)).toEqual([
      "-y",
      "@example/mcp",
      "--token",
      "<redacted>",
    ])
    expect(result.preview.args[3]?.redacted).toBe(true)
    expect(result.preview.env.map((field) => field.key).sort()).toEqual([
      "INLINE_TOKEN",
      "OPENAI_API_KEY",
    ])
    expect(result.preview.wouldWritePaths).toContain("~/.codex/config.toml")

    const serialized = JSON.stringify(result.preview)
    expect(serialized).not.toContain("arg-secret")
    expect(serialized).not.toContain("inline-secret")
    expect(serialized).not.toContain("${OPENAI_API_KEY}")
  })

  test("does not resolve process env while redacting env values", () => {
    const previous = process.env.OPENAI_API_KEY
    process.env.OPENAI_API_KEY = "resolved-secret"
    try {
      const result = parseMcpImportLink(importUrl({
        name: "env-server",
        runtime: "claude-code",
        scope: "project",
        transport: "stdio",
        command: "node",
        args: ["server.js"],
        env: { OPENAI_API_KEY: "${OPENAI_API_KEY}" },
        envVars: ["MCP_PUBLIC_FLAG"],
      }))

      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error(result.message)
      const serialized = JSON.stringify(result.preview)
      expect(serialized).toContain("OPENAI_API_KEY")
      expect(serialized).toContain("MCP_PUBLIC_FLAG")
      expect(serialized).not.toContain("resolved-secret")
      expect(serialized).not.toContain("${OPENAI_API_KEY}")
    } finally {
      if (previous === undefined) {
        delete process.env.OPENAI_API_KEY
      } else {
        process.env.OPENAI_API_KEY = previous
      }
    }
  })

  test("redacts HTTP headers, OAuth blocks, and URL query values", () => {
    const result = parseMcpImportLink(importUrl({
      name: "remote-tools",
      runtime: "claude-code",
      scope: "global",
      transport: "sse",
      url: "https://mcp.example.com/sse?access_token=url-secret&tenant=acme#frag-secret",
      headers: {
        Authorization: "Bearer header-secret",
        "x-api-key": "header-api-secret",
      },
      _oauth: {
        accessToken: "oauth-access-secret",
        refreshToken: "oauth-refresh-secret",
      },
      bearerTokenEnvVar: "MCP_TOKEN",
    }))

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.message)

    expect(result.preview.url).toBe(
      "https://mcp.example.com/sse?access_token=<redacted>&tenant=<redacted>#<redacted>",
    )
    expect(result.preview.headers.map((field) => field.key).sort()).toEqual([
      "Authorization",
      "x-api-key",
    ])
    expect(result.preview.oauthFields.map((field) => field.key).sort()).toEqual([
      "accessToken",
      "refreshToken",
    ])
    const serialized = JSON.stringify(result.preview)
    expect(serialized).not.toContain("url-secret")
    expect(serialized).not.toContain("header-secret")
    expect(serialized).not.toContain("header-api-secret")
    expect(serialized).not.toContain("oauth-access-secret")
    expect(serialized).not.toContain("oauth-refresh-secret")
  })

  test("redacts env header source values that are not valid env var names", () => {
    const result = parseMcpImportLink(importUrl({
      name: "remote-tools",
      runtime: "claude-code",
      scope: "global",
      transport: "http",
      url: "https://mcp.example.com/mcp",
      envHttpHeaders: {
        Authorization: "Bearer source-secret",
      },
      bearerTokenEnvVar: "literal-secret-token",
    }))

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.message)
    const serialized = JSON.stringify(result.preview)
    expect(serialized).toContain("Authorization")
    expect(serialized).not.toContain("source-secret")
    expect(serialized).not.toContain("literal-secret-token")
    expect(result.preview.headers.every((field) => field.valueSourceKey !== "Bearer source-secret")).toBe(true)
    expect(result.preview.headers.every((field) => field.valueSourceKey !== "literal-secret-token")).toBe(true)
  })

  test("sanitizes deep-link logs without query values or decoded payload", () => {
    const raw = importUrl({
      name: "logged-server",
      runtime: "codex",
      scope: "global",
      transport: "stdio",
      command: "npx",
      env: { SECRET_KEY: "payload-secret" },
    }, "&code=oauth-code&state=state-secret&access_token=access-secret&api_key=api-secret")

    const sanitized = sanitizeDeepLinkForLog(raw)
    expect(sanitized).toContain("locus://mcp/import")
    expect(sanitized).toContain("payload")
    expect(sanitized).toContain("code")
    expect(sanitized).toContain("state")
    expect(sanitized).toContain("access_token")
    expect(sanitized).toContain("api_key")
    expect(sanitized).not.toContain("payload-secret")
    expect(sanitized).not.toContain("oauth-code")
    expect(sanitized).not.toContain("state-secret")
    expect(sanitized).not.toContain("access-secret")
    expect(sanitized).not.toContain("api-secret")
  })

  test("rejects unsupported and oversized payloads without echoing secrets", () => {
    const invalid = parseMcpImportLink(
      "locus://mcp/import?payload=%7B%22secret%22%3A%22secret-in-invalid-payload%22",
    )
    expect(invalid.ok).toBe(false)
    if (invalid.ok) throw new Error("expected invalid payload")
    expect(JSON.stringify(invalid)).not.toContain("secret-in-invalid-payload")

    const oversized = parseMcpImportLink(
      `locus://mcp/import?payload=${"a".repeat(16_001)}secret-in-oversized-payload`,
    )
    expect(oversized.ok).toBe(false)
    if (oversized.ok) throw new Error("expected oversized payload")
    expect(JSON.stringify(oversized)).not.toContain("secret-in-oversized-payload")
  })

  test("rejects mixed command and url transports", () => {
    const result = parseMcpImportLink(importUrl({
      name: "mixed",
      runtime: "codex",
      scope: "global",
      transport: "stdio",
      command: "npx",
      url: "https://mcp.example.com/sse",
    }))

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected invalid config")
    expect(result.code).toBe("invalid-config")
  })

  test("rejects malformed HTTP URLs without echoing query secrets", () => {
    const result = parseMcpImportLink(importUrl({
      name: "bad-url",
      runtime: "codex",
      scope: "global",
      transport: "http",
      url: "mcp.example.com/sse?api_key=url-secret",
    }))

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected invalid config")
    expect(JSON.stringify(result)).not.toContain("url-secret")
  })

  test("sanitizes command args outside import payloads", () => {
    expect(
      sanitizeMcpCommandArgs([
        "--api-key=arg-api-secret",
        "--header",
        "Authorization: Bearer bearer-secret",
        "--env",
        "OPENAI_API_KEY=sk-secret",
        "--env=SECRET_TOKEN=arg-secret",
        "SERVICE_TOKEN=plain-secret",
        "--safe",
        "value",
      ]).map((arg) => arg.value),
    ).toEqual([
      "--api-key=<redacted>",
      "--header",
      "Authorization: Bearer <redacted>",
      "--env",
      "OPENAI_API_KEY=<redacted>",
      "--env=SECRET_TOKEN=<redacted>",
      "SERVICE_TOKEN=<redacted>",
      "--safe",
      "value",
    ])
  })

  test("sanitizes Claude MCP renderer config", () => {
    const sanitized = sanitizeMcpConfigForRenderer({
      command: "node",
      args: ["server.js", "--token", "arg-secret"],
      env: { SECRET_ENV: "env-secret" },
      headers: { Authorization: "Bearer header-secret" },
      _oauth: {
        accessToken: "oauth-secret",
      },
      disabled: false,
    })

    expect(sanitized).toMatchObject({
      command: "node",
      args: ["server.js", "--token", "<redacted>"],
      env: { SECRET_ENV: "<redacted>" },
      headers: { Authorization: "<redacted>" },
      oauthFields: ["accessToken"],
      disabled: false,
    })
    const serialized = JSON.stringify(sanitized)
    expect(serialized).not.toContain("arg-secret")
    expect(serialized).not.toContain("env-secret")
    expect(serialized).not.toContain("header-secret")
    expect(serialized).not.toContain("oauth-secret")
    expect(serialized).not.toContain("_oauth")
  })

  test("sanitizes Codex MCP renderer config", () => {
    const sanitized = sanitizeMcpConfigForRenderer({
      transportType: "streamable_http",
      url: "https://mcp.example.com/mcp?api_key=url-secret",
      headers: {
        Authorization: "Bearer literal-secret",
        "x-api-key": "literal-api-secret",
      },
      envHttpHeaders: {
        Authorization: "MCP_AUTH_TOKEN",
      },
      bearerTokenEnvVar: "MCP_BEARER_TOKEN",
      enabled: true,
    })

    expect(sanitized).toMatchObject({
      transportType: "streamable_http",
      url: "https://mcp.example.com/mcp?api_key=<redacted>",
      headers: {
        Authorization: "<redacted>",
        "x-api-key": "<redacted>",
      },
      envHttpHeaders: {
        Authorization: "MCP_AUTH_TOKEN",
      },
      bearerTokenEnvVar: "MCP_BEARER_TOKEN",
      enabled: true,
    })
    const serialized = JSON.stringify(sanitized)
    expect(serialized).not.toContain("url-secret")
    expect(serialized).not.toContain("literal-secret")
    expect(serialized).not.toContain("literal-api-secret")
  })
})
