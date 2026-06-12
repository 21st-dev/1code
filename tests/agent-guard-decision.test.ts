import { describe, expect, test } from "bun:test"
import {
  decideClaudeToolUse,
  resolveGuardedScopedShellWriteApproval,
} from "../src/main/lib/agent-guard/decision"
import type { ValidatedAgentScopeContract } from "../src/main/lib/agent-guard/contract"

function guardedContract(): ValidatedAgentScopeContract {
  return {
    id: "contract-guard-decision",
    version: 1,
    status: "approved",
    createdAt: "2026-06-12T00:00:00.000Z",
    approvedAt: "2026-06-12T00:00:01.000Z",
    source: "manual",
    chatId: "chat-1",
    subChatId: "sub-1",
    runId: "run-guard-decision",
    cwd: "/repo",
    editableScope: [{ path: "src", kind: "directory" }],
    readOnlyEvidence: [],
    successChecks: [{ command: "bun test" }],
    blockedPaths: [],
    expansions: [],
  }
}

function resolve(command: string) {
  return resolveGuardedScopedShellWriteApproval({
    contract: guardedContract(),
    toolName: "Bash",
    toolInput: { command },
    toolUseId: "tool-shell-write",
  })
}

describe("guarded scoped shell write approval", () => {
  test("classifies bounded in-scope shell file writes for a second approval gate", () => {
    const decision = resolve(
      "/bin/zsh -lc \"mkdir -p /repo/src && printf 'hello' > /repo/src/generated.txt\"",
    )

    expect(decision).toMatchObject({
      decision: "allow",
      requiresUserApproval: true,
      reason:
        "Scoped shell file operation targets approved editable scope and requires user approval.",
      event: {
        type: "allowed",
        toolName: "Bash",
        toolUseId: "tool-shell-write",
        command:
          "/bin/zsh -lc \"mkdir -p /repo/src && printf 'hello' > /repo/src/generated.txt\"",
        paths: ["src", "src/generated.txt"],
      },
    })
  })

  test("rejects shell-expanded path forms before user approval", () => {
    expect(resolve("/bin/zsh -lc \"echo 'x' > \\\"$HOME/.ssh/authorized_keys\\\"\""))
      .toBeNull()
    expect(resolve("/bin/zsh -lc \"echo 'x' > ~/.ssh/authorized_keys\""))
      .toBeNull()
    expect(resolve("/bin/zsh -lc \"echo 'x' > /repo/src/*.txt\""))
      .toBeNull()
    expect(resolve("/bin/zsh -lc \"echo 'x' > /repo/src/{a,b}.txt\""))
      .toBeNull()
  })

  test("rejects command substitution and unbounded shell control", () => {
    expect(resolve("/bin/zsh -lc \"echo $(whoami) > /repo/src/generated.txt\""))
      .toBeNull()
    expect(resolve("/bin/zsh -lc \"echo 'x' > /repo/src/generated.txt; whoami\""))
      .toBeNull()
    expect(resolve("/bin/zsh -lc \"echo 'x' > /repo/src/generated.txt | cat\""))
      .toBeNull()
  })

  test("does not change the canonical guarded shell decision path", () => {
    const decision = decideClaudeToolUse({
      contract: guardedContract(),
      toolName: "Bash",
      toolInput: {
        command:
          "/bin/zsh -lc \"mkdir -p /repo/src && printf 'hello' > /repo/src/generated.txt\"",
      },
      toolUseId: "tool-shell-write",
    })

    expect(decision).toMatchObject({
      decision: "deny",
      event: {
        type: "blocked",
        toolName: "Bash",
      },
    })
  })
})
