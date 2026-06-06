import { describe, expect, mock, test } from "bun:test"
import { join } from "node:path"
import type {
  AgentGuardEvent,
  AgentScopeContract,
  AgentScopePath,
  AgentSuccessCheck,
} from "../src/shared/agent-scope-contracts"

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

const { finalizeClaudeAgentSdkGuardMetadata } = await import(
  "../src/main/lib/claude/agent-sdk-guard-metadata"
)

type ClaudeAgentSdkGuardedContract = AgentScopeContract & {
  editableScope: AgentScopePath[]
  readOnlyEvidence: AgentScopePath[]
  successChecks: AgentSuccessCheck[]
  blockedPaths: AgentScopePath[]
}

type GuardedGitStatusSnapshot = {
  dirty: boolean
  files: string[]
  capturedAt: string
  available: boolean
  error?: string
}

function createContract(
  overrides: Partial<ClaudeAgentSdkGuardedContract> = {},
): ClaudeAgentSdkGuardedContract {
  return {
    id: "contract-1",
    version: 1,
    status: "approved",
    createdAt: "2026-06-01T00:00:00.000Z",
    approvedAt: "2026-06-01T00:01:00.000Z",
    source: "manual",
    chatId: "chat-1",
    subChatId: "sub-1",
    runId: "run-1",
    cwd: "/repo",
    editableScope: [{ path: "src", kind: "directory" }],
    readOnlyEvidence: [],
    successChecks: [{ command: "bun test" }],
    blockedPaths: [],
    expansions: [],
    ...overrides,
  }
}

function createStatus(files: string[]): GuardedGitStatusSnapshot {
  return {
    dirty: files.length > 0,
    files,
    capturedAt: "2026-06-01T00:02:00.000Z",
    available: true,
  }
}

describe("Claude Agent SDK guard metadata", () => {
  test("returns metadata unchanged when guarded context is absent", async () => {
    const metadata = { sessionId: "session-1" }
    const emitted: any[] = []

    await expect(
      finalizeClaudeAgentSdkGuardMetadata({
        currentMetadata: metadata,
        guardedContract: null,
        guardedPreRunStatus: createStatus([]),
        runtimeCwd: "/repo",
        guardEvents: [],
        startedAt: "2026-06-01T00:00:00.000Z",
        emit: (chunk) => emitted.push(chunk),
        captureGitStatus: async () => {
          throw new Error("capture should not run")
        },
      }),
    ).resolves.toBe(metadata)
    expect(emitted).toEqual([])
  })

  test("emits audit metadata from the latest active guarded contract", async () => {
    const contract = createContract()
    const expandedContract = createContract({
      expansions: [
        {
          id: "expansion-1",
          requestedAt: "2026-06-01T00:02:00.000Z",
          approvedAt: "2026-06-01T00:03:00.000Z",
          paths: [{ path: "src/new-file.ts", kind: "file" }],
          reason: "Need one extra file",
        },
      ],
    })
    const guardEvent: AgentGuardEvent = {
      id: "event-1",
      runId: "run-1",
      contractId: "contract-1",
      type: "blocked",
      toolName: "Write",
      path: "secrets.env",
      reason: "Blocked sensitive file",
      createdAt: "2026-06-01T00:04:00.000Z",
    }
    const emitted: any[] = []
    const deleted: string[] = []
    const captured: string[] = []

    const metadata = await finalizeClaudeAgentSdkGuardMetadata({
      currentMetadata: {
        sessionId: "session-1",
        guardedRun: {
          contractId: "contract-1",
          runtime: "claude",
        },
      },
      guardedContract: contract,
      guardedPreRunStatus: createStatus([]),
      runtimeCwd: "/repo",
      guardEvents: [guardEvent],
      startedAt: "2026-06-01T00:00:00.000Z",
      options: { failed: true },
      emit: (chunk) => emitted.push(chunk),
      captureGitStatus: async (cwd) => {
        captured.push(cwd)
        return createStatus(["src/new-file.ts"])
      },
      getContract: (contractId) =>
        contractId === "contract-1" ? expandedContract : null,
      deleteContract: (contractId) => {
        deleted.push(contractId)
      },
    })

    expect(captured).toEqual(["/repo"])
    expect(deleted).toEqual(["contract-1"])
    expect(emitted).toHaveLength(1)
    expect(emitted[0]).toMatchObject({
      type: "guard-audit",
      audit: {
        runId: "run-1",
        contractId: "contract-1",
        runtime: "claude",
        enforcementMode: "hard",
        status: "failed",
      },
    })
    expect(emitted[0].audit.blockedEvents).toEqual([guardEvent])
    expect(emitted[0].audit.expansionEvents).toEqual(
      expandedContract.expansions,
    )
    expect(metadata.guardedRun).toMatchObject({
      contractId: "contract-1",
      runtime: "claude",
      audit: emitted[0].audit,
    })
  })
})
