import { describe, expect, test } from "bun:test"
import {
  formatTracePayload,
  getWorkbenchTraceRow,
  WORKBENCH_TRACE_PRODUCT_ERROR_CODES,
  type WorkbenchTraceEvent,
} from "../src/renderer/features/agents/workbench/workbench-trace-presenter"
import { en, zhCN } from "../src/renderer/lib/i18n/dictionaries"

function event(
  type: string,
  payload: unknown,
  sequence = 1,
): WorkbenchTraceEvent {
  return {
    id: `event-${sequence}`,
    jobId: "job-1",
    sequence,
    type,
    payload,
    createdAt: "2026-06-16T00:00:00.000Z",
  }
}

describe("workbench trace presenter", () => {
  test("maps tool events into semantic tool rows", () => {
    expect(
      getWorkbenchTraceRow(event("tool_started", { toolName: "Bash" })),
    ).toMatchObject({
      kind: "tool",
      titleKey: "workbench.event.toolStarted",
      severity: "info",
      status: "started",
      summary: "Bash",
    })

    expect(
      getWorkbenchTraceRow(
        event("tool_finished", { toolName: "Edit", error: "denied" }),
      ),
    ).toMatchObject({
      kind: "tool",
      severity: "error",
      status: "failed",
      summary: "Edit",
    })
  })

  test("maps guard and observed permission decisions", () => {
    expect(
      getWorkbenchTraceRow(
        event("guard_decision", {
          decision: "deny",
          reason: "outside approved scope",
        }),
      ),
    ).toMatchObject({
      kind: "approval",
      titleKey: "workbench.event.guardDecision",
      severity: "warning",
      status: "deny",
      summary: "outside approved scope",
    })

    const row = getWorkbenchTraceRow(
      event("permission_requested", {
        controlLevel: "observe",
        decision: "deny",
        message: "Command denied by observed guard.",
        risk: {
          toolName: "Bash",
          riskLevel: "high",
          riskCategories: ["shell", "network"],
          reason: "Command touches network.",
        },
      }),
    )

    expect(row).toMatchObject({
      kind: "approval",
      severity: "warning",
      status: "deny",
      summary: "Bash",
    })
    expect(row.observedPermission).toEqual({
      controlLevel: "observe",
      decision: "deny",
      message: "Command denied by observed guard.",
      riskLevel: "high",
      toolName: "Bash",
      reason: "Command touches network.",
      categories: ["shell", "network"],
    })
  })

  test("maps MCP auth blockers", () => {
    expect(
      getWorkbenchTraceRow(
        event("mcp_needs_auth", {
          serverName: "github",
          message: "OAuth expired",
        }),
      ),
    ).toMatchObject({
      kind: "mcp",
      titleKey: "workbench.event.mcpNeedsAuth",
      severity: "warning",
      status: "needs-auth",
      summary: "github",
      nextActionKey: "workbench.error.mcp_auth_required.nextAction",
    })
  })

  test("unwraps redacted usage events and marks partial metadata unavailable", () => {
    const row = getWorkbenchTraceRow(
      event("usage_update", {
        runEventSequence: 4,
        redaction: { status: "clean" },
        payload: {
          messageMetadata: {
            provider: "codex",
            inputTokens: 10,
            outputTokens: 3,
            totalTokens: 13,
            totalCostUsd: 0.002,
            modelContextWindow: 200000,
          },
        },
      }),
    )

    expect(row).toMatchObject({
      kind: "usage",
      status: "observed",
      summaryKey: "workbench.trace.tokens",
      summaryValues: { total: "13" },
      hasRawPayload: true,
    })
    expect(row.usage).toMatchObject({
      inputTokens: 10,
      outputTokens: 3,
      totalTokens: 13,
      estimatedCostUsd: 0.002,
      modelContextWindow: 200000,
      missing: ["cache"],
    })
  })

  test("maps product error semantics", () => {
    const row = getWorkbenchTraceRow(
      event("error", {
        errorCode: "runtime_auth_required",
        errorMessage: "Token expired",
      }),
    )

    expect(row).toMatchObject({
      kind: "error",
      severity: "error",
      status: "runtime_auth_required",
      summaryKey: "workbench.error.runtime_auth_required.title",
      nextActionKey: "workbench.error.runtime_auth_required.nextAction",
    })
    expect(row.error).toMatchObject({
      code: "runtime_auth_required",
      titleKey: "workbench.error.runtime_auth_required.title",
      bodyKey: "workbench.error.runtime_auth_required.body",
      nextActionKey: "workbench.error.runtime_auth_required.nextAction",
      details: "Token expired",
    })
  })

  test("maps canceled and completed final rows", () => {
    expect(
      getWorkbenchTraceRow(
        event("completed", { status: "canceled", message: "Stopped" }),
      ),
    ).toMatchObject({
      kind: "final",
      titleKey: "workbench.event.canceled",
      severity: "warning",
      status: "canceled",
      summary: "Stopped",
    })

    expect(
      getWorkbenchTraceRow(event("completed", { status: "succeeded" })),
    ).toMatchObject({
      kind: "final",
      titleKey: "workbench.event.completed",
      severity: "success",
      status: "succeeded",
    })

    expect(getWorkbenchTraceRow(event("completed", {}))).toMatchObject({
      kind: "final",
      titleKey: "workbench.event.interrupted",
      severity: "error",
      status: "interrupted",
    })
  })

  test("keeps unknown events inspectable with secondary raw payload", () => {
    const row = getWorkbenchTraceRow(
      event("future_event", {
        runEventSequence: 8,
        redaction: { status: "redacted" },
        payload: { message: "redacted detail" },
      }),
    )

    expect(row).toMatchObject({
      kind: "unknown",
      titleKey: "workbench.event.unknown",
      summary: "redacted detail",
      hasRawPayload: true,
      semanticPayload: { message: "redacted detail" },
    })
    expect(formatTracePayload(row.rawPayload)).toContain("runEventSequence")
  })

  test("keeps product error copy in i18n dictionaries", () => {
    for (const code of WORKBENCH_TRACE_PRODUCT_ERROR_CODES) {
      for (const field of ["title", "body", "nextAction"] as const) {
        const key = `workbench.error.${code}.${field}` as keyof typeof en
        expect(en[key]).toBeTruthy()
        expect(zhCN[key]).toBeTruthy()
      }
    }
  })
})
