import { describe, expect, test } from "bun:test"
import {
  appendAgentJobEvent,
  completeAgentJob,
  createAgentJob,
  getAgentJob,
  getAgentJobPrompt,
  heartbeatAgentJob,
  interruptStaleAgentJobs,
  listAgentJobEvents,
  requestCancelAgentJob,
  retryAgentJob,
  startAgentJob,
} from "../src/main/lib/headless/job-store"
import { createAgentJobTestDb } from "./helpers/agent-job-test-db"

describe("agent job store", () => {
  test("creates, starts, appends events, and completes a job", () => {
    const db = createAgentJobTestDb()
    const job = createAgentJob(db, {
      source: "cli",
      runtime: "claude-code",
      mode: "agent",
      cwd: "/tmp/project",
      prompt: "Fix the failing test",
      createdByVersion: "0.0.test",
    })

    expect(job.status).toBe("queued")
    expect(job.promptPreview).toBe("Fix the failing test")
    expect(getAgentJobPrompt(db, job.id)).toBe("Fix the failing test")

    const running = startAgentJob(db, {
      jobId: job.id,
      workerId: "worker-1",
      workerPid: 1234,
      now: new Date("2026-06-03T01:00:00.000Z"),
    })
    expect(running.status).toBe("running")
    expect(running.workerId).toBe("worker-1")

    appendAgentJobEvent(db, {
      jobId: job.id,
      type: "assistant_delta",
      payload: { text: "Working" },
    })
    const events = listAgentJobEvents(db, job.id)
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3])
    expect(events.map((event) => event.type)).toEqual([
      "job_created",
      "job_started",
      "assistant_delta",
    ])

    const done = completeAgentJob(db, {
      jobId: job.id,
      status: "succeeded",
      exitCode: 0,
      result: { finalMessage: "Done" },
    })
    expect(done.status).toBe("succeeded")
    expect(done.exitCode).toBe(0)
    expect(JSON.parse(done.resultJson || "{}")).toEqual({
      finalMessage: "Done",
    })
    expect(() =>
      appendAgentJobEvent(db, {
        jobId: job.id,
        type: "assistant_delta",
        payload: { text: "late" },
      }),
    ).toThrow("already terminal")
  })

  test("records cancel request before terminal cancellation", () => {
    const db = createAgentJobTestDb()
    const job = createAgentJob(db, {
      source: "cli",
      runtime: "codex",
      mode: "plan",
      cwd: "/tmp/project",
      prompt: "Inspect only",
    })
    startAgentJob(db, { jobId: job.id, workerId: "worker-1" })

    const cancelRequested = requestCancelAgentJob(
      db,
      job.id,
      "desktop",
      new Date("2026-06-03T01:01:00.000Z"),
    )
    expect(cancelRequested.status).toBe("running")
    expect(cancelRequested.cancelRequestedBy).toBe("desktop")

    const canceled = completeAgentJob(db, {
      jobId: job.id,
      status: "canceled",
      exitCode: 5,
    })
    expect(canceled.status).toBe("canceled")
  })

  test("heartbeats running jobs and interrupts stale workers", () => {
    const db = createAgentJobTestDb()
    const job = createAgentJob(db, {
      source: "cli",
      runtime: "claude-code",
      mode: "agent",
      cwd: "/tmp/project",
      prompt: "Run",
    })
    startAgentJob(db, {
      jobId: job.id,
      workerId: "worker-1",
      now: new Date("2026-06-03T01:00:00.000Z"),
    })
    heartbeatAgentJob(
      db,
      job.id,
      "worker-1",
      new Date("2026-06-03T01:01:00.000Z"),
    )

    expect(
      interruptStaleAgentJobs(
        db,
        new Date("2026-06-03T01:00:30.000Z"),
      ),
    ).toHaveLength(0)

    const interrupted = interruptStaleAgentJobs(
      db,
      new Date("2026-06-03T01:02:00.000Z"),
      new Date("2026-06-03T01:03:00.000Z"),
    )
    expect(interrupted).toHaveLength(1)
    expect(getAgentJob(db, job.id)?.status).toBe("interrupted")
    expect(getAgentJob(db, job.id)?.errorCode).toBe("worker_interrupted")
  })

  test("creates retry jobs only from retryable terminal states", () => {
    const db = createAgentJobTestDb()
    const job = createAgentJob(db, {
      source: "cli",
      runtime: "codex",
      mode: "agent",
      cwd: "/tmp/project",
      prompt: "Try",
    })

    expect(() => retryAgentJob(db, job.id)).toThrow("cannot be retried")
    startAgentJob(db, { jobId: job.id, workerId: "worker-1" })
    completeAgentJob(db, {
      jobId: job.id,
      status: "failed",
      exitCode: 1,
      errorCode: "runtime_failed",
      errorMessage: "Runtime failed",
    })

    const retry = retryAgentJob(db, job.id)
    expect(retry.status).toBe("queued")
    expect(retry.retryOfJobId).toBe(job.id)
    expect(retry.attempt).toBe(2)
    expect(retry.runtime).toBe("codex")
  })

  test("redacts secret-like text from durable job metadata and events", () => {
    const db = createAgentJobTestDb()
    const secret = "sk-abcdefghijklmnopqrstuvwxyz123456"
    const job = createAgentJob(db, {
      source: "cli",
      runtime: "claude-code",
      mode: "agent",
      cwd: "/tmp/project",
      prompt: `Use token ${secret}`,
    })
    expect(job.promptPreview).not.toContain(secret)
    expect(getAgentJobPrompt(db, job.id)).not.toContain(secret)

    startAgentJob(db, { jobId: job.id, workerId: "worker-1" })
    appendAgentJobEvent(db, {
      jobId: job.id,
      type: "error",
      payload: {
        errorText: `Authorization: Bearer abc.def.ghi ${secret}`,
        nested: { access_token: "abc.def.ghi" },
      },
    })
    completeAgentJob(db, {
      jobId: job.id,
      status: "failed",
      exitCode: 1,
      errorMessage: `failed with ${secret}`,
      result: { stderr: `Bearer abc.def.ghi` },
    })

    const persisted = getAgentJob(db, job.id)
    expect(persisted?.errorMessage).not.toContain(secret)
    expect(persisted?.resultJson).not.toContain("abc.def.ghi")
    for (const event of listAgentJobEvents(db, job.id)) {
      expect(event.payloadJson).not.toContain(secret)
      expect(event.payloadJson).not.toContain("abc.def.ghi")
    }
  })

  test("redacts common non-sk secret formats from job storage", () => {
    const db = createAgentJobTestDb()
    const prompt = [
      "OPENAI_API_KEY=plain-openai-token",
      "ANTHROPIC_AUTH_TOKEN=plain-anthropic-token",
      "Authorization: Basic dXNlcjpwYXNz",
      "ghp_abcdefghijklmnopqrstuvwxyz123456",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature",
      "https://example.test/callback?code=oauth-code&access_token=oauth-token",
      "-----BEGIN PRIVATE KEY-----\\nsecret\\n-----END PRIVATE KEY-----",
    ].join("\\n")

    const job = createAgentJob(db, {
      source: "cli",
      runtime: "codex",
      mode: "agent",
      cwd: "/tmp/project",
      prompt,
    })

    expect(job.promptPreview).not.toContain("plain-openai-token")
    expect(job.promptPreview).not.toContain("dXNlcjpwYXNz")
    expect(getAgentJobPrompt(db, job.id)).not.toContain("plain-anthropic-token")
    expect(getAgentJobPrompt(db, job.id)).not.toContain("ghp_")
    expect(getAgentJobPrompt(db, job.id)).not.toContain("oauth-code")

    startAgentJob(db, { jobId: job.id, workerId: "worker-1" })
    appendAgentJobEvent(db, {
      jobId: job.id,
      type: "error",
      payload: { output: prompt },
    })
    const eventPayloads = listAgentJobEvents(db, job.id)
      .map((event) => event.payloadJson)
      .join("\\n")
    expect(eventPayloads).not.toContain("plain-openai-token")
    expect(eventPayloads).not.toContain("PRIVATE KEY")
  })
})
