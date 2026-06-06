import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import {
  createClaudeAgentSdkEmbeddedErrorContext,
  finalizeClaudeAgentSdkEmbeddedError,
  handleClaudeAgentSdkEmbeddedErrorMessage,
} from "../src/main/lib/claude/agent-sdk-embedded-error-finalization"
import { createClaudeAgentSdkPolicyRetryState } from "../src/main/lib/claude/agent-sdk-policy-retry"

let originalConsoleError: typeof console.error

beforeEach(() => {
  originalConsoleError = console.error
  console.error = mock(() => {}) as typeof console.error
})

afterEach(() => {
  console.error = originalConsoleError
})

function baseInput() {
  return {
    message: {
      type: "error",
      error: "overloaded",
      session_id: "session-1",
      message: {
        id: "message-1",
        content: [{ text: "Claude is overloaded" }],
      },
    },
    policyRetry: createClaudeAgentSdkPolicyRetryState(),
    usesApiKeyAuth: false,
    aborted: false,
    subChatId: "sub-1",
    chatId: "chat-1",
    cwd: "/repo",
    mode: "agent",
    hasCustomConfig: false,
    isUsingOllama: false,
    model: "claude-sonnet",
    hasOAuthToken: true,
    mcpServerNames: ["filesystem"],
    subId: "sub-1",
    chunkCount: 4,
    emit: mock(() => {}),
    complete: mock(() => {}),
    log: mock(() => {}),
  }
}

describe("Claude Agent SDK embedded error finalization", () => {
  test("creates embedded error diagnostic context from runtime state", () => {
    expect(
      createClaudeAgentSdkEmbeddedErrorContext({
        customConfig: { model: "qwen" },
        hasExistingApiConfig: true,
        aborted: true,
        subChatId: "sub-1",
        chatId: "chat-1",
        cwd: "/repo",
        mode: "agent",
        isUsingOllama: true,
        model: "qwen",
        oauthToken: "token",
        mcpServers: {
          filesystem: {},
          github: {},
        },
      }),
    ).toEqual({
      usesApiKeyAuth: true,
      aborted: true,
      subChatId: "sub-1",
      chatId: "chat-1",
      cwd: "/repo",
      mode: "agent",
      hasCustomConfig: true,
      isUsingOllama: true,
      model: "qwen",
      hasOAuthToken: true,
      mcpServerNames: ["filesystem", "github"],
    })

    expect(
      createClaudeAgentSdkEmbeddedErrorContext({
        customConfig: null,
        hasExistingApiConfig: false,
        aborted: false,
        subChatId: "sub-1",
        chatId: "chat-1",
        cwd: "/repo",
        mode: "plan",
        isUsingOllama: false,
        model: "claude-sonnet",
        oauthToken: null,
        mcpServers: undefined,
      }),
    ).toMatchObject({
      usesApiKeyAuth: false,
      hasCustomConfig: false,
      hasOAuthToken: false,
      mcpServerNames: [],
    })
  })

  test("ignores non-error SDK messages before finalization", () => {
    const input = {
      ...baseInput(),
      message: { type: "assistant", message: { content: [] } },
    }

    expect(handleClaudeAgentSdkEmbeddedErrorMessage(input)).toEqual({
      status: "none",
    })
    expect(input.emit).not.toHaveBeenCalled()
    expect(input.complete).not.toHaveBeenCalled()
  })

  test("records a policy retry instead of emitting a terminal error", () => {
    const input = {
      ...baseInput(),
      message: {
        type: "error",
        error: "invalid_request",
        message: {
          content: [{ text: "Usage Policy violation" }],
        },
      },
    }

    expect(finalizeClaudeAgentSdkEmbeddedError(input)).toEqual({
      status: "retry",
    })
    const handledInput = {
      ...input,
      policyRetry: createClaudeAgentSdkPolicyRetryState(),
      emit: mock(() => {}),
      complete: mock(() => {}),
      log: mock(() => {}),
    }
    expect(handleClaudeAgentSdkEmbeddedErrorMessage(handledInput)).toEqual({
      status: "retry",
    })
    expect(input.policyRetry).toMatchObject({ count: 1, needed: true })
    expect(input.emit).not.toHaveBeenCalled()
    expect(input.complete).not.toHaveBeenCalled()
  })

  test("emits auth-error chunks for SDK auth failures", () => {
    const input = {
      ...baseInput(),
      message: {
        type: "error",
        error: "authentication_failed",
        message: {
          content: [{ text: "authentication failed" }],
        },
      },
    }

    expect(finalizeClaudeAgentSdkEmbeddedError(input)).toEqual({
      status: "failed",
      error: {
        message:
          "Authentication failed - reconnect or import local Claude Code credentials",
        code: "AUTH_FAILED_SDK",
      },
    })
    expect(input.emit).toHaveBeenCalledWith({
      type: "auth-error",
      errorText:
        "Authentication failed - reconnect or import local Claude Code credentials",
    })
    expect(input.emit).toHaveBeenCalledWith({ type: "finish" })
    expect(input.complete).toHaveBeenCalledTimes(1)
  })

  test("emits renderer-safe error chunks for terminal SDK errors", () => {
    const input = baseInput()

    expect(finalizeClaudeAgentSdkEmbeddedError(input)).toEqual({
      status: "failed",
      error: {
        message: "Claude is overloaded, try again later",
        code: "OVERLOADED_SDK",
      },
    })
    expect(input.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        errorText: "Claude is overloaded, try again later",
        debugInfo: {
          category: "OVERLOADED_SDK",
          rawErrorCode: "overloaded",
          sessionId: "session-1",
          messageId: "message-1",
        },
      }),
    )
    expect(input.emit).toHaveBeenCalledWith({ type: "finish" })
    expect(input.complete).toHaveBeenCalledTimes(1)
    expect(input.log).toHaveBeenCalledWith(
      "[SD] M:END sub=sub-1 reason=sdk_error cat=OVERLOADED_SDK n=4",
    )
  })
})
