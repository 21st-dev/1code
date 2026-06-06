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
