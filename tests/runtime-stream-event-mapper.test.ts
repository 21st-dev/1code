import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import {
  appendRunEventsToAgentJob,
  createDesktopStreamEventMapper,
  mapDesktopStreamChunkToRunEvents,
  redactRendererDiagnosticChunk,
} from "../src/main/lib/agent-runtime/stream-event-mapper"
import {
  createAgentJob,
  listAgentJobEvents,
  startAgentJob,
} from "../src/main/lib/headless/job-store"
import { createAgentJobTestDb } from "./helpers/agent-job-test-db"

describe("desktop stream event mapper", () => {
  test("maps Claude and Codex text chunks into the same semantic event", () => {
    for (const runtimeId of ["claude-code", "codex"] as const) {
      const events = mapDesktopStreamChunkToRunEvents({
        runtimeId,
        runId: "run-1",
        jobId: "job-1",
        sequence: 1,
        chunk: { type: "text-delta", id: "text-1", delta: "hello" },
        createdAt: "2026-06-07T00:00:00.000Z",
      })

      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        runtimeId,
        runId: "run-1",
        jobId: "job-1",
        sequence: 1,
        type: "assistant_delta",
        payload: { id: "text-1", delta: "hello" },
      })
    }
  })

  test("maps runtime blockers, questions, guard decisions, and finish chunks", () => {
    const mapper = createDesktopStreamEventMapper({
      runtimeId: "codex",
      runId: "run-2",
      jobId: "job-2",
    })

    const events = [
      ...mapper.map({
        type: "runtime-status",
        ok: false,
        blocker: {
          component: "mcp",
          status: "needs-auth",
          message: "MCP auth required",
        },
      }),
      ...mapper.map({
        type: "ask-user-question",
        toolUseId: "tool-1",
        questions: [{ question: "Continue?", header: "Confirm" }],
      }),
      ...mapper.map({
        type: "guard-event",
        event: { decision: "deny", reason: "outside scope" },
      }),
      ...mapper.map({
        type: "finish",
        messageMetadata: { inputTokens: 10, outputTokens: 3 },
      }),
    ]

    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3, 4])
    expect(events.map((event) => event.type)).toEqual([
      "mcp_needs_auth",
      "question_pending",
      "guard_decision",
      "completed",
    ])
    expect(events[3].payload).toMatchObject({
      status: "succeeded",
      messageMetadata: { inputTokens: 10, outputTokens: 3 },
    })
  })

  test("redacts secret-looking stream payloads before persistence", () => {
    const events = mapDesktopStreamChunkToRunEvents({
      runtimeId: "claude-code",
      runId: "run-3",
      jobId: "job-3",
      sequence: 1,
      chunk: {
        type: "tool-output-available",
        toolCallId: "tool-1",
        output: {
          authorization: "Bearer secret-token",
          message: "api_key=sk-supersecretvalue123456",
        },
      },
    })

    expect(events[0].redaction).toEqual({
      status: "redacted",
      appliedRules: ["secret-key", "secret-text"],
    })
    expect(events[0].payload).toMatchObject({
      output: {
        authorization: "<redacted>",
        message: "api_key=<redacted>",
      },
    })
  })

  test("redacts renderer diagnostics without changing normal stream content", () => {
    const diagnostic = redactRendererDiagnosticChunk({
      runtimeId: "codex",
      runId: "run-renderer-redaction",
      chunk: {
        type: "runtime-status",
        ok: false,
        blocker: {
          component: "provider-profile",
          message: "failed with api_key=sk-supersecretvalue123456",
          authorization: "Bearer secret-token",
        },
      },
    })

    expect(diagnostic).toMatchObject({
      type: "runtime-status",
      blocker: {
        message: "failed with api_key=<redacted>",
        authorization: "<redacted>",
      },
    })

    const textChunk = { type: "text-delta", id: "text-1", delta: "api_key=visible" }
    expect(
      redactRendererDiagnosticChunk({
        runtimeId: "codex",
        runId: "run-renderer-redaction",
        chunk: textChunk,
      }),
    ).toBe(textChunk)
  })

  test("Claude and Codex routes redact renderer diagnostics through the mapper", () => {
    for (const [runtimeName, routePath] of [
      ["Claude", "src/main/lib/trpc/routers/claude.ts"],
      ["Codex", "src/main/lib/trpc/routers/codex.ts"],
    ] as const) {
      const source = readFileSync(routePath, "utf8")
      const safeEmitIndex = source.indexOf("const safeEmit")
      const redactIndex = source.indexOf("redactRendererDiagnosticChunk", safeEmitIndex)
      const emitIndex = source.indexOf("emit.next(rendererChunk", safeEmitIndex)

      expect(redactIndex, `${runtimeName} renderer redaction`).toBeGreaterThan(safeEmitIndex)
      expect(emitIndex, `${runtimeName} renderer emission`).toBeGreaterThan(redactIndex)
    }
  })

  test("appends mapped run events through the existing job store", () => {
    const db = createAgentJobTestDb()
    const job = createAgentJob(db, {
      source: "desktop",
      runtime: "codex",
      mode: "agent",
      cwd: "/tmp/project",
      prompt: "Run",
    })
    startAgentJob(db, { jobId: job.id, workerId: "worker-1" })

    const events = mapDesktopStreamChunkToRunEvents({
      runtimeId: "codex",
      runId: "run-4",
      jobId: job.id,
      sequence: 1,
      chunk: { type: "text-delta", id: "text-1", delta: "done" },
      createdAt: "2026-06-07T00:00:00.000Z",
    })
    appendRunEventsToAgentJob(db, events)

    const persisted = listAgentJobEvents(db, job.id)
    expect(persisted.map((event) => event.type)).toEqual([
      "job_created",
      "job_started",
      "assistant_delta",
    ])
    expect(JSON.parse(persisted[2].payloadJson)).toMatchObject({
      runId: "run-4",
      runtimeId: "codex",
      runEventSequence: 1,
      payload: { id: "text-1", delta: "done" },
    })
  })

  test("Claude and Codex routes persist non-terminal stream chunks through the mapper", () => {
    for (const [runtimeName, routePath, runtimeId] of [
      ["Claude", "src/main/lib/trpc/routers/claude.ts", "claude-code"],
      ["Codex", "src/main/lib/trpc/routers/codex.ts", "codex"],
    ] as const) {
      const source = readFileSync(routePath, "utf8")
      const safeEmitIndex = source.indexOf("const safeEmit")
      const jobIndex = source.indexOf("createAndStartDesktopAgentJob(db, {")
      const mapperCreateIndex = source.indexOf(
        "desktopStreamEventMapper = createDesktopStreamEventMapper",
        jobIndex,
      )
      const appendIndex = source.indexOf("appendRunEventsToAgentJob", safeEmitIndex)

      expect(safeEmitIndex, `${runtimeName} safeEmit`).toBeGreaterThan(0)
      expect(jobIndex, `${runtimeName} desktop job`).toBeGreaterThan(safeEmitIndex)
      expect(mapperCreateIndex, `${runtimeName} mapper creation`).toBeGreaterThan(jobIndex)
      expect(appendIndex, `${runtimeName} mapper append`).toBeGreaterThan(safeEmitIndex)
      expect(source).toContain(`runtimeId: "${runtimeId}"`)
      expect(source).toContain('type !== "finish"')
    }
  })
})
