import { describe, expect, test } from "bun:test"
import { prepareClaudeAgentSdkDesktopRunControls } from "../src/main/lib/claude/agent-sdk-desktop-run-controls"
import type { UIMessageChunk } from "../src/main/lib/claude/types"

function createBaseInput() {
  const db = { id: "db-1" } as any
  const emitted: UIMessageChunk[] = []
  const emittedErrors: any[] = []
  const completed: string[] = []

  return {
    db,
    emitted,
    emittedErrors,
    completed,
    input: {
      db,
      chatId: "chat-1",
      subChatId: "sub-1",
      cwd: "/repo",
      projectPath: "/repo",
      mode: "agent" as const,
      runId: "run-1",
      fallbackRunId: "stream-1",
      emitError: (error: unknown, context: string) => {
        emittedErrors.push({ error, context })
      },
      emit: (chunk: UIMessageChunk) => {
        emitted.push(chunk)
      },
      complete: () => {
        completed.push("complete")
      },
    },
  }
}

describe("Claude Agent SDK desktop run controls", () => {
  test("verifies preflight, activates guard contract, and resolves permission policy", async () => {
    const base = createBaseInput()
    const calls: any[] = []
    const preflight = {
      kind: "project",
      cwd: "/repo",
      chat: { id: "chat-1" },
      subChat: { id: "sub-1" },
      project: { id: "project-1" },
    } as any
    const guardedContract = { id: "contract-1" } as any
    const guardedPreRunStatus = { files: [] } as any
    const permissionPolicy = { runtimeId: "claude-code" } as any

    const result = await prepareClaudeAgentSdkDesktopRunControls({
      ...base.input,
      dependencies: {
        verifyPreflight: (db, input) => {
          calls.push({ type: "preflight", db, input })
          return preflight
        },
        prepareGuardedRunContract: async (input) => {
          calls.push({ type: "guard", input })
          return {
            ok: true,
            contract: guardedContract,
            preRunStatus: guardedPreRunStatus,
          }
        },
        resolvePermissionPolicy: (input) => {
          calls.push({ type: "permission", input })
          return permissionPolicy
        },
      },
    })

    expect(result).toEqual({
      ok: true,
      preflight,
      runtimeCwd: "/repo",
      guardedContract,
      guardedPreRunStatus,
      permissionPolicy,
    })
    expect(calls).toEqual([
      {
        type: "preflight",
        db: base.db,
        input: {
          chatId: "chat-1",
          subChatId: "sub-1",
          cwd: "/repo",
        },
      },
      {
        type: "guard",
        input: {
          scopeContract: undefined,
          cwd: "/repo",
          projectPath: "/repo",
          chatId: "chat-1",
          subChatId: "sub-1",
          runId: "run-1",
          fallbackRunId: "stream-1",
        },
      },
      {
        type: "permission",
        input: {
          runtimeId: "claude-code",
          mode: "agent",
          workspaceKind: "project",
          hasScopeContract: true,
        },
      },
    ])
    expect(base.emitted).toEqual([])
    expect(base.emittedErrors).toEqual([])
    expect(base.completed).toEqual([])
  })

  test("emits a terminal guarded-run rejection without resolving permissions", async () => {
    const base = createBaseInput()
    const permissionCalls: any[] = []

    const result = await prepareClaudeAgentSdkDesktopRunControls({
      ...base.input,
      dependencies: {
        verifyPreflight: () =>
          ({
            kind: "project",
            cwd: "/repo",
            chat: { id: "chat-1" },
            subChat: { id: "sub-1" },
            project: { id: "project-1" },
          }) as any,
        prepareGuardedRunContract: async () => ({
          ok: false,
          error: "scope mismatch",
        }),
        resolvePermissionPolicy: (input) => {
          permissionCalls.push(input)
          return {} as any
        },
      },
    })

    expect(result).toEqual({
      ok: false,
      reason: "guarded-contract-rejected",
      error: "scope mismatch",
    })
    expect(base.emittedErrors).toHaveLength(1)
    expect(base.emittedErrors[0].context).toBe("Guarded run contract rejected")
    expect(base.emittedErrors[0].error).toMatchObject({
      message: "scope mismatch",
    })
    expect(base.emitted).toEqual([{ type: "finish" }])
    expect(base.completed).toEqual(["complete"])
    expect(permissionCalls).toEqual([])
  })

  test("lets preflight failures bubble to desktop run supervision", async () => {
    const base = createBaseInput()
    const error = new Error("cwd mismatch")

    await expect(
      prepareClaudeAgentSdkDesktopRunControls({
        ...base.input,
        dependencies: {
          verifyPreflight: () => {
            throw error
          },
        },
      }),
    ).rejects.toBe(error)

    expect(base.emitted).toEqual([])
    expect(base.emittedErrors).toEqual([])
    expect(base.completed).toEqual([])
  })
})
