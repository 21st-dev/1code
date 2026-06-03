import { describe, expect, test } from "bun:test"
import { Readable } from "stream"
import {
  completeAgentJob,
  createAgentJob,
  getAgentJob,
  listAgentJobEvents,
  startAgentJob,
} from "../src/main/lib/headless/job-store"
import {
  HEADLESS_STDIN_MAX_BYTES,
  runHeadlessCliCommand,
} from "../src/main/lib/headless/cli-dispatcher"
import { HEADLESS_CLI_MARKER } from "../src/main/lib/headless/cli-args"
import { createAgentJobTestDb } from "./helpers/agent-job-test-db"

function writer() {
  let value = ""
  return {
    stream: {
      write(chunk: string) {
        value += chunk
      },
    },
    value() {
      return value
    },
  }
}

describe("headless CLI dispatcher", () => {
  test("runs a fake job, writes durable events, and keeps JSON stdout pure", async () => {
    const db = createAgentJobTestDb()
    const stdout = writer()
    const stderr = writer()
    const code = await runHeadlessCliCommand({
      db,
      argv: [
        "Locus",
        HEADLESS_CLI_MARKER,
        "run",
        "--runtime",
        "codex",
        "--cwd",
        process.cwd(),
        "--output",
        "json",
        "--prompt",
        "Summarize this repository",
      ],
      stdout: stdout.stream,
      stderr: stderr.stream,
      env: { LOCUS_HEADLESS_FAKE_RUNNER: "1" },
      appVersion: "0.0.test",
    })

    expect(code).toBe(0)
    expect(stderr.value()).toBe("")
    const parsed = JSON.parse(stdout.value())
    expect(parsed.job).toMatchObject({
      source: "cli",
      runtime: "codex",
      status: "succeeded",
      result: {
        fake: true,
        finalMessage: "Fake codex job completed.",
      },
    })
    expect(parsed.events.map((event: { type: string }) => event.type)).toEqual([
      "job_created",
      "job_started",
      "status",
      "assistant_delta",
      "completed",
    ])
    const job = getAgentJob(db, parsed.job.id)
    expect(job?.status).toBe("succeeded")
    expect(listAgentJobEvents(db, parsed.job.id)).toHaveLength(5)
  })

  test("supports stdin prompts and text logs", async () => {
    const db = createAgentJobTestDb()
    const runStdout = writer()
    await runHeadlessCliCommand({
      db,
      argv: [
        "Locus",
        HEADLESS_CLI_MARKER,
        "run",
        "--runtime",
        "claude-code",
        "--cwd",
        process.cwd(),
        "--stdin",
      ],
      stdin: Readable.from(["Read from stdin"]),
      stdout: runStdout.stream,
      stderr: writer().stream,
      env: { LOCUS_HEADLESS_FAKE_RUNNER: "1" },
    })
    expect(runStdout.value()).toContain("Fake claude-code job completed.")

    const listStdout = writer()
    await runHeadlessCliCommand({
      db,
      argv: ["Locus", HEADLESS_CLI_MARKER, "jobs", "list"],
      stdout: listStdout.stream,
      stderr: writer().stream,
    })
    const jobId = listStdout.value().split(/\s+/)[0]
    expect(jobId).toBeTruthy()

    const logsStdout = writer()
    await runHeadlessCliCommand({
      db,
      argv: ["Locus", HEADLESS_CLI_MARKER, "jobs", "logs", jobId],
      stdout: logsStdout.stream,
      stderr: writer().stream,
    })
    expect(logsStdout.value()).toContain("assistant_delta")
    expect(logsStdout.value()).toContain("Read from stdin")
  })

  test("queues daemon runs without executing the runtime in the submitter", async () => {
    const db = createAgentJobTestDb()
    const stdout = writer()
    let runnerCalled = false
    const code = await runHeadlessCliCommand({
      db,
      argv: [
        "Locus",
        HEADLESS_CLI_MARKER,
        "run",
        "--daemon",
        "--runtime",
        "codex",
        "--cwd",
        process.cwd(),
        "--output",
        "json",
        "--prompt",
        "Queue background work",
      ],
      stdout: stdout.stream,
      stderr: writer().stream,
      runner: async () => {
        runnerCalled = true
        return { status: "failed", errorCode: "should_not_run" }
      },
    })

    expect(code).toBe(0)
    expect(runnerCalled).toBe(false)
    const parsed = JSON.parse(stdout.value())
    expect(parsed.job).toMatchObject({
      source: "daemon",
      runtime: "codex",
      status: "queued",
    })
    expect(getAgentJob(db, parsed.job.id)?.status).toBe("queued")
  })

  test("runs daemon once and claims only daemon queued jobs", async () => {
    const db = createAgentJobTestDb()
    const cliJob = createAgentJob(db, {
      source: "cli",
      runtime: "codex",
      mode: "agent",
      cwd: process.cwd(),
      prompt: "Leave this one-shot retry queued",
    })
    const daemonJob = createAgentJob(db, {
      source: "daemon",
      runtime: "claude-code",
      mode: "plan",
      cwd: process.cwd(),
      prompt: "Run in daemon",
    })

    const stdout = writer()
    const stderr = writer()
    const code = await runHeadlessCliCommand({
      db,
      argv: [
        "Locus",
        HEADLESS_CLI_MARKER,
        "daemon",
        "run",
        "--once",
        "--poll-interval-ms",
        "10",
        "--output",
        "json",
      ],
      stdout: stdout.stream,
      stderr: stderr.stream,
      env: { LOCUS_HEADLESS_FAKE_RUNNER: "1" },
    })

    expect(code).toBe(0)
    expect(JSON.parse(stdout.value()).daemon).toMatchObject({
      startedJobs: 1,
      completedJobs: 1,
      failedJobs: 0,
      stoppedBy: "once",
    })
    expect(stderr.value()).toContain("Started local agent daemon")
    expect(getAgentJob(db, daemonJob.id)?.status).toBe("succeeded")
    expect(getAgentJob(db, cliJob.id)?.status).toBe("queued")

    const listStdout = writer()
    await runHeadlessCliCommand({
      db,
      argv: [
        "Locus",
        HEADLESS_CLI_MARKER,
        "jobs",
        "list",
        "--source",
        "daemon",
        "--output",
        "json",
      ],
      stdout: listStdout.stream,
      stderr: writer().stream,
    })
    const listed = JSON.parse(listStdout.value()).jobs
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({ id: daemonJob.id, source: "daemon" })
  })

  test("daemon command reports stale running jobs it interrupts", async () => {
    const db = createAgentJobTestDb()
    const staleJob = createAgentJob(db, {
      source: "daemon",
      runtime: "codex",
      mode: "agent",
      cwd: process.cwd(),
      prompt: "Recover me",
    })
    startAgentJob(db, {
      jobId: staleJob.id,
      workerId: "daemon:stale",
      now: new Date("2026-06-03T00:00:00.000Z"),
    })

    const stdout = writer()
    const code = await runHeadlessCliCommand({
      db,
      argv: [
        "Locus",
        HEADLESS_CLI_MARKER,
        "daemon",
        "run",
        "--once",
        "--poll-interval-ms",
        "10",
        "--output",
        "json",
      ],
      stdout: stdout.stream,
      stderr: writer().stream,
      now: new Date("2026-06-03T00:03:00.000Z"),
      env: { LOCUS_HEADLESS_FAKE_RUNNER: "1" },
    })

    expect(code).toBe(0)
    expect(JSON.parse(stdout.value()).daemon).toMatchObject({
      startedJobs: 0,
      interruptedJobs: 1,
      stoppedBy: "once",
    })
    expect(getAgentJob(db, staleJob.id)?.status).toBe("interrupted")
  })

  test("cancels queued jobs and retries terminal jobs", async () => {
    const db = createAgentJobTestDb()
    const runStdout = writer()
    await runHeadlessCliCommand({
      db,
      argv: [
        "Locus",
        HEADLESS_CLI_MARKER,
        "run",
        "--runtime",
        "codex",
        "--cwd",
        process.cwd(),
        "--output",
        "json",
        "--prompt",
        "Create a failed job",
      ],
      stdout: runStdout.stream,
      stderr: writer().stream,
      runner: async () => ({
        status: "failed",
        exitCode: 1,
        errorCode: "test_failure",
        errorMessage: "Failed for test",
      }),
    })
    const failedJob = JSON.parse(runStdout.value()).job

    const retryStdout = writer()
    await runHeadlessCliCommand({
      db,
      argv: [
        "Locus",
        HEADLESS_CLI_MARKER,
        "jobs",
        "retry",
        failedJob.id,
        "--output",
        "json",
      ],
      stdout: retryStdout.stream,
      stderr: writer().stream,
    })
    const retryJob = JSON.parse(retryStdout.value()).job
    expect(retryJob).toMatchObject({
      status: "queued",
      retryOfJobId: failedJob.id,
      attempt: 2,
    })

    const cancelStdout = writer()
    await runHeadlessCliCommand({
      db,
      argv: [
        "Locus",
        HEADLESS_CLI_MARKER,
        "jobs",
        "cancel",
        retryJob.id,
        "--output",
        "json",
      ],
      stdout: cancelStdout.stream,
      stderr: writer().stream,
    })
    expect(JSON.parse(cancelStdout.value()).job).toMatchObject({
      status: "canceled",
      exitCode: 5,
      errorCode: "job_canceled",
    })
  })

  test("does not retry desktop chat jobs from the generic CLI retry path", async () => {
    const db = createAgentJobTestDb()
    const desktopJob = createAgentJob(db, {
      source: "desktop",
      runtime: "codex",
      mode: "agent",
      cwd: process.cwd(),
      prompt: "Desktop chat prompt",
      input: { kind: "desktop-chat", promptSha256: "hash" },
    })
    startAgentJob(db, { jobId: desktopJob.id, workerId: "desktop:codex:run-1" })
    completeAgentJob(db, {
      jobId: desktopJob.id,
      status: "failed",
      exitCode: 1,
      errorCode: "desktop_chat_failed",
    })

    const stdout = writer()
    const stderr = writer()
    const code = await runHeadlessCliCommand({
      db,
      argv: [
        "Locus",
        HEADLESS_CLI_MARKER,
        "jobs",
        "retry",
        desktopJob.id,
        "--output",
        "json",
      ],
      stdout: stdout.stream,
      stderr: stderr.stream,
    })

    expect(code).toBe(3)
    expect(stdout.value()).toBe("")
    expect(stderr.value()).toContain(
      "Desktop chat jobs must be retried from their linked chat.",
    )
  })

  test("normalizes run exit codes instead of leaking runtime process codes", async () => {
    const db = createAgentJobTestDb()
    const cancelStdout = writer()
    const cancelCode = await runHeadlessCliCommand({
      db,
      argv: [
        "Locus",
        HEADLESS_CLI_MARKER,
        "run",
        "--runtime",
        "codex",
        "--cwd",
        process.cwd(),
        "--output",
        "json",
        "--prompt",
        "Cancel me",
      ],
      stdout: cancelStdout.stream,
      stderr: writer().stream,
      runner: async () => ({
        status: "canceled",
        exitCode: 130,
        errorCode: "job_canceled",
        errorMessage: "Canceled by test",
      }),
    })
    expect(cancelCode).toBe(5)
    expect(JSON.parse(cancelStdout.value()).job).toMatchObject({
      status: "canceled",
      exitCode: 5,
    })

    const authStdout = writer()
    const authCode = await runHeadlessCliCommand({
      db,
      argv: [
        "Locus",
        HEADLESS_CLI_MARKER,
        "run",
        "--runtime",
        "claude-code",
        "--cwd",
        process.cwd(),
        "--output",
        "json",
        "--prompt",
        "Needs login",
      ],
      stdout: authStdout.stream,
      stderr: writer().stream,
      runner: async () => ({
        status: "failed",
        exitCode: 1,
        errorCode: "runtime_auth_required",
        errorMessage: "Claude Code authentication is required.",
      }),
    })
    expect(authCode).toBe(4)
    expect(JSON.parse(authStdout.value()).job).toMatchObject({
      status: "failed",
      exitCode: 4,
      errorCode: "runtime_auth_required",
    })
  })

  test("rejects oversized stdin before creating a job", async () => {
    const db = createAgentJobTestDb()
    const stderr = writer()
    const code = await runHeadlessCliCommand({
      db,
      argv: [
        "Locus",
        HEADLESS_CLI_MARKER,
        "run",
        "--runtime",
        "codex",
        "--cwd",
        process.cwd(),
        "--stdin",
      ],
      stdin: Readable.from(["x".repeat(HEADLESS_STDIN_MAX_BYTES + 1)]),
      stdout: writer().stream,
      stderr: stderr.stream,
      env: { LOCUS_HEADLESS_FAKE_RUNNER: "1" },
    })

    expect(code).toBe(2)
    expect(stderr.value()).toContain("stdin exceeds")

    const listStdout = writer()
    await runHeadlessCliCommand({
      db,
      argv: ["Locus", HEADLESS_CLI_MARKER, "jobs", "list", "--output", "json"],
      stdout: listStdout.stream,
      stderr: writer().stream,
    })
    expect(JSON.parse(listStdout.value()).jobs).toHaveLength(0)
  })
})
