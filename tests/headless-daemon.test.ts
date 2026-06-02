import { describe, expect, test } from "bun:test"
import { mkdtempSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import {
  createAgentJob,
  getAgentJob,
  requestCancelAgentJob,
  startAgentJob,
} from "../src/main/lib/headless/job-store"
import {
  acquireDaemonLock,
  runLocalAgentDaemon,
} from "../src/main/lib/headless/daemon"
import { createAgentJobTestDb } from "./helpers/agent-job-test-db"
import type { AgentTaskRunner } from "../src/main/lib/headless/agent-runtime-contract"

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitUntil(
  predicate: () => boolean,
  message: string,
  timeoutMs = 1000,
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return
    await delay(5)
  }
  throw new Error(message)
}

describe("local agent daemon", () => {
  test("runs queued daemon jobs and marks stale running jobs interrupted on startup", async () => {
    const db = createAgentJobTestDb()
    const staleJob = createAgentJob(db, {
      source: "daemon",
      runtime: "codex",
      mode: "agent",
      cwd: process.cwd(),
      prompt: "Interrupted work",
    })
    startAgentJob(db, {
      jobId: staleJob.id,
      workerId: "daemon:stale",
      now: new Date("2026-06-03T00:00:00.000Z"),
    })
    const queuedJob = createAgentJob(db, {
      source: "daemon",
      runtime: "claude-code",
      mode: "plan",
      cwd: process.cwd(),
      prompt: "Run me",
    })

    const result = await runLocalAgentDaemon({
      db,
      once: true,
      pollIntervalMs: 5,
      now: new Date("2026-06-03T00:03:00.000Z"),
      env: { LOCUS_HEADLESS_FAKE_RUNNER: "1" },
    })

    expect(result).toMatchObject({
      startedJobs: 1,
      completedJobs: 1,
      interruptedJobs: 1,
      stoppedBy: "once",
    })
    expect(getAgentJob(db, staleJob.id)?.status).toBe("interrupted")
    expect(getAgentJob(db, queuedJob.id)?.status).toBe("succeeded")
  })

  test("daemon worker observes persisted cancel requests", async () => {
    const db = createAgentJobTestDb()
    const job = createAgentJob(db, {
      source: "daemon",
      runtime: "codex",
      mode: "agent",
      cwd: process.cwd(),
      prompt: "Cancel this daemon job",
    })
    let started = false
    const runner: AgentTaskRunner = async (_request, observer) => {
      started = true
      while (!observer.isCancelRequested()) {
        observer.heartbeat()
        await delay(5)
      }
      return {
        status: "canceled",
        exitCode: 130,
        errorCode: "job_canceled",
        errorMessage: "Canceled by test",
      }
    }

    const daemon = runLocalAgentDaemon({
      db,
      once: true,
      pollIntervalMs: 5,
      runner,
    })
    await waitUntil(() => started, "daemon job did not start")
    requestCancelAgentJob(db, job.id, "test")
    const result = await daemon

    expect(result).toMatchObject({
      startedJobs: 1,
      completedJobs: 1,
      failedJobs: 0,
    })
    expect(getAgentJob(db, job.id)).toMatchObject({
      status: "canceled",
      errorCode: "job_canceled",
    })
  })

  test("daemon respects the configured concurrency limit", async () => {
    const db = createAgentJobTestDb()
    const first = createAgentJob(db, {
      source: "daemon",
      runtime: "codex",
      mode: "agent",
      cwd: process.cwd(),
      prompt: "First",
    })
    const second = createAgentJob(db, {
      source: "daemon",
      runtime: "codex",
      mode: "agent",
      cwd: process.cwd(),
      prompt: "Second",
    })
    let active = 0
    let maxActive = 0
    const releases: Array<() => void> = []
    const runner: AgentTaskRunner = async (_request, observer) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      observer.heartbeat()
      await new Promise<void>((resolve) => releases.push(resolve))
      active -= 1
      return { status: "succeeded", exitCode: 0, result: { ok: true } }
    }

    const daemon = runLocalAgentDaemon({
      db,
      once: true,
      concurrency: 1,
      pollIntervalMs: 5,
      runner,
    })
    await waitUntil(() => releases.length === 1, "first daemon job did not start")
    expect(maxActive).toBe(1)
    expect(getAgentJob(db, first.id)?.status).toBe("running")
    expect(getAgentJob(db, second.id)?.status).toBe("queued")

    releases.shift()?.()
    await waitUntil(() => releases.length === 1, "second daemon job did not start")
    expect(maxActive).toBe(1)
    releases.shift()?.()
    const result = await daemon

    expect(result).toMatchObject({
      startedJobs: 2,
      completedJobs: 2,
      failedJobs: 0,
    })
    expect(getAgentJob(db, first.id)?.status).toBe("succeeded")
    expect(getAgentJob(db, second.id)?.status).toBe("succeeded")
  })

  test("daemon lock rejects a second live owner and releases cleanly", () => {
    const dir = mkdtempSync(join(tmpdir(), "locus-daemon-lock-"))
    const lockPath = join(dir, "agent-daemon.lock")
    const lock = acquireDaemonLock(lockPath)

    expect(() => acquireDaemonLock(lockPath)).toThrow("already running")
    lock.release()
    expect(() => acquireDaemonLock(lockPath).release()).not.toThrow()
  })
})
