import { describe, expect, test } from "bun:test"
import {
  getWorkbenchTraceRow,
  type WorkbenchTraceEvent,
} from "../src/renderer/features/agents/workbench/workbench-trace-presenter"
import {
  type CurrentChatAgentJob,
  getCompactTraceRows,
  getLatestTraceError,
  selectCurrentChatJob,
} from "../src/renderer/features/details-sidebar/sections/run-trace-model"

function job(input: Partial<CurrentChatAgentJob>): CurrentChatAgentJob {
  return {
    id: input.id ?? "job-1",
    source: "desktop",
    runtime: "codex",
    status: input.status ?? "succeeded",
    chatId: input.chatId ?? "chat-1",
    subChatId: input.subChatId ?? null,
    createdAt: input.createdAt ?? "2026-06-16T00:00:00.000Z",
    startedAt: input.startedAt ?? null,
    finishedAt: input.finishedAt ?? null,
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage ?? null,
  }
}

function row(type: string, payload: unknown, sequence: number) {
  const event: WorkbenchTraceEvent = {
    id: `event-${sequence}`,
    jobId: "job-1",
    sequence,
    type,
    payload,
    createdAt: "2026-06-16T00:00:00.000Z",
  }
  return getWorkbenchTraceRow(event)
}

describe("details sidebar run trace data", () => {
  test("selects the latest job for the active chat and prefers active sub-chat", () => {
    const jobs = [
      job({
        id: "older-chat-job",
        chatId: "chat-1",
        createdAt: "2026-06-16T00:00:00.000Z",
      }),
      job({
        id: "newer-other-subchat",
        chatId: "chat-1",
        subChatId: "sub-2",
        createdAt: "2026-06-16T02:00:00.000Z",
      }),
      job({
        id: "active-subchat-job",
        chatId: "chat-1",
        subChatId: "sub-1",
        createdAt: "2026-06-16T01:00:00.000Z",
      }),
      job({
        id: "other-chat-job",
        chatId: "chat-2",
        createdAt: "2026-06-16T03:00:00.000Z",
      }),
    ]

    expect(selectCurrentChatJob(jobs, "chat-1", "sub-1")?.id).toBe(
      "active-subchat-job",
    )
    expect(selectCurrentChatJob(jobs, "chat-1", null)?.id).toBe(
      "newer-other-subchat",
    )
    expect(selectCurrentChatJob(jobs, "missing", null)).toBeNull()
  })

  test("keeps compact trace rows semantic instead of duplicating raw log noise", () => {
    const compactRows = getCompactTraceRows([
      row("assistant_delta", "hello", 1),
      row("tool_started", { toolName: "Bash" }, 2),
      row("tool_delta", { toolName: "Bash", input: "ls" }, 3),
      row("usage_update", { messageMetadata: { totalTokens: 12 } }, 4),
      row("completed", { status: "succeeded" }, 5),
    ])

    expect(compactRows.map((item) => item.type)).toEqual([
      "tool_started",
      "usage_update",
      "completed",
    ])
  })

  test("prefers event errors and falls back to selected job error fields", () => {
    const eventError = getLatestTraceError(
      [
        row(
          "error",
          {
            errorCode: "provider_auth_rejected",
            errorMessage: "401",
          },
          1,
        ),
      ],
      job({ errorCode: "runtime_process_failed" }),
    )

    expect(eventError).toMatchObject({
      source: "event",
      code: "provider_auth_rejected",
      titleKey: "workbench.error.provider_auth_rejected.title",
    })

    expect(
      getLatestTraceError(
        [],
        job({
          errorCode: "job_canceled",
          errorMessage: "Job was canceled after token=[redacted].",
        }),
      ),
    ).toMatchObject({
      source: "job",
      code: "job_canceled",
      titleKey: "workbench.error.job_canceled.title",
      details: "Job was canceled after token=[redacted].",
    })
  })

  test("suppresses stale event errors after a successful final row", () => {
    const eventError = getLatestTraceError(
      [
        row("error", { errorCode: "provider_request_failed" }, 1),
        row("completed", { status: "succeeded" }, 2),
      ],
      job({ errorCode: "runtime_process_failed" }),
    )

    expect(eventError).toBeNull()
  })
})
