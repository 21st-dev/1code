import { describe, expect, test } from "bun:test"
import { shouldAttachCodexMcpServerToSession } from "./codex-mcp-session"

const sessionServer = { name: "local-tools" }

describe("Codex MCP session eligibility", () => {
  test("keeps healthy tool-bearing servers in the session config", () => {
    expect(
      shouldAttachCodexMcpServerToSession({
        sessionServer,
        settingsServer: {
          status: "connected",
          needsAuth: false,
          tools: [{ name: "search" }],
        },
        toolsWereResolved: true,
      }),
    ).toBe(true)
  })

  test("keeps failed settings entries visible but out of the Codex session", () => {
    expect(
      shouldAttachCodexMcpServerToSession({
        sessionServer,
        settingsServer: {
          status: "failed",
          needsAuth: false,
          tools: [],
        },
        toolsWereResolved: true,
      }),
    ).toBe(false)
  })

  test("does not pass auth-blocked servers to the Codex runtime", () => {
    expect(
      shouldAttachCodexMcpServerToSession({
        sessionServer,
        settingsServer: {
          status: "needs-auth",
          needsAuth: true,
          tools: [],
        },
        toolsWereResolved: true,
      }),
    ).toBe(false)
  })

  test("does not pass unverified empty tool probes into native Codex", () => {
    expect(
      shouldAttachCodexMcpServerToSession({
        sessionServer,
        settingsServer: {
          status: "connected",
          needsAuth: false,
          tools: [],
        },
        toolsWereResolved: true,
      }),
    ).toBe(false)
  })
})
