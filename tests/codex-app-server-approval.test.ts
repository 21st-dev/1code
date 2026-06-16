import { describe, expect, test } from "bun:test"
import type { ValidatedAgentScopeContract } from "../src/main/lib/agent-guard"
import {
  getCodexAppServerPermissionMapping,
  resolveDesktopPermissionPolicy,
} from "../src/main/lib/agent-runtime/permission-policy"
import {
  type CodexAppServerPermissionsRequestApprovalParams,
  createCodexAppServerApprovalBridge,
  resolveCodexAppServerPermissionsApprovalDecision,
} from "../src/main/lib/codex/app-server-approval"
import type { CodexAskUserQuestionPending } from "../src/main/lib/codex/ask-user-question"

function appServerPermission(
  mode: "plan" | "agent" = "agent",
  hasScopeContract = false,
  workspaceKind: "project" | "folderless" = "project",
) {
  return getCodexAppServerPermissionMapping(
    resolveDesktopPermissionPolicy({
      runtimeId: "codex",
      mode,
      workspaceKind,
      hasScopeContract,
      codexAdapterSource: "codex-app-server",
    }),
  )
}

function guardedContract(): ValidatedAgentScopeContract {
  return {
    id: "contract-approval",
    version: 1,
    status: "approved",
    createdAt: "2026-06-12T00:00:00.000Z",
    approvedAt: "2026-06-12T00:00:01.000Z",
    source: "manual",
    chatId: "chat-1",
    subChatId: "sub-1",
    runId: "run-app-server",
    cwd: "/repo",
    editableScope: [{ path: "src", kind: "directory" }],
    readOnlyEvidence: [],
    successChecks: [{ command: "bun test" }],
    blockedPaths: [],
    expansions: [],
  }
}

function permissionsParams(
  permissions: CodexAppServerPermissionsRequestApprovalParams["permissions"],
): CodexAppServerPermissionsRequestApprovalParams {
  return {
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "permissions-1",
    startedAtMs: Date.now(),
    cwd: "/repo",
    reason: "test permission request",
    permissions,
  }
}

describe("Codex app-server approval policy", () => {
  test("denies network permission expansions directly", () => {
    const decision = resolveCodexAppServerPermissionsApprovalDecision({
      params: permissionsParams({
        network: { enabled: true },
        fileSystem: null,
      }),
      permission: appServerPermission("agent"),
    })

    expect(decision).toMatchObject({
      allowedByPolicy: false,
      message:
        "Codex app-server runs do not grant network permission expansions.",
    })
  })

  test("assistant app-server policy denies side-effect approvals before asking the user", async () => {
    const chunks: Array<Record<string, unknown>> = []
    const pending = new Map<string, CodexAskUserQuestionPending>()
    const bridge = createCodexAppServerApprovalBridge({
      subChatId: "sub-1",
      permission: appServerPermission("agent", false, "folderless"),
      emit: (chunk) => chunks.push(chunk),
      registerPendingQuestion: (toolUseId, approval) => {
        pending.set(toolUseId, approval)
      },
      unregisterPendingQuestion: (toolUseId) => {
        pending.delete(toolUseId)
      },
    })

    await expect(
      bridge.handleCommandExecution({
        requestId: "assistant-command-denied",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "item-command",
          startedAtMs: Date.now(),
          command: "echo hello",
        },
      }),
    ).resolves.toEqual({ decision: "decline" })

    await expect(
      bridge.handleFileChange({
        requestId: "assistant-file-denied",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "item-file",
          startedAtMs: Date.now(),
          grantRoot: "/repo/src/app.ts",
        },
      }),
    ).resolves.toEqual({ decision: "decline" })

    await expect(
      bridge.handlePermissions({
        requestId: "assistant-permissions-denied",
        params: permissionsParams({
          network: null,
          fileSystem: {
            read: ["/repo/src"],
            write: null,
          },
        }),
      }),
    ).resolves.toEqual({
      permissions: {},
      scope: "turn",
      strictAutoReview: true,
    })

    expect(chunks.map((chunk) => chunk.type)).not.toContain("ask-user-question")
    expect(pending.size).toBe(0)

    const bridgeWithoutApprovalHooks = createCodexAppServerApprovalBridge({
      subChatId: "sub-1",
      permission: appServerPermission("agent", false, "folderless"),
    })
    await expect(
      bridgeWithoutApprovalHooks.handleCommandExecution({
        requestId: "assistant-command-no-hooks",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "item-command-no-hooks",
          startedAtMs: Date.now(),
          command: "echo hello",
        },
      }),
    ).resolves.toEqual({ decision: "decline" })
  })

  test("denies guarded permission paths that escape the workspace", () => {
    const decision = resolveCodexAppServerPermissionsApprovalDecision({
      params: permissionsParams({
        network: null,
        fileSystem: {
          read: null,
          write: ["/outside/secret.txt"],
        },
      }),
      permission: appServerPermission("agent", true),
      guardedContract: guardedContract(),
    })

    expect(decision).toMatchObject({
      allowedByPolicy: false,
      message:
        "Codex app-server permission request escapes the guarded workspace.",
    })
  })

  test("checks every requested guarded permission path against the scope contract", () => {
    const guardEvents: Array<{ type: string; path?: string }> = []
    const decision = resolveCodexAppServerPermissionsApprovalDecision({
      params: permissionsParams({
        network: null,
        fileSystem: {
          read: null,
          write: ["/repo/src/allowed.ts", "/repo/docs/out-of-scope.md"],
        },
      }),
      permission: appServerPermission("agent", true),
      guardedContract: guardedContract(),
      onGuardEvent: (event) => guardEvents.push(event),
    })

    expect(decision.allowedByPolicy).toBe(false)
    expect(decision.message).toContain("Guarded run requires approval")
    expect(guardEvents.map((event) => event.type)).toEqual([
      "allowed",
      "scope-expansion-request",
    ])
    expect(guardEvents.at(-1)?.path).toBe("docs/out-of-scope.md")
  })

  test("emits explicit Deny approval option and maps it to decline", async () => {
    const chunks: Record<string, any>[] = []
    const pending = new Map<string, CodexAskUserQuestionPending>()
    const bridge = createCodexAppServerApprovalBridge({
      subChatId: "sub-1",
      permission: appServerPermission("agent"),
      emit: (chunk) => chunks.push(chunk),
      registerPendingQuestion: (toolUseId, approval) => {
        pending.set(toolUseId, approval)
      },
      unregisterPendingQuestion: (toolUseId) => {
        pending.delete(toolUseId)
      },
    })

    const responsePromise = bridge.handleCommandExecution({
      requestId: "command-1",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-command",
        startedAtMs: Date.now(),
        command: "echo hello",
      },
    })

    const askChunk = chunks.find((chunk) => chunk.type === "ask-user-question")
    const askQuestion = askChunk?.questions?.[0] as
      | { options: Array<{ label: string }> }
      | undefined
    expect(
      askQuestion?.options.map((option) => option.label),
    ).toEqual(["Approve", "Deny"])

    pending.get(askChunk!.toolUseId)?.resolve({
      approved: true,
      updatedInput: { answers: { "Run command": "Deny" } },
    })

    await expect(responsePromise).resolves.toEqual({ decision: "decline" })
    expect(chunks.at(-1)).toMatchObject({
      type: "ask-user-question-result",
      result: "declined",
    })
  })

  test("asks for user approval before accepting scoped shell file writes", async () => {
    const chunks: Record<string, any>[] = []
    const pending = new Map<string, CodexAskUserQuestionPending>()
    const bridge = createCodexAppServerApprovalBridge({
      subChatId: "sub-1",
      permission: appServerPermission("agent", true),
      guardedContract: guardedContract(),
      emit: (chunk) => chunks.push(chunk),
      onGuardEvent: (event) => chunks.push({ type: "guard-event", event }),
      registerPendingQuestion: (toolUseId, approval) => {
        pending.set(toolUseId, approval)
      },
      unregisterPendingQuestion: (toolUseId) => {
        pending.delete(toolUseId)
      },
    })

    const responsePromise = bridge.handleCommandExecution({
      requestId: "command-scoped-write",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-command",
        startedAtMs: Date.now(),
        command:
          "/bin/zsh -lc \"mkdir -p /repo/src && echo 'hello' > /repo/src/generated.txt\"",
      },
    })

    const allowedEvent = chunks.find((chunk) => chunk.type === "guard-event")
    expect(allowedEvent).toMatchObject({
      event: {
        type: "allowed",
        toolName: "Bash",
        paths: ["src", "src/generated.txt"],
      },
    })
    const askChunk = chunks.find((chunk) => chunk.type === "ask-user-question")
    expect(askChunk?.toolUseId).toContain("command-approval")

    pending.get(askChunk!.toolUseId)?.resolve({
      approved: true,
      updatedInput: { answers: { "Run command": "Approve" } },
    })

    await expect(responsePromise).resolves.toEqual({ decision: "accept" })
  })

  test("accepts scoped shell writes that use absolute system executables", async () => {
    const chunks: Record<string, any>[] = []
    const pending = new Map<string, CodexAskUserQuestionPending>()
    const bridge = createCodexAppServerApprovalBridge({
      subChatId: "sub-1",
      permission: appServerPermission("agent", true),
      guardedContract: guardedContract(),
      emit: (chunk) => chunks.push(chunk),
      onGuardEvent: (event) => chunks.push({ type: "guard-event", event }),
      registerPendingQuestion: (toolUseId, approval) => {
        pending.set(toolUseId, approval)
      },
      unregisterPendingQuestion: (toolUseId) => {
        pending.delete(toolUseId)
      },
    })

    const responsePromise = bridge.handleCommandExecution({
      requestId: "command-scoped-absolute-write",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-command",
        startedAtMs: Date.now(),
        command:
          "/bin/zsh -lc \"/bin/mkdir -p /repo/src && /usr/bin/printf 'hello' > /repo/src/generated.txt\"",
      },
    })

    const allowedEvent = chunks.find((chunk) => chunk.type === "guard-event")
    expect(allowedEvent).toMatchObject({
      event: {
        type: "allowed",
        toolName: "Bash",
        paths: ["src", "src/generated.txt"],
      },
    })
    const askChunk = chunks.find((chunk) => chunk.type === "ask-user-question")
    expect(askChunk?.toolUseId).toContain("command-approval")

    pending.get(askChunk!.toolUseId)?.resolve({
      approved: true,
      updatedInput: { answers: { "Run command": "Approve" } },
    })

    await expect(responsePromise).resolves.toEqual({ decision: "accept" })
  })

  test("accepts scoped shell writes that use echo -n", async () => {
    const chunks: Record<string, any>[] = []
    const pending = new Map<string, CodexAskUserQuestionPending>()
    const bridge = createCodexAppServerApprovalBridge({
      subChatId: "sub-1",
      permission: appServerPermission("agent", true),
      guardedContract: guardedContract(),
      emit: (chunk) => chunks.push(chunk),
      onGuardEvent: (event) => chunks.push({ type: "guard-event", event }),
      registerPendingQuestion: (toolUseId, approval) => {
        pending.set(toolUseId, approval)
      },
      unregisterPendingQuestion: (toolUseId) => {
        pending.delete(toolUseId)
      },
    })

    const responsePromise = bridge.handleCommandExecution({
      requestId: "command-scoped-echo-n-write",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-command",
        startedAtMs: Date.now(),
        command: "/bin/zsh -lc \"echo -n 'hello' > /repo/src/generated.txt\"",
      },
    })

    const allowedEvent = chunks.find((chunk) => chunk.type === "guard-event")
    expect(allowedEvent).toMatchObject({
      event: {
        type: "allowed",
        toolName: "Bash",
        paths: ["src/generated.txt"],
      },
    })
    const askChunk = chunks.find((chunk) => chunk.type === "ask-user-question")
    expect(askChunk?.toolUseId).toContain("command-approval")

    pending.get(askChunk!.toolUseId)?.resolve({
      approved: true,
      updatedInput: { answers: { "Run command": "Approve" } },
    })

    await expect(responsePromise).resolves.toEqual({ decision: "accept" })
  })

  test("keeps out-of-scope shell file writes fail-closed before user approval", async () => {
    const chunks: Record<string, any>[] = []
    const pending = new Map<string, CodexAskUserQuestionPending>()
    const bridge = createCodexAppServerApprovalBridge({
      subChatId: "sub-1",
      permission: appServerPermission("agent", true),
      guardedContract: guardedContract(),
      emit: (chunk) => chunks.push(chunk),
      onGuardEvent: (event) => chunks.push({ type: "guard-event", event }),
      registerPendingQuestion: (toolUseId, approval) => {
        pending.set(toolUseId, approval)
      },
      unregisterPendingQuestion: (toolUseId) => {
        pending.delete(toolUseId)
      },
    })

    await expect(
      bridge.handleCommandExecution({
        requestId: "command-out-of-scope-write",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "item-command",
          startedAtMs: Date.now(),
          command: "/bin/zsh -lc \"echo 'hello' > /repo/docs/out.txt\"",
        },
      }),
    ).resolves.toEqual({ decision: "decline" })

    expect(chunks.map((chunk) => chunk.type)).toContain("guard-event")
    expect(chunks.map((chunk) => chunk.type)).not.toContain("ask-user-question")
    expect(pending.size).toBe(0)
  })

  test("keeps shell-expanded file write paths fail-closed before user approval", async () => {
    for (const [requestId, command] of [
      [
        "command-dollar-home-write",
        '/bin/zsh -lc "echo \'hello\' > \\"$HOME/.ssh/authorized_keys\\""',
      ],
      ["command-tilde-write", "/bin/zsh -lc \"echo 'hello' > ~/secret.txt\""],
      ["command-glob-write", "/bin/zsh -lc \"echo 'hello' > /repo/src/*.txt\""],
      [
        "command-brace-write",
        "/bin/zsh -lc \"echo 'hello' > /repo/src/{a,b}.txt\"",
      ],
    ] as const) {
      const chunks: Record<string, any>[] = []
      const pending = new Map<string, CodexAskUserQuestionPending>()
      const bridge = createCodexAppServerApprovalBridge({
        subChatId: "sub-1",
        permission: appServerPermission("agent", true),
        guardedContract: guardedContract(),
        emit: (chunk) => chunks.push(chunk),
        onGuardEvent: (event) => chunks.push({ type: "guard-event", event }),
        registerPendingQuestion: (toolUseId, approval) => {
          pending.set(toolUseId, approval)
        },
        unregisterPendingQuestion: (toolUseId) => {
          pending.delete(toolUseId)
        },
      })

      await expect(
        bridge.handleCommandExecution({
          requestId,
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            itemId: "item-command",
            startedAtMs: Date.now(),
            command,
          },
        }),
      ).resolves.toEqual({ decision: "decline" })

      expect(chunks.map((chunk) => chunk.type)).toContain("guard-event")
      expect(chunks.map((chunk) => chunk.type)).not.toContain(
        "ask-user-question",
      )
      expect(pending.size).toBe(0)
    }
  })
})
