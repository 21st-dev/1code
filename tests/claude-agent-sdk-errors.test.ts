import { describe, expect, test } from "bun:test"
import {
  CLAUDE_MAX_POLICY_RETRIES,
  classifyClaudeAgentSdkEmbeddedError,
  classifyClaudeAgentSdkStreamError,
  getClaudePolicyRetryDelayMs,
} from "../src/main/lib/claude/agent-sdk-errors"

describe("Claude Agent SDK error diagnostics", () => {
  test("distinguishes OAuth auth reconnect from API key auth failure", () => {
    expect(
      classifyClaudeAgentSdkEmbeddedError({
        rawErrorCode: "authentication_failed",
        sdkError: "authentication failed",
        usesApiKeyAuth: false,
        policyRetryCount: 0,
        aborted: false,
      }),
    ).toMatchObject({
      category: "AUTH_FAILED_SDK",
      context:
        "Authentication failed - reconnect or import local Claude Code credentials",
      shouldEmitAuthError: true,
      shouldRetryPolicy: false,
    })

    expect(
      classifyClaudeAgentSdkEmbeddedError({
        rawErrorCode: "authentication_failed",
        sdkError: "authentication failed",
        usesApiKeyAuth: true,
        policyRetryCount: 0,
        aborted: false,
      }),
    ).toMatchObject({
      category: "AUTH_FAILURE",
      context: "Authentication failed - check your API key",
      shouldEmitAuthError: false,
    })
  })

  test("classifies embedded MCP token and provider errors", () => {
    expect(
      classifyClaudeAgentSdkEmbeddedError({
        sdkError: "invalid_token from remote MCP server",
        usesApiKeyAuth: false,
        policyRetryCount: 0,
        aborted: false,
      }),
    ).toMatchObject({
      category: "MCP_INVALID_TOKEN",
      context: "Invalid access token. Update MCP settings",
    })

    expect(
      classifyClaudeAgentSdkEmbeddedError({
        rawErrorCode: "overloaded",
        sdkError: "provider overloaded",
        usesApiKeyAuth: true,
        policyRetryCount: 0,
        aborted: false,
      }),
    ).toMatchObject({
      category: "OVERLOADED_SDK",
      context: "Claude is overloaded, try again later",
    })
  })

  test("allows silent policy retry until retry budget is exhausted", () => {
    expect(CLAUDE_MAX_POLICY_RETRIES).toBe(2)
    expect(getClaudePolicyRetryDelayMs(1)).toBe(3000)
    expect(getClaudePolicyRetryDelayMs(2)).toBe(6000)

    expect(
      classifyClaudeAgentSdkEmbeddedError({
        rawErrorCode: "invalid_request",
        sdkError: "Usage Policy rejection",
        usesApiKeyAuth: false,
        policyRetryCount: 1,
        maxPolicyRetries: CLAUDE_MAX_POLICY_RETRIES,
        aborted: false,
      }),
    ).toMatchObject({
      category: "USAGE_POLICY_VIOLATION",
      shouldRetryPolicy: true,
    })

    expect(
      classifyClaudeAgentSdkEmbeddedError({
        rawErrorCode: "invalid_request",
        sdkError: "Usage Policy rejection",
        usesApiKeyAuth: false,
        policyRetryCount: 2,
        maxPolicyRetries: CLAUDE_MAX_POLICY_RETRIES,
        aborted: false,
      }).shouldRetryPolicy,
    ).toBe(false)

    expect(
      classifyClaudeAgentSdkEmbeddedError({
        rawErrorCode: "invalid_request",
        sdkError: "Usage Policy rejection",
        usesApiKeyAuth: false,
        policyRetryCount: 0,
        aborted: true,
      }).shouldRetryPolicy,
    ).toBe(false)
  })

  test("classifies streaming session expiry from stderr", () => {
    expect(
      classifyClaudeAgentSdkStreamError({
        error: new Error("stream failed"),
        stderrOutput: "No conversation found with session ID abc-123",
      }),
    ).toEqual({
      category: "SESSION_EXPIRED",
      context: "Previous session expired. Please try again.",
      isSessionNotFound: true,
    })
  })

  test("classifies common streaming process and connectivity errors", () => {
    expect(
      classifyClaudeAgentSdkStreamError({
        error: new Error("process exited with code 1"),
      }).category,
    ).toBe("PROCESS_CRASH")

    expect(
      classifyClaudeAgentSdkStreamError({
        error: new Error("spawn claude ENOENT"),
      }).category,
    ).toBe("EXECUTABLE_NOT_FOUND")

    expect(
      classifyClaudeAgentSdkStreamError({
        error: new Error("fetch failed with ECONNREFUSED"),
      }).category,
    ).toBe("NETWORK_ERROR")
  })
})
