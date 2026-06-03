import { describe, expect, test } from "bun:test"
import { Readable } from "stream"
import {
  completeAgentJob,
  createAgentJob,
  getAgentJob,
  listAgentJobEvents,
  listAgentJobs,
  startAgentJob,
} from "../src/main/lib/headless/job-store"
import {
  HEADLESS_STDIN_MAX_BYTES,
  runHeadlessCliCommand,
} from "../src/main/lib/headless/cli-dispatcher"
import { HEADLESS_CLI_MARKER } from "../src/main/lib/headless/cli-args"
import { projects } from "../src/main/lib/db/schema"
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

function seedCurrentProject(db: ReturnType<typeof createAgentJobTestDb>) {
  db.insert(projects)
    .values({
      id: "project-1",
      name: "Current",
      path: process.cwd(),
    })
    .run()
}

function parseJsonLines(value: string): any[] {
  return value
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
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

  test("manages schedules and creates schedule jobs through the CLI", async () => {
    const db = createAgentJobTestDb()
    seedCurrentProject(db)
    const createStdout = writer()
    const createStderr = writer()
    const createCode = await runHeadlessCliCommand({
      db,
      argv: [
        "Locus",
        HEADLESS_CLI_MARKER,
        "schedules",
        "create",
        "--name",
        "Nightly",
        "--runtime",
        "codex",
        "--mode",
        "plan",
        "--cwd",
        process.cwd(),
        "--interval-seconds",
        "300",
        "--prompt",
        "Inspect current project",
        "--output",
        "json",
      ],
      stdout: createStdout.stream,
      stderr: createStderr.stream,
      now: new Date("2026-06-03T01:00:00.000Z"),
    })

    expect(createCode).toBe(0)
    expect(createStderr.value()).toBe("")
    const created = JSON.parse(createStdout.value()).schedule
    expect(created).toMatchObject({
      name: "Nightly",
      status: "enabled",
      runtime: "codex",
      mode: "plan",
      intervalSeconds: 300,
      nextRunAt: "2026-06-03T01:05:00.000Z",
    })

    const listStdout = writer()
    await runHeadlessCliCommand({
      db,
      argv: [
        "Locus",
        HEADLESS_CLI_MARKER,
        "schedules",
        "list",
        "--output",
        "json",
      ],
      stdout: listStdout.stream,
      stderr: writer().stream,
    })
    expect(JSON.parse(listStdout.value()).schedules).toHaveLength(1)

    const pauseStdout = writer()
    await runHeadlessCliCommand({
      db,
      argv: [
        "Locus",
        HEADLESS_CLI_MARKER,
        "schedules",
        "pause",
        created.id,
        "--output",
        "json",
      ],
      stdout: pauseStdout.stream,
      stderr: writer().stream,
    })
    expect(JSON.parse(pauseStdout.value()).schedule.status).toBe("paused")

    const resumeStdout = writer()
    await runHeadlessCliCommand({
      db,
      argv: [
        "Locus",
        HEADLESS_CLI_MARKER,
        "schedules",
        "resume",
        created.id,
        "--output",
        "json",
      ],
      stdout: resumeStdout.stream,
      stderr: writer().stream,
      now: new Date("2026-06-03T01:01:00.000Z"),
    })
    expect(JSON.parse(resumeStdout.value()).schedule.status).toBe("enabled")

    const runStdout = writer()
    await runHeadlessCliCommand({
      db,
      argv: [
        "Locus",
        HEADLESS_CLI_MARKER,
        "schedules",
        "run",
        created.id,
        "--output",
        "json",
      ],
      stdout: runStdout.stream,
      stderr: writer().stream,
      now: new Date("2026-06-03T01:02:00.000Z"),
    })
    const run = JSON.parse(runStdout.value())
    expect(run.job).toMatchObject({
      source: "schedule",
      status: "queued",
      runtime: "codex",
    })
    expect(getAgentJob(db, run.job.id)?.source).toBe("schedule")

    const deleteStdout = writer()
    await runHeadlessCliCommand({
      db,
      argv: [
        "Locus",
        HEADLESS_CLI_MARKER,
        "schedules",
        "delete",
        created.id,
        "--output",
        "json",
      ],
      stdout: deleteStdout.stream,
      stderr: writer().stream,
    })
    expect(JSON.parse(deleteStdout.value()).schedule.status).toBe("disabled")

    const finalListStdout = writer()
    await runHeadlessCliCommand({
      db,
      argv: [
        "Locus",
        HEADLESS_CLI_MARKER,
        "schedules",
        "list",
        "--output",
        "json",
      ],
      stdout: finalListStdout.stream,
      stderr: writer().stream,
    })
    expect(JSON.parse(finalListStdout.value()).schedules).toHaveLength(0)
  })

  test("reports schedule create path validation failures on stderr", async () => {
    const db = createAgentJobTestDb()
    const stdout = writer()
    const stderr = writer()
    const code = await runHeadlessCliCommand({
      db,
      argv: [
        "Locus",
        HEADLESS_CLI_MARKER,
        "schedules",
        "create",
        "--name",
        "Unsafe",
        "--cwd",
        process.cwd(),
        "--prompt",
        "Inspect",
        "--output",
        "json",
      ],
      stdout: stdout.stream,
      stderr: stderr.stream,
    })

    expect(code).toBe(7)
    expect(stdout.value()).toBe("")
    expect(stderr.value()).toContain("registered project")
  })

  test("runs minimal ACP stdio with JSON-only stdout and protocol jobs", async () => {
    const db = createAgentJobTestDb()
    seedCurrentProject(db)
    const stdout = writer()
    const stderr = writer()
    const input = [
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {},
      },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "job.run",
        params: {
          runtime: "codex",
          mode: "agent",
          cwd: process.cwd(),
          prompt: "ACP smoke",
        },
      },
      {
        jsonrpc: "2.0",
        id: 3,
        method: "shutdown",
        params: {},
      },
    ].map(JSON.stringify).join("\n")

    const code = await runHeadlessCliCommand({
      db,
      argv: ["Locus", HEADLESS_CLI_MARKER, "acp"],
      stdin: Readable.from([`${input}\n`]),
      stdout: stdout.stream,
      stderr: stderr.stream,
      env: { LOCUS_HEADLESS_FAKE_RUNNER: "1" },
    })

    expect(code).toBe(0)
    expect(stderr.value()).toBe("")
    const lines = parseJsonLines(stdout.value())
    expect(lines.every((line) => line.jsonrpc === "2.0")).toBe(true)
    expect(lines.find((line) => line.id === 1)?.result.capabilities).toMatchObject({
      jobRun: true,
      jobCancel: true,
      eventStream: true,
      shutdown: true,
    })
    const runResponse = lines.find((line) => line.id === 2)
    expect(runResponse?.result.job).toMatchObject({
      source: "protocol",
      runtime: "codex",
      status: "queued",
    })
    expect(
      lines.filter((line) => line.method === "job/event").map((line) => line.params.event.type),
    ).toContain("completed")
    expect(listAgentJobs(db, { source: "protocol" })).toHaveLength(1)
    expect(listAgentJobs(db, { source: "protocol" })[0].status).toBe("succeeded")
  })

  test("rejects ACP provider secrets and raw env without creating jobs", async () => {
    const db = createAgentJobTestDb()
    seedCurrentProject(db)
    const stdout = writer()
    const stderr = writer()
    const input = [
      {
        jsonrpc: "2.0",
        id: "run",
        method: "job.run",
        params: {
          runtime: "codex",
          cwd: process.cwd(),
          prompt: "Do work",
          env: {
            OPENAI_API_KEY: "sk-abcdefghijklmnopqrstuvwxyz123456",
          },
        },
      },
      {
        jsonrpc: "2.0",
        id: "shutdown",
        method: "shutdown",
        params: {},
      },
    ].map(JSON.stringify).join("\n")

    const code = await runHeadlessCliCommand({
      db,
      argv: ["Locus", HEADLESS_CLI_MARKER, "acp"],
      stdin: Readable.from([`${input}\n`]),
      stdout: stdout.stream,
      stderr: stderr.stream,
      env: { LOCUS_HEADLESS_FAKE_RUNNER: "1" },
    })

    expect(code).toBe(0)
    const lines = parseJsonLines(stdout.value())
    expect(lines.find((line) => line.id === "run")?.error).toMatchObject({
      code: -32602,
    })
    expect(stderr.value()).toContain("must not include provider tokens")
    expect(listAgentJobs(db, { source: "protocol" })).toHaveLength(0)
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
