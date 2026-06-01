import { describe, expect, test } from "bun:test"
import {
  classifyAgentWorkbenchStatus,
  matchesAgentWorkbenchFilter,
  summarizeLatestSubChat,
} from "../src/main/lib/agent-workbench/status"

const cleanInput = {
  archived: false,
  worktreePath: "/tmp/project",
  hasActiveStream: false,
  hasPendingUserQuestion: false,
  hasPendingPlanApproval: false,
  runtimeError: null,
  guardedRunStatus: null,
  diff: { fileCount: 0, additions: 0, deletions: 0 },
  prUrl: null,
  prNumber: null,
}

describe("agent workbench status", () => {
  test("classifies actionable states in priority order", () => {
    expect(
      classifyAgentWorkbenchStatus({
        ...cleanInput,
        hasActiveStream: true,
      }),
    ).toEqual({ status: "running", reason: "Agent is running" })

    expect(
      classifyAgentWorkbenchStatus({
        ...cleanInput,
        hasActiveStream: true,
        hasPendingUserQuestion: true,
      }).status,
    ).toBe("blocked")

    expect(
      classifyAgentWorkbenchStatus({
        ...cleanInput,
        diff: { fileCount: 2, additions: 10, deletions: 1 },
      }).status,
    ).toBe("needs-review")

    expect(
      classifyAgentWorkbenchStatus({
        ...cleanInput,
        prUrl: "https://github.com/example/project/pull/5",
        prNumber: 5,
      }).status,
    ).toBe("has-pr")

    expect(classifyAgentWorkbenchStatus(cleanInput).status).toBe("clean")
  })

  test("summarizes pending plan and user-question markers from stored messages", () => {
    const summary = summarizeLatestSubChat({
      id: "sub-1",
      name: "Plan",
      mode: "plan",
      sessionId: "session-1",
      streamId: "stream-1",
      updatedAt: new Date("2026-05-29T00:00:00.000Z"),
      messages: JSON.stringify([
        {
          role: "assistant",
          parts: [
            {
              type: "tool-ExitPlanMode",
              output: { approved: false },
            },
            {
              type: "tool-AskUserQuestion",
              state: "input-available",
              input: {
                questions: [{ question: "Proceed?", options: [] }],
              },
            },
          ],
        },
      ]),
    })

    expect(summary.mode).toBe("plan")
    expect(summary.pendingPlanApproval).toBe(true)
    expect(summary.pendingUserQuestion).toBe(true)
    expect(summary.lastMessageRole).toBe("assistant")
  })

  test("maps guarded-run audits into workbench status", () => {
    const summary = summarizeLatestSubChat({
      id: "sub-guard",
      name: "Guarded",
      mode: "agent",
      sessionId: "session-1",
      streamId: null,
      updatedAt: new Date("2026-05-29T00:00:00.000Z"),
      messages: JSON.stringify([
        {
          role: "assistant",
          metadata: {
            guardedRun: {
              audit: { status: "drifted" },
            },
          },
        },
      ]),
    })

    expect(summary.guardedRunStatus).toBe("drifted")
    expect(
      classifyAgentWorkbenchStatus({
        ...cleanInput,
        guardedRunStatus: "drifted",
      }),
    ).toEqual({
      status: "needs-review",
      reason: "Guarded run needs review",
    })
    expect(
      classifyAgentWorkbenchStatus({
        ...cleanInput,
        guardedRunStatus: "blocked",
      }).status,
    ).toBe("blocked")
  })

  test("matches workbench filters", () => {
    expect(matchesAgentWorkbenchFilter("needs-review", "all")).toBe(true)
    expect(matchesAgentWorkbenchFilter("needs-review", "needs-review")).toBe(true)
    expect(matchesAgentWorkbenchFilter("has-pr", "prs")).toBe(true)
    expect(matchesAgentWorkbenchFilter("clean", "prs")).toBe(false)
  })
})
