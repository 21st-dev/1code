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

const {
  createClaudeAgentSdkPermissionControls,
  createClaudeAgentSdkToolPermissionHandler,
} = await import("../src/main/lib/claude/agent-sdk-tool-permission")
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

  test("observes normal Agent-mode tools and loudly blocks catastrophic actions", async () => {
    const emitted: any[] = []
    const handler = createClaudeAgentSdkToolPermissionHandler(
      baseHandlerInput({
        emit: (chunk) => {
          emitted.push(chunk)
        },
      }),
    )

    const normalResult = await handler(
      "Edit",
      { file_path: "src/app.ts" },
      toolOptions("observe-1"),
    )
    const catastrophicResult = await handler(
      "Bash",
      { command: "git reset --hard HEAD" },
      toolOptions("observe-2"),
    )

    expect(normalResult).toEqual({
      behavior: "allow",
      updatedInput: { file_path: "src/app.ts" },
    })
    expect(catastrophicResult.behavior).toBe("deny")
    expect(catastrophicResult.message).toContain("Observed mode blocked Bash")
    expect(emitted).toHaveLength(2)
    expect(emitted[0]).toMatchObject({
      type: "observed-tool-decision",
      controlLevel: "observe",
      decision: "allow",
      risk: {
        toolName: "Edit",
        toolUseId: "observe-1",
        riskLevel: "medium",
        catastrophic: false,
      },
    })
    expect(emitted[1]).toMatchObject({
      type: "observed-tool-decision",
      controlLevel: "observe",
      decision: "deny",
      risk: {
        toolName: "Bash",
        toolUseId: "observe-2",
        riskLevel: "catastrophic",
        catastrophic: true,
      },
    })
  })

  test("uses PreToolUse for observed decisions and reuses them in canUseTool", async () => {
    const emitted: any[] = []
    const controls = createClaudeAgentSdkPermissionControls(
      baseHandlerInput({
        emit: (chunk) => {
          emitted.push(chunk)
        },
      }),
    )

    const result = await controls.preToolUseHook(
      {
        hook_event_name: "PreToolUse",
        tool_name: "Write",
        tool_input: {
          file_path: join(cwd, ".env"),
          content: "LOCUS_SMOKE_SHOULD_NOT_EXIST=1",
        },
        tool_use_id: "observe-hook-1",
      } as any,
      "observe-hook-1",
      { signal: new AbortController().signal },
    )

    expect(result).toMatchObject({
      continue: true,
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: expect.stringContaining(
          "Observed mode blocked Write",
        ),
      },
    })
    expect(emitted).toHaveLength(1)
    expect(emitted[0]).toMatchObject({
      type: "observed-tool-decision",
      decision: "deny",
      risk: {
        toolName: "Write",
        toolUseId: "observe-hook-1",
        riskLevel: "catastrophic",
        catastrophic: true,
      },
    })

    const canUseToolResult = await controls.canUseTool(
      "Write",
      { file_path: join(cwd, ".env") },
      toolOptions("observe-hook-1"),
    )
    expect(canUseToolResult.behavior).toBe("deny")
    expect(emitted).toHaveLength(1)
  })

  test("uses PreToolUse for guarded scope decisions", async () => {
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
    const controls = createClaudeAgentSdkPermissionControls(
      baseHandlerInput({
        permissionPolicy: resolveDesktopPermissionPolicy({
          runtimeId: "claude-code",
          mode: "agent",
          hasScopeContract: true,
        }),
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

    const result = await controls.preToolUseHook(
      {
        hook_event_name: "PreToolUse",
        tool_name: "Edit",
        tool_input: { file_path: "tests/app.test.ts" },
        tool_use_id: "guard-hook-1",
      } as any,
      "guard-hook-1",
      { signal: new AbortController().signal },
    )

    expect(result).toMatchObject({
      continue: true,
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
      },
    })
    expect(guardEvents).toHaveLength(1)
    expect(guardEvents[0]).toMatchObject({
      type: "scope-expansion-request",
      toolName: "Edit",
      toolUseId: "guard-hook-1",
    })
    expect(emitted).toEqual([
      {
        type: "guard-event",
        event: guardEvents[0],
      },
    ])
  })
})
