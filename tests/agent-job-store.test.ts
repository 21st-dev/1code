import { describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import * as schema from "../src/main/lib/db/schema"
import {
  appendAgentJobEvent,
  completeAgentJob,
  createAgentJob,
  getAgentJob,
  heartbeatAgentJob,
  interruptStaleAgentJobs,
  listAgentJobEvents,
  requestCancelAgentJob,
  retryAgentJob,
  startAgentJob,
} from "../src/main/lib/headless/job-store"

function createTestDb() {
  const sqlite = new Database(":memory:")
  sqlite.exec("PRAGMA journal_mode = WAL")
  sqlite.exec("PRAGMA busy_timeout = 5000")
  sqlite.exec("PRAGMA foreign_keys = ON")
  sqlite.exec(`
    CREATE TABLE projects (id text PRIMARY KEY NOT NULL);
    CREATE TABLE chats (id text PRIMARY KEY NOT NULL);
    CREATE TABLE sub_chats (id text PRIMARY KEY NOT NULL);
    CREATE TABLE agent_jobs (
      id text PRIMARY KEY NOT NULL,
      retry_of_job_id text,
      attempt integer DEFAULT 1 NOT NULL,
      source text NOT NULL,
      runtime text NOT NULL,
      status text DEFAULT 'queued' NOT NULL,
      mode text DEFAULT 'agent' NOT NULL,
      cwd text NOT NULL,
      project_id text,
      chat_id text,
      sub_chat_id text,
      prompt_preview text,
      created_at integer,
      started_at integer,
      finished_at integer,
      exit_code integer,
      error_code text,
      error_message text,
      result_json text,
      created_by_version text,
      worker_id text,
      worker_pid integer,
      worker_started_at integer,
      heartbeat_at integer,
      cancel_requested_at integer,
      cancel_requested_by text,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE set null,
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE set null,
      FOREIGN KEY (sub_chat_id) REFERENCES sub_chats(id) ON DELETE set null
    );
    CREATE INDEX agent_jobs_status_idx ON agent_jobs (status);
    CREATE INDEX agent_jobs_source_idx ON agent_jobs (source);
    CREATE INDEX agent_jobs_runtime_idx ON agent_jobs (runtime);
    CREATE INDEX agent_jobs_cwd_idx ON agent_jobs (cwd);
    CREATE INDEX agent_jobs_created_at_idx ON agent_jobs (created_at);
    CREATE INDEX agent_jobs_heartbeat_at_idx ON agent_jobs (heartbeat_at);
    CREATE TABLE agent_job_events (
      id text PRIMARY KEY NOT NULL,
      job_id text NOT NULL,
      sequence integer NOT NULL,
      type text NOT NULL,
      payload_json text DEFAULT '{}' NOT NULL,
      created_at integer,
      FOREIGN KEY (job_id) REFERENCES agent_jobs(id) ON DELETE cascade
    );
    CREATE UNIQUE INDEX agent_job_events_job_sequence_idx
      ON agent_job_events (job_id, sequence);
    CREATE INDEX agent_job_events_job_created_at_idx
      ON agent_job_events (job_id, created_at);
  `)
  return drizzle(sqlite, { schema })
}

describe("agent job store", () => {
  test("creates, starts, appends events, and completes a job", () => {
    const db = createTestDb()
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
    const db = createTestDb()
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
    const db = createTestDb()
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
    const db = createTestDb()
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
    const db = createTestDb()
    const secret = "sk-abcdefghijklmnopqrstuvwxyz123456"
    const job = createAgentJob(db, {
      source: "cli",
      runtime: "claude-code",
      mode: "agent",
      cwd: "/tmp/project",
      prompt: `Use token ${secret}`,
    })
    expect(job.promptPreview).not.toContain(secret)

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
})
