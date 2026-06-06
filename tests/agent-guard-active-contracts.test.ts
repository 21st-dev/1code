import { afterEach, describe, expect, mock, test } from "bun:test"
import { join } from "node:path"
import type { AgentScopeContract } from "../src/shared/agent-scope-contracts"

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
  applyActiveGuardedScopeExpansion,
  clearActiveGuardedContractsForTest,
  getActiveGuardedContract,
  prepareActiveGuardedRunContract,
  setActiveGuardedContract,
} = await import("../src/main/lib/agent-guard/active-contracts")
const { validateAgentScopeContract } = await import(
  "../src/main/lib/agent-guard/contract"
)

const cwd = join(process.cwd(), "example-project")

function baseContract(
  overrides: Partial<AgentScopeContract> = {},
): AgentScopeContract {
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
    ...overrides,
  }
}

async function activate(contract: AgentScopeContract = baseContract()) {
  const validated = await validateAgentScopeContract(contract, {
    cwd,
    projectPath: cwd,
    chatId: "chat-1",
    subChatId: "sub-1",
    runId: "run-1",
    requireRegisteredWorktree: false,
  })
  setActiveGuardedContract(validated)
  return validated
}

describe("active guarded contract owner", () => {
  afterEach(() => {
    clearActiveGuardedContractsForTest()
  })

  test("skips activation when no guarded scope contract is provided", async () => {
    await expect(
      prepareActiveGuardedRunContract({
        cwd,
        projectPath: cwd,
        chatId: "chat-1",
        subChatId: "sub-1",
        runId: "run-1",
        fallbackRunId: "fallback-run",
      }),
    ).resolves.toEqual({
      ok: true,
      contract: null,
      preRunStatus: null,
    })
  })

  test("validates, activates, and captures guarded pre-run status", async () => {
    const capturedCwds: string[] = []
    const result = await prepareActiveGuardedRunContract({
      scopeContract: baseContract({ runId: undefined }),
      cwd,
      projectPath: cwd,
      chatId: "chat-1",
      subChatId: "sub-1",
      fallbackRunId: "fallback-run",
      validateOptions: { requireRegisteredWorktree: false },
      captureStatus: async (captureCwd) => {
        capturedCwds.push(captureCwd)
        return {
          dirty: false,
          files: [],
          capturedAt: "2026-06-07T00:00:02.000Z",
          available: true,
        }
      },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.contract?.runId).toBe("fallback-run")
    expect(result.preRunStatus).toEqual({
      dirty: false,
      files: [],
      capturedAt: "2026-06-07T00:00:02.000Z",
      available: true,
    })
    expect(capturedCwds).toEqual([cwd])
    expect(getActiveGuardedContract("contract-1")).toBe(result.contract)
  })

  test("returns stable validation errors without activating the contract", async () => {
    const result = await prepareActiveGuardedRunContract({
      scopeContract: baseContract({ chatId: "other-chat" }),
      cwd,
      projectPath: cwd,
      chatId: "chat-1",
      subChatId: "sub-1",
      runId: "run-1",
      fallbackRunId: "fallback-run",
      validateOptions: { requireRegisteredWorktree: false },
      captureStatus: async () => {
        throw new Error("capture should not run")
      },
    })

    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining("chat"),
    })
    expect(getActiveGuardedContract("contract-1")).toBeUndefined()
  })

  test("returns a stable error when the guarded run is no longer active", async () => {
    await expect(
      applyActiveGuardedScopeExpansion({
        contractId: "missing",
        toolUseId: "tool-1",
        approved: true,
        path: "src/new.ts",
        validateOptions: { requireRegisteredWorktree: false },
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Guarded run is no longer active.",
    })
  })

  test("approves, de-duplicates, validates, and stores expanded scope", async () => {
    await activate()

    const result = await applyActiveGuardedScopeExpansion({
      contractId: "contract-1",
      toolUseId: "tool-1",
      approved: true,
      paths: ["src/new.ts", "src/new.ts"],
      path: "src/other.ts",
      reason: "Need to edit generated files.",
      validateOptions: { requireRegisteredWorktree: false },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.contract.status).toBe("expanded")
    expect(result.contract.editableScope.map((scope) => scope.path)).toEqual([
      "src/app.ts",
      "src/new.ts",
      "src/other.ts",
    ])
    expect(result.contract.expansions).toHaveLength(1)
    expect(result.contract.expansions[0]).toMatchObject({
      requestedByToolUseId: "tool-1",
      reason: "Need to edit generated files.",
      paths: [
        {
          path: "src/new.ts",
          kind: "file",
          source: "user",
          reason: "Need to edit generated files.",
        },
        {
          path: "src/other.ts",
          kind: "file",
          source: "user",
          reason: "Need to edit generated files.",
        },
      ],
    })
    expect(result.contract.expansions[0].approvedAt).toBeTruthy()
    expect(getActiveGuardedContract("contract-1")).toBe(result.contract)
  })

  test("records rejected expansion without changing editable scope", async () => {
    await activate()

    const result = await applyActiveGuardedScopeExpansion({
      contractId: "contract-1",
      toolUseId: "tool-1",
      approved: false,
      path: "src/new.ts",
      validateOptions: { requireRegisteredWorktree: false },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.contract.status).toBe("approved")
    expect(result.contract.editableScope.map((scope) => scope.path)).toEqual([
      "src/app.ts",
    ])
    expect(result.contract.expansions[0].rejectedAt).toBeTruthy()
  })
})
