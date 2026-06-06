import { describe, expect, mock, test } from "bun:test"
import { join } from "node:path"
import type { AgentScopeContract } from "../src/shared/agent-scope-contracts"
import {
  getClaudePermissionMapping,
  resolveDesktopPermissionPolicy,
} from "../src/main/lib/agent-runtime/permission-policy"
import type {
  ClaudeAskUserQuestionPending,
} from "../src/main/lib/claude/agent-sdk-tool-permission"

mock.module("electron", () => ({
  app: {
    getPath(name: string) {
      if (name !== "userData") {
        throw new Error(`unexpected app path request: ${name}`)
      }
      return join(process.cwd(), ".tmp-test-user-data")
    },
    isPackaged: false,
  },
}))

const { createClaudeAgentSdkToolPermissionHandler } = await import(
  "../src/main/lib/claude/agent-sdk-tool-permission"
)
const { validateAgentScopeContract } = await import(
  "../src/main/lib/agent-guard"
)

const cwd = join(process.cwd(), "example-project")

function toolOptions(toolUseID: string) {
  return {
    toolUseID,
    signal: new AbortController().signal,
  } as any
}

function baseHandlerInput(
  overrides: Partial<
    Parameters<typeof createClaudeAgentSdkToolPermissionHandler>[0]
  > = {},
) {
  return {
    isUsingOllama: false,
    permissionPolicy: resolveDesktopPermissionPolicy({
      runtimeId: "claude-code",
      mode: "agent",
    }),
    guardedContract: null,
    getGuardedContract: () => undefined,
    recordGuardEvent: () => {},
    emit: () => {},
    subChatId: "sub-1",
    pendingToolApprovals: new Map<string, ClaudeAskUserQuestionPending>(),
    parts: [],
    ...overrides,
  }
}

function baseContract(): AgentScopeContract {
  return {
    id: "contract-1",
    version: 1,
    status: "approved",
    createdAt: "2026-06-07T00:00:00.000Z",
    approvedAt: "2026-06-07T00:00:01.000Z",
    source: "manual",
    chatId: "chat-1",
    subChatId: "sub-1",
    runId: "run-1",
    cwd,
    projectPath: cwd,
    editableScope: [{ path: "src/app.ts", kind: "file" }],
    readOnlyEvidence: [{ path: "tests/app.test.ts", kind: "file" }],
    successChecks: [{ command: "bun test tests/app.test.ts" }],
    blockedPaths: [],
    expansions: [],
  }
}

describe("Claude Agent SDK tool permission handler", () => {
  test("repairs Ollama tool aliases and blocks plan-mode side effects", async () => {
    const handler = createClaudeAgentSdkToolPermissionHandler(
      baseHandlerInput({
        isUsingOllama: true,
        permissionPolicy: resolveDesktopPermissionPolicy({
          runtimeId: "claude-code",
          mode: "plan",
        }),
      }),
    )
    const readInput: Record<string, unknown> = { file: "src/app.ts" }

    const readResult = await handler("Read", readInput, toolOptions("tool-1"))
    expect(readResult).toEqual({
      behavior: "allow",
      updatedInput: { file_path: "src/app.ts" },
    })
    expect(readInput).toEqual({ file_path: "src/app.ts" })

    const writeResult = await handler(
      "Edit",
      { file_path: "src/app.ts" },
      toolOptions("tool-2"),
    )
    expect(writeResult.behavior).toBe("deny")
    expect(writeResult.message).toContain("blocked in plan mode")
  })

  test("bridges AskUserQuestion through pending approval state", async () => {
    const pendingToolApprovals = new Map<string, ClaudeAskUserQuestionPending>()
    const emitted: any[] = []
    const parts: Array<Record<string, any>> = [
      {
        type: "tool-AskUserQuestion",
        toolCallId: "ask-1",
        state: "call",
      },
    ]
    const handler = createClaudeAgentSdkToolPermissionHandler(
      baseHandlerInput({
        pendingToolApprovals,
        parts,
        emit: (chunk) => {
          emitted.push(chunk)
        },
      }),
    )

    const resultPromise = handler(
      "AskUserQuestion",
      {
        questions: [
          {
            question: "Proceed?",
            header: "Confirm",
            options: [{ label: "Yes", description: "Continue." }],
            multiSelect: false,
          },
        ],
      },
      toolOptions("ask-1"),
    )

    expect(pendingToolApprovals.has("ask-1")).toBe(true)
    pendingToolApprovals.get("ask-1")?.resolve({
      approved: true,
      updatedInput: { answers: ["Yes"] },
    })

    const result = await resultPromise
    expect(result).toEqual({
      behavior: "allow",
      updatedInput: { answers: ["Yes"] },
    })
    expect(parts[0]).toMatchObject({
      state: "result",
      result: { answers: ["Yes"] },
    })
    expect(emitted.map((chunk) => chunk.type)).toEqual([
      "ask-user-question",
      "ask-user-question-result",
    ])
  })

  test("delegates guarded tool decisions to the guard owner", async () => {
    const guardedContract = await validateAgentScopeContract(baseContract(), {
      cwd,
      projectPath: cwd,
      chatId: "chat-1",
      subChatId: "sub-1",
      runId: "run-1",
      requireRegisteredWorktree: false,
    })
    const guardEvents: any[] = []
    const emitted: any[] = []
    const permissionPolicy = resolveDesktopPermissionPolicy({
      runtimeId: "claude-code",
      mode: "agent",
      hasScopeContract: true,
    })
    expect(getClaudePermissionMapping(permissionPolicy).requiresToolPolicy).toBe(
      true,
    )

    const handler = createClaudeAgentSdkToolPermissionHandler(
      baseHandlerInput({
        permissionPolicy,
        guardedContract,
        getGuardedContract: () => guardedContract,
        recordGuardEvent: (event) => {
          guardEvents.push(event)
        },
        emit: (chunk) => {
          emitted.push(chunk)
        },
      }),
    )

    const result = await handler(
      "Edit",
      { file_path: "src/app.ts" },
      toolOptions("tool-1"),
    )

    expect(result.behavior).toBe("allow")
    expect(guardEvents).toHaveLength(1)
    expect(guardEvents[0]).toMatchObject({ type: "allowed" })
    expect(emitted).toEqual([
      {
        type: "guard-event",
        event: guardEvents[0],
      },
    ])
  })
})
