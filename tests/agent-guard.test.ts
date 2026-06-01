import { describe, expect, mock, test } from "bun:test"
import { join } from "node:path"
import type { AgentScopeContract } from "../src/shared/agent-scope-contracts"
import type {
  GuardedGitStatusSnapshot,
  ValidatedAgentScopeContract,
} from "../src/main/lib/agent-guard"

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

const guard = await import("../src/main/lib/agent-guard")

const cwd = join(process.cwd(), "example-project")

function baseContract(
  overrides: Partial<AgentScopeContract> = {},
): AgentScopeContract {
  return {
    id: "contract-1",
    version: 1,
    status: "approved",
    createdAt: "2026-05-29T00:00:00.000Z",
    approvedAt: "2026-05-29T00:00:01.000Z",
    source: "manual",
    chatId: "chat-1",
    subChatId: "sub-1",
    runId: "run-1",
    cwd,
    projectPath: cwd,
    editableScope: [{ path: "src/app.ts", kind: "file" }],
    readOnlyEvidence: [{ path: "tests/app.test.ts", kind: "file" }],
    successChecks: [{ command: "bun test tests/app.test.ts" }],
    blockedPaths: [{ path: "src/secrets.ts", kind: "file" }],
    expansions: [],
    ...overrides,
  }
}

async function validate(
  contract: AgentScopeContract,
): Promise<ValidatedAgentScopeContract> {
  return guard.validateAgentScopeContract(contract, {
    cwd,
    projectPath: cwd,
    chatId: "chat-1",
    subChatId: "sub-1",
    runId: "run-1",
    requireRegisteredWorktree: false,
    isSymlinkEscaping: async (_cwd, relativePath) => relativePath === "escape-link",
  })
}

function snapshot(files: string[]): GuardedGitStatusSnapshot {
  return {
    dirty: files.length > 0,
    files,
    capturedAt: "2026-05-29T00:00:00.000Z",
    available: true,
  }
}

async function expectValidationCode(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await promise
    throw new Error("Expected validation to fail")
  } catch (error) {
    expect(error).toBeInstanceOf(guard.AgentScopeContractValidationError)
    expect((error as InstanceType<typeof guard.AgentScopeContractValidationError>).issues).toContainEqual(
      expect.objectContaining({ code }),
    )
  }
}

describe("agent guard contract validation", () => {
  test("accepts a valid contract and normalizes paths", async () => {
    const contract = await validate(
      baseContract({
        editableScope: [
          { path: "src/../src/app.ts", kind: "file" },
          { path: "src/components", kind: "directory" },
          { path: "tests/**/*.test.ts", kind: "glob" },
        ],
      }),
    )

    expect(contract.editableScope.map((item) => item.path)).toEqual([
      "src/app.ts",
      "src/components",
      "tests/**/*.test.ts",
    ])
  })

  test("rejects empty editable scope", async () => {
    await expectValidationCode(
      validate(baseContract({ editableScope: [] })),
      "EMPTY_EDITABLE_SCOPE",
    )
  })

  test("rejects absolute paths, parent traversal, and null bytes", async () => {
    await expect(
      validate(baseContract({ editableScope: [{ path: "/tmp/file", kind: "file" }] })),
    ).rejects.toBeInstanceOf(guard.AgentScopeContractValidationError)

    await expect(
      validate(baseContract({ editableScope: [{ path: "../outside", kind: "file" }] })),
    ).rejects.toBeInstanceOf(guard.AgentScopeContractValidationError)

    await expect(
      validate(baseContract({ editableScope: [{ path: "src/a\0b.ts", kind: "file" }] })),
    ).rejects.toBeInstanceOf(guard.AgentScopeContractValidationError)
  })

  test("rejects sensitive and symlink-escaping paths", async () => {
    await expectValidationCode(
      validate(baseContract({ editableScope: [{ path: ".env", kind: "file" }] })),
      "SENSITIVE_PATH",
    )

    await expectValidationCode(
      validate(baseContract({ editableScope: [{ path: "escape-link", kind: "file" }] })),
      "SYMLINK_ESCAPE",
    )
  })

  test("rejects blocked sensitive success checks", async () => {
    await expectValidationCode(
      validate(
        baseContract({
          successChecks: [{ command: "cat .env" }],
        }),
      ),
      "INVALID_SUCCESS_CHECK",
    )
  })

  test("normalizes relative path defensively", () => {
    expect(guard.normalizeContractRelativePath("src/../src/file.ts")).toBe("src/file.ts")
    expect(() => guard.normalizeContractRelativePath("")).toThrow()
    expect(() => guard.normalizeContractRelativePath("../x")).toThrow()
  })
})

describe("Claude guarded tool decisions", () => {
  test("allows in-scope write-like tools", async () => {
    const contract = await validate(baseContract())
    const decision = guard.decideClaudeToolUse({
      contract,
      toolName: "Edit",
      toolInput: { file_path: "src/app.ts" },
      toolUseId: "tool-1",
    })

    expect(decision.decision).toBe("allow")
    expect(decision.event.type).toBe("allowed")
  })

  test("requests expansion for out-of-scope write-like tools", async () => {
    const contract = await validate(baseContract())
    const decision = guard.decideClaudeToolUse({
      contract,
      toolName: "Write",
      toolInput: { file_path: "src/other.ts" },
      toolUseId: "tool-2",
    })

    expect(decision.decision).toBe("request-expansion")
    expect(decision.event.type).toBe("scope-expansion-request")
    expect(decision.event.path).toBe("src/other.ts")
  })

  test("denies blocked paths and unknown tools", async () => {
    const contract = await validate(baseContract())
    expect(
      guard.decideClaudeToolUse({
        contract,
        toolName: "Edit",
        toolInput: { file_path: "src/secrets.ts" },
        toolUseId: "tool-3",
      }).decision,
    ).toBe("deny")

    expect(
      guard.decideClaudeToolUse({
        contract,
        toolName: "UnknownWrite",
        toolInput: {},
        toolUseId: "tool-4",
      }).decision,
    ).toBe("deny")
  })

  test("allows approved checks and denies risky shell commands", async () => {
    const contract = await validate(baseContract())

    expect(
      guard.decideClaudeToolUse({
        contract,
        toolName: "Bash",
        toolInput: { command: "bun test tests/app.test.ts" },
        toolUseId: "tool-5",
      }).decision,
    ).toBe("allow")

    expect(
      guard.decideClaudeToolUse({
        contract,
        toolName: "Bash",
        toolInput: { command: "git reset --hard HEAD" },
        toolUseId: "tool-6",
      }).decision,
    ).toBe("deny")
  })
})

describe("guarded run audit", () => {
  test("classifies pre-existing, in-scope, and drifted changed files", async () => {
    const contract = await validate(baseContract())
    const audit = guard.buildGuardedRunAudit({
      contract,
      runtime: "codex",
      enforcementMode: "contract-and-audit",
      preRunStatus: snapshot(["README.md"]),
      postRunStatus: snapshot(["README.md", "src/app.ts", "src/outside.ts"]),
      startedAt: "2026-05-29T00:00:00.000Z",
    })

    expect(audit.status).toBe("drifted")
    expect(audit.changedFiles).toEqual([
      { path: "README.md", scope: "pre-existing" },
      { path: "src/app.ts", scope: "in-scope" },
      { path: "src/outside.ts", scope: "out-of-scope" },
    ])
    expect(audit.enforcementMode).toBe("contract-and-audit")
  })

  test("builds deterministic guarded-run prompt block", async () => {
    const contract = await validate(baseContract())
    const block = guard.buildGuardedRunPromptBlock(contract)

    expect(block).toContain('<locus_guarded_run id="contract-1" version="1">')
    expect(block).toContain("editable_scope:\n- src/app.ts")
    expect(block).toContain("success_checks:\n- bun test tests/app.test.ts")
  })
})

describe("guarded run checkpoints", () => {
  test("uses existing Claude rollback checkpoints only when the baseline is clean", () => {
    expect(
      guard.getGuardedRunCheckpointAvailability({
        runtime: "claude",
        sdkMessageUuid: "sdk-message-1",
        dirtyBeforeRun: false,
      }),
    ).toEqual({
      available: true,
      mechanism: "existing-rollback-checkpoint",
      reason: null,
    })

    expect(
      guard.getGuardedRunCheckpointAvailability({
        runtime: "claude",
        sdkMessageUuid: "sdk-message-1",
        dirtyBeforeRun: true,
      }).available,
    ).toBe(false)

    expect(
      guard.getGuardedRunCheckpointAvailability({
        runtime: "codex",
        sdkMessageUuid: "sdk-message-1",
      }).reason,
    ).toContain("rollback and fork")
  })
})
