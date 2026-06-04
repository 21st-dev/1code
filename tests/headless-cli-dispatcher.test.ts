import { describe, expect, test } from "bun:test"
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
} from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
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
  test("runs Local Job API create/status/events/result with stable JSON output", async () => {
    const db = createAgentJobTestDb()
    seedCurrentProject(db)
    const artifactBaseDir = mkdtempSync(join(tmpdir(), "locus-api-runs-"))
    const request = {
      apiVersion: "locus.local-job.v1",
      consumer: {
        id: "career-application-kit",
        runExternalId: "company-role-review-001",
      },
      project: {
        cwd: process.cwd(),
      },
      runtime: {
        id: "codex",
        requiredCapabilities: ["planMode"],
      },
      mode: "plan",
      prompt: {
        text: "Review this career package.",
      },
      input: {
        contract: "career.job-package.v1",
        packageDir: artifactBaseDir,
      },
      artifacts: {
        baseDir: artifactBaseDir,
        writePolicy: "metadata-only",
      },
    }
    const stdout = writer()
    const stderr = writer()
    const code = await runHeadlessCliCommand({
      db,
      argv: [
        "Locus",
        HEADLESS_CLI_MARKER,
        "api",
        "runs",
        "create",
        "--request",
        "-",
        "--json",
      ],
      stdin: Readable.from([JSON.stringify(request)]),
      stdout: stdout.stream,
      stderr: stderr.stream,
      env: { LOCUS_HEADLESS_FAKE_RUNNER: "1" },
      appVersion: "0.0.test",
    })

    expect(code).toBe(0)
    expect(stderr.value()).toBe("")
    const created = JSON.parse(stdout.value())
    expect(created).toMatchObject({
      apiVersion: "locus.local-job.v1",
      job: {
        source: "api",
        runtime: "codex",
        status: "succeeded",
        apiConsumerId: "career-application-kit",
        apiConsumerRunId: "company-role-review-001",
      },
      result: {
        apiVersion: "locus.local-job.v1",
        status: "succeeded",
        consumer: {
          id: "career-application-kit",
          runExternalId: "company-role-review-001",
        },
      },
    })
    const jobId = created.job.id
    const runDir = join(artifactBaseDir, jobId)
    expect(existsSync(join(runDir, "request.json"))).toBe(true)
    expect(existsSync(join(runDir, "events.jsonl"))).toBe(true)
    expect(existsSync(join(runDir, "result.json"))).toBe(true)
    expect(existsSync(join(runDir, "artifacts.json"))).toBe(true)
    expect(readFileSync(join(runDir, "request.json"), "utf-8")).toContain(
      "career-application-kit",
    )

    const statusStdout = writer()
    await runHeadlessCliCommand({
      db,
      argv: [
        "Locus",
        HEADLESS_CLI_MARKER,
        "api",
        "runs",
        "status",
        jobId,
        "--json",
      ],
      stdout: statusStdout.stream,
      stderr: writer().stream,
    })
    expect(JSON.parse(statusStdout.value()).job).toMatchObject({
      id: jobId,
      source: "api",
      status: "succeeded",
    })

    const eventsStdout = writer()
    await runHeadlessCliCommand({
      db,
      argv: [
        "Locus",
        HEADLESS_CLI_MARKER,
        "api",
        "runs",
        "events",
        jobId,
        "--after",
        "0",
        "--jsonl",
      ],
      stdout: eventsStdout.stream,
      stderr: writer().stream,
    })
    const events = parseJsonLines(eventsStdout.value())
    expect(events.every((event) => event.apiVersion === "locus.local-job.v1")).toBe(
      true,
    )
    expect(events.map((event) => event.type)).toContain("artifact_created")
    expect(events.map((event) => event.type)).toContain("completed")

    const resultStdout = writer()
    await runHeadlessCliCommand({
      db,
      argv: [
        "Locus",
        HEADLESS_CLI_MARKER,
        "api",
        "runs",
        "result",
        jobId,
        "--json",
      ],
      stdout: resultStdout.stream,
      stderr: writer().stream,
    })
    expect(JSON.parse(resultStdout.value())).toMatchObject({
      apiVersion: "locus.local-job.v1",
      jobId,
      status: "succeeded",
    })
    const manifest = JSON.parse(readFileSync(join(runDir, "artifacts.json"), "utf-8"))
    expect(manifest.artifacts.map((artifact: { role: string }) => artifact.role)).toEqual([
      "request",
      "events",
      "result",
    ])
  })

  test("lists Local Job API runtime capabilities", async () => {
    const db = createAgentJobTestDb()
    const stdout = writer()
    const code = await runHeadlessCliCommand({
      db,
      argv: [
        "Locus",
        HEADLESS_CLI_MARKER,
        "api",
        "runtimes",
        "list",
        "--json",
      ],
      stdout: stdout.stream,
      stderr: writer().stream,
    })

    expect(code).toBe(0)
    const parsed = JSON.parse(stdout.value())
    expect(parsed.apiVersion).toBe("locus.local-job.v1")
    expect(parsed.runtimes.map((runtime: { runtimeId: string }) => runtime.runtimeId)).toContain(
      "codex",
    )
  })

  test("rejects Local Job API secrets before job creation", async () => {
    const db = createAgentJobTestDb()
    seedCurrentProject(db)
    const stdout = writer()
    const stderr = writer()
    const code = await runHeadlessCliCommand({
      db,
      argv: [
        "Locus",
        HEADLESS_CLI_MARKER,
        "api",
        "runs",
        "create",
        "--request",
        "-",
        "--json",
      ],
      stdin: Readable.from([
        JSON.stringify({
          apiVersion: "locus.local-job.v1",
          consumer: { id: "career-application-kit" },
          project: { cwd: process.cwd() },
          runtime: { id: "codex" },
          mode: "plan",
          prompt: { text: "Do not start" },
          input: { env: { GITHUB_TOKEN: "ghp_abcdefghijklmnopqrstuvwxyz" } },
        }),
      ]),
      stdout: stdout.stream,
      stderr: stderr.stream,
      env: { LOCUS_HEADLESS_FAKE_RUNNER: "1" },
    })

    expect(code).toBe(2)
    expect(stdout.value()).toBe("")
    expect(stderr.value()).toContain("input.env is not accepted")
    expect(listAgentJobs(db, { source: "api" })).toHaveLength(0)
  })

  test("rejects unsafe Local Job API artifact directories before job creation", async () => {
    const db = createAgentJobTestDb()
    seedCurrentProject(db)
    const artifactBaseDir = join(mkdtempSync(join(tmpdir(), "locus-api-runs-")), "final")
    mkdirSync(artifactBaseDir)
    const stdout = writer()
    const stderr = writer()
    const code = await runHeadlessCliCommand({
      db,
      argv: [
        "Locus",
        HEADLESS_CLI_MARKER,
        "api",
        "runs",
        "create",
        "--request",
        "-",
        "--json",
      ],
      stdin: Readable.from([
        JSON.stringify({
          apiVersion: "locus.local-job.v1",
          consumer: { id: "career-application-kit" },
          project: { cwd: process.cwd() },
          runtime: { id: "codex" },
          mode: "plan",
          prompt: { text: "Do not start" },
          artifacts: {
            baseDir: artifactBaseDir,
            writePolicy: "metadata-only",
          },
        }),
      ]),
      stdout: stdout.stream,
      stderr: stderr.stream,
      env: { LOCUS_HEADLESS_FAKE_RUNNER: "1" },
    })

    expect(code).toBe(2)
    expect(stdout.value()).toBe("")
    expect(stderr.value()).toContain("final artifact directory")
    expect(listAgentJobs(db, { source: "api" })).toHaveLength(0)
  })

  test("rejects unsupported Local Job API runtime capabilities before job creation", async () => {
    const db = createAgentJobTestDb()
    seedCurrentProject(db)
    const stdout = writer()
    const stderr = writer()
    const code = await runHeadlessCliCommand({
      db,
      argv: [
        "Locus",
        HEADLESS_CLI_MARKER,
        "api",
        "runs",
        "create",
        "--request",
        "-",
        "--json",
      ],
      stdin: Readable.from([
        JSON.stringify({
          apiVersion: "locus.local-job.v1",
          consumer: { id: "career-application-kit" },
          project: { cwd: process.cwd() },
          runtime: {
            id: "codex",
            requiredCapabilities: ["rollback"],
          },
          mode: "plan",
          prompt: { text: "Do not start" },
        }),
      ]),
      stdout: stdout.stream,
      stderr: stderr.stream,
      env: { LOCUS_HEADLESS_FAKE_RUNNER: "1" },
    })

    expect(code).toBe(3)
    expect(stdout.value()).toBe("")
    expect(stderr.value()).toContain("unsupported")
    expect(listAgentJobs(db, { source: "api" })).toHaveLength(0)
  })

  test("scopes Local Job API status/result commands to API jobs", async () => {
    const db = createAgentJobTestDb()
    const job = createAgentJob(db, {
      source: "cli",
      runtime: "codex",
      mode: "plan",
      cwd: process.cwd(),
      prompt: "Not an API job",
    })
    const stdout = writer()
    const stderr = writer()
    const code = await runHeadlessCliCommand({
      db,
      argv: [
        "Locus",
        HEADLESS_CLI_MARKER,
        "api",
        "runs",
        "status",
        job.id,
        "--json",
      ],
      stdout: stdout.stream,
      stderr: stderr.stream,
    })

    expect(code).toBe(3)
    expect(stdout.value()).toBe("")
    expect(stderr.value()).toContain("is not an API job")
  })

  test("cancels and retries only Local Job API jobs", async () => {
    const db = createAgentJobTestDb()
    const queued = createAgentJob(db, {
      source: "api",
      runtime: "codex",
      mode: "plan",
      cwd: process.cwd(),
      prompt: "Cancelable API job",
      apiConsumerId: "career-application-kit",
      apiConsumerRunId: "cancel-001",
    })
    const cancelStdout = writer()
    const cancelCode = await runHeadlessCliCommand({
      db,
      argv: [
        "Locus",
        HEADLESS_CLI_MARKER,
        "api",
        "runs",
        "cancel",
        queued.id,
        "--json",
      ],
      stdout: cancelStdout.stream,
      stderr: writer().stream,
    })
    expect(cancelCode).toBe(0)
    expect(JSON.parse(cancelStdout.value()).job).toMatchObject({
      id: queued.id,
      source: "api",
      status: "canceled",
    })

    const failed = completeAgentJob(db, {
      jobId: createAgentJob(db, {
        source: "api",
        runtime: "codex",
        mode: "plan",
        cwd: process.cwd(),
        prompt: "Retryable API job",
        apiConsumerId: "career-application-kit",
        apiConsumerRunId: "retry-001",
      }).id,
      status: "failed",
      errorCode: "test_failure",
      errorMessage: "failed before retry",
    })
    const retryStdout = writer()
    const retryCode = await runHeadlessCliCommand({
      db,
      argv: [
        "Locus",
        HEADLESS_CLI_MARKER,
        "api",
        "runs",
        "retry",
        failed.id,
        "--json",
      ],
      stdout: retryStdout.stream,
      stderr: writer().stream,
    })
    expect(retryCode).toBe(0)
    expect(JSON.parse(retryStdout.value()).job).toMatchObject({
      source: "api",
      status: "queued",
      retryOfJobId: failed.id,
      apiConsumerId: "career-application-kit",
      apiConsumerRunId: "retry-001",
      artifactManifestPath: null,
    })
  })

  test("runs a fake job, writes durable events, and keeps JSON stdout pure", async () => {
    const db = createAgentJobTestDb()
    seedCurrentProject(db)
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
      projectId: "project-1",
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
    seedCurrentProject(db)
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
    seedCurrentProject(db)
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
      projectId: "project-1",
    })
    expect(getAgentJob(db, parsed.job.id)?.status).toBe("queued")
  })

  test("rejects direct run cwd outside registered projects", async () => {
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
        "Should not start",
      ],
      stdout: stdout.stream,
      stderr: stderr.stream,
      env: { LOCUS_HEADLESS_FAKE_RUNNER: "1" },
    })

    expect(code).toBe(7)
    expect(stdout.value()).toBe("")
    expect(stderr.value()).toContain("registered project")
    expect(listAgentJobs(db, { source: "cli" })).toHaveLength(0)
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
          cwd: ".",
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
    const jobs = listAgentJobs(db, { source: "protocol" })
    expect(jobs).toHaveLength(1)
    expect(jobs[0].cwd).toBe(realpathSync(process.cwd()))
    expect(jobs[0].status).toBe("succeeded")
  })

  test("ACP shutdown cancels active protocol jobs without waiting forever", async () => {
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
          mode: "agent",
          cwd: process.cwd(),
          prompt: "Long ACP job",
        },
      },
      {
        jsonrpc: "2.0",
        id: "shutdown",
        method: "shutdown",
        params: {},
      },
    ].map(JSON.stringify).join("\n")

    const result = await Promise.race([
      runHeadlessCliCommand({
        db,
        argv: ["Locus", HEADLESS_CLI_MARKER, "acp"],
        stdin: Readable.from([`${input}\n`]),
        stdout: stdout.stream,
        stderr: stderr.stream,
        runner: async (_request, observer) => {
          observer.appendEvent("status", { started: true })
          await new Promise(() => {})
          return { status: "succeeded", exitCode: 0 }
        },
      }),
      new Promise<"timed-out">((resolve) =>
        setTimeout(() => resolve("timed-out"), 1000),
      ),
    ])

    expect(result).toBe(0)
    expect(stderr.value()).toBe("")
    const lines = parseJsonLines(stdout.value())
    expect(lines.every((line) => line.jsonrpc === "2.0")).toBe(true)
    expect(lines.find((line) => line.id === "shutdown")?.result).toEqual({
      ok: true,
    })
    const completedEvent = lines
      .filter((line) => line.method === "job/event")
      .map((line) => line.params.event)
      .find((event) => event.type === "completed")
    expect(completedEvent?.payload).toMatchObject({
      status: "canceled",
      errorCode: "job_canceled",
    })
    const jobs = listAgentJobs(db, { source: "protocol" })
    expect(jobs).toHaveLength(1)
    expect(getAgentJob(db, jobs[0].id)).toMatchObject({
      status: "canceled",
      errorCode: "job_canceled",
    })
  })

  test("ACP cancel is limited to jobs created by the current stdio session", async () => {
    const db = createAgentJobTestDb()
    seedCurrentProject(db)
    const daemonJob = createAgentJob(db, {
      source: "daemon",
      runtime: "codex",
      mode: "agent",
      cwd: process.cwd(),
      prompt: "Do not cancel from protocol",
      projectId: "project-1",
    })
    const stdout = writer()
    const stderr = writer()
    const input = [
      {
        jsonrpc: "2.0",
        id: "cancel",
        method: "job.cancel",
        params: {
          jobId: daemonJob.id,
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
    expect(stderr.value()).toBe("")
    const lines = parseJsonLines(stdout.value())
    expect(lines.find((line) => line.id === "cancel")?.error).toMatchObject({
      code: -32602,
    })
    expect(getAgentJob(db, daemonJob.id)).toMatchObject({
      status: "queued",
      cancelRequestedAt: null,
    })
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
    seedCurrentProject(db)
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
    seedCurrentProject(db)
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
