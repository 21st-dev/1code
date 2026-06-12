import { describe, expect, test } from "bun:test"
import {
  CODEX_APP_SERVER_0_134_SERVER_REQUEST_METHODS,
  CODEX_APP_SERVER_0_134_SIDE_EFFECT_SERVER_REQUEST_METHODS,
  dispatchCodexAppServerServerRequest,
  isCodexAppServerKnownServerRequest,
  isCodexAppServerPreExecutionApprovalRequest,
  type CodexAppServerApprovalGateState,
  type CodexAppServerServerRequest,
} from "../src/main/lib/codex/app-server-safety"

function sideEffectRequest(
  method: CodexAppServerServerRequest["method"],
): CodexAppServerServerRequest {
  return {
    method,
    id: "request-1",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-1",
    },
  }
}

describe("Codex app-server safety proof", () => {
  test("covers every bundled 0.134.0 server request method with default-deny classification", () => {
    expect(CODEX_APP_SERVER_0_134_SERVER_REQUEST_METHODS).toEqual([
      "item/commandExecution/requestApproval",
      "item/fileChange/requestApproval",
      "item/tool/requestUserInput",
      "mcpServer/elicitation/request",
      "item/permissions/requestApproval",
      "item/tool/call",
      "account/chatgptAuthTokens/refresh",
      "attestation/generate",
      "applyPatchApproval",
      "execCommandApproval",
    ])

    for (const method of CODEX_APP_SERVER_0_134_SERVER_REQUEST_METHODS) {
      expect(isCodexAppServerKnownServerRequest(method)).toBe(true)
    }

    for (const method of CODEX_APP_SERVER_0_134_SIDE_EFFECT_SERVER_REQUEST_METHODS) {
      expect(isCodexAppServerPreExecutionApprovalRequest(method)).toBe(true)
    }
  })

  test("classifies pre-execution side-effect request methods", () => {
    expect(
      isCodexAppServerPreExecutionApprovalRequest(
        "item/commandExecution/requestApproval",
      ),
    ).toBe(true)
    expect(
      isCodexAppServerPreExecutionApprovalRequest(
        "item/fileChange/requestApproval",
      ),
    ).toBe(true)
    expect(
      isCodexAppServerPreExecutionApprovalRequest(
        "item/permissions/requestApproval",
      ),
    ).toBe(true)
    expect(isCodexAppServerPreExecutionApprovalRequest("item/tool/call")).toBe(
      true,
    )
    expect(isCodexAppServerPreExecutionApprovalRequest("applyPatchApproval")).toBe(
      true,
    )
    expect(isCodexAppServerPreExecutionApprovalRequest("execCommandApproval")).toBe(
      true,
    )
    expect(isCodexAppServerPreExecutionApprovalRequest("turn/completed")).toBe(
      false,
    )
  })

  test("fails closed for unknown server request methods", async () => {
    const dispatched: CodexAppServerServerRequest[] = []

    await expect(
      dispatchCodexAppServerServerRequest({
        request: sideEffectRequest("item/newSideEffect/requestApproval"),
        gate: { approvalHookInstalled: true },
        dispatch: (request) => dispatched.push(request),
      }),
    ).rejects.toThrow(
      "Unknown Codex app-server server request method refused by default: item/newSideEffect/requestApproval.",
    )

    expect(dispatched).toEqual([])
  })

  test("fails closed when the approval hook is missing before a command request", async () => {
    const dispatched: CodexAppServerServerRequest[] = []

    await expect(
      dispatchCodexAppServerServerRequest({
        request: sideEffectRequest("item/commandExecution/requestApproval"),
        gate: { approvalHookInstalled: false },
        dispatch: (request) => dispatched.push(request),
      }),
    ).rejects.toThrow(
      "Codex app-server approval hook is not installed; refusing item/commandExecution/requestApproval before side effects.",
    )

    expect(dispatched).toEqual([])
  })

  test("fails closed when approval hook installation is delayed until after the first side-effect request", async () => {
    const gate: CodexAppServerApprovalGateState = {
      approvalHookInstalled: false,
    }
    const dispatched: CodexAppServerServerRequest[] = []
    const firstRequest = sideEffectRequest("item/tool/call")

    await expect(
      dispatchCodexAppServerServerRequest({
        request: firstRequest,
        gate,
        dispatch: (request) => dispatched.push(request),
      }),
    ).rejects.toThrow(
      "Codex app-server approval hook is not installed; refusing item/tool/call before side effects.",
    )

    gate.approvalHookInstalled = true

    expect(dispatched).toEqual([])
  })

  test("allows command, file, permission, and MCP tool requests only after hook readiness", async () => {
    const gate: CodexAppServerApprovalGateState = {
      approvalHookInstalled: true,
    }
    const dispatched: string[] = []

    for (const request of [
      sideEffectRequest("item/commandExecution/requestApproval"),
      sideEffectRequest("item/fileChange/requestApproval"),
      sideEffectRequest("item/permissions/requestApproval"),
      sideEffectRequest("item/tool/call"),
    ]) {
      await expect(
        dispatchCodexAppServerServerRequest({
          request,
          gate,
          dispatch: (value) => dispatched.push(value.method),
        }),
      ).resolves.toEqual({ dispatched: true })
    }

    expect(dispatched).toEqual([
      "item/commandExecution/requestApproval",
      "item/fileChange/requestApproval",
      "item/permissions/requestApproval",
      "item/tool/call",
    ])
  })
})
