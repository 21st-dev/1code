import { afterEach, describe, expect, test } from "bun:test"
import {
  clearClaudePendingToolApprovals,
  clearClaudePendingToolApprovalsForTest,
  getClaudePendingToolApprovalStore,
  resolveClaudePendingToolApproval,
} from "../src/main/lib/claude/tool-approvals"

describe("Claude tool approval owner", () => {
  afterEach(() => {
    clearClaudePendingToolApprovalsForTest()
  })

  test("resolves and removes a pending approval", () => {
    const decisions: unknown[] = []
    getClaudePendingToolApprovalStore().set("tool-1", {
      subChatId: "sub-1",
      resolve: (decision) => decisions.push(decision),
    })

    expect(
      resolveClaudePendingToolApproval({
        toolUseId: "tool-1",
        decision: {
          approved: true,
          updatedInput: { answer: "yes" },
        },
      }),
    ).toBe(true)

    expect(decisions).toEqual([
      {
        approved: true,
        updatedInput: { answer: "yes" },
      },
    ])
    expect(getClaudePendingToolApprovalStore().has("tool-1")).toBe(false)
  })

  test("clears only approvals for the requested sub-chat", () => {
    const decisions: Record<string, unknown[]> = {
      first: [],
      second: [],
    }
    getClaudePendingToolApprovalStore().set("tool-1", {
      subChatId: "sub-1",
      resolve: (decision) => decisions.first.push(decision),
    })
    getClaudePendingToolApprovalStore().set("tool-2", {
      subChatId: "sub-2",
      resolve: (decision) => decisions.second.push(decision),
    })

    clearClaudePendingToolApprovals("Session ended.", "sub-1")

    expect(decisions.first).toEqual([
      {
        approved: false,
        message: "Session ended.",
      },
    ])
    expect(decisions.second).toEqual([])
    expect(getClaudePendingToolApprovalStore().has("tool-1")).toBe(false)
    expect(getClaudePendingToolApprovalStore().has("tool-2")).toBe(true)
  })

  test("returns false when no pending approval exists", () => {
    expect(
      resolveClaudePendingToolApproval({
        toolUseId: "missing",
        decision: { approved: false },
      }),
    ).toBe(false)
  })
})
