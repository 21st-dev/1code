import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "fs"
import { dirname } from "path"
import type { AgentJob } from "../db/schema"
import {
  listQueuedAgentJobsForSource,
  type AgentJobDatabase,
} from "./job-store"
import { recoverStaleAgentJobs } from "./job-recovery"
import {
  runPersistedAgentJob,
  type RunPersistedAgentJobOptions,
} from "./job-runner"
import type { AgentTaskRunner } from "./agent-runtime-contract"

type Writer = {
  write(chunk: string): unknown
}

export type RunLocalAgentDaemonOptions = {
  db: AgentJobDatabase
  env?: NodeJS.ProcessEnv
  runner?: AgentTaskRunner | null
  stderr?: Writer
  concurrency?: number
  pollIntervalMs?: number
  once?: boolean
  lockPath?: string | null
  signal?: AbortSignal
  now?: Date
}

export type RunLocalAgentDaemonResult = {
  startedJobs: number
  completedJobs: number
  failedJobs: number
  interruptedJobs: number
  stoppedBy: "once" | "signal"
}

type DaemonLock = {
  release(): void
}

function writeLine(writer: Writer | undefined, line: string): void {
  writer?.write(`${line}\n`)
}

function isPidAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ESRCH"
    ) {
      return false
    }
    return true
  }
}

function readLockPid(lockPath: string): number | null {
  try {
    const parsed = JSON.parse(readFileSync(lockPath, "utf-8")) as {
      pid?: unknown
    }
    return typeof parsed.pid === "number" ? parsed.pid : null
  } catch {
    return null
  }
}

export function acquireDaemonLock(lockPath: string): DaemonLock {
  mkdirSync(dirname(lockPath), { recursive: true, mode: 0o700 })
  const nonce = `${process.pid}:${Date.now()}:${Math.random().toString(16).slice(2)}`

  if (existsSync(lockPath)) {
    const stat = lstatSync(lockPath)
    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing daemon lock symlink: ${lockPath}`)
    }
    const ownerPid = readLockPid(lockPath)
    if (ownerPid && isPidAlive(ownerPid)) {
      throw new Error(`Locus daemon is already running with pid ${ownerPid}`)
    }
    unlinkSync(lockPath)
  }

  const fd = openSync(lockPath, "wx", 0o600)
  try {
    writeFileSync(
      fd,
      JSON.stringify({
        pid: process.pid,
        nonce,
        startedAt: new Date().toISOString(),
      }),
    )
  } finally {
    closeSync(fd)
  }

  return {
    release() {
      try {
        const current = JSON.parse(readFileSync(lockPath, "utf-8")) as {
          nonce?: unknown
        }
        if (current.nonce === nonce) unlinkSync(lockPath)
      } catch {}
    },
  }
}

function delay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  if (signal?.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

async function runDaemonJob(
  job: AgentJob,
  options: RunLocalAgentDaemonOptions,
): Promise<void> {
  const runOptions: RunPersistedAgentJobOptions = {
    db: options.db,
    jobId: job.id,
    runner: options.runner,
    env: options.env,
    workerId: `daemon:${process.pid}:${Date.now()}:${job.id}`,
    workerPid: process.pid,
  }
  await runPersistedAgentJob(runOptions)
}

export async function runLocalAgentDaemon(
  options: RunLocalAgentDaemonOptions,
): Promise<RunLocalAgentDaemonResult> {
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 1, 16))
  const pollIntervalMs = Math.max(
    100,
    Math.min(options.pollIntervalMs ?? 1000, 60_000),
  )
  const lock = options.lockPath ? acquireDaemonLock(options.lockPath) : null
  const active = new Set<Promise<void>>()
  const result: RunLocalAgentDaemonResult = {
    startedJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    interruptedJobs: 0,
    stoppedBy: "once",
  }

  try {
    const interrupted = recoverStaleAgentJobs(options.db, options.now)
    result.interruptedJobs = interrupted.length
    writeLine(
      options.stderr,
      `[Daemon] Started local agent daemon pid=${process.pid} concurrency=${concurrency}`,
    )
    if (interrupted.length > 0) {
      writeLine(
        options.stderr,
        `[Daemon] Marked ${interrupted.length} stale running job(s) interrupted`,
      )
    }

    while (!options.signal?.aborted) {
      const available = concurrency - active.size
      if (available > 0) {
        const queued = listQueuedAgentJobsForSource(
          options.db,
          "daemon",
          available,
        )
        for (const job of queued) {
          result.startedJobs += 1
          let promise: Promise<void>
          promise = runDaemonJob(job, options)
            .then(() => {
              result.completedJobs += 1
            })
            .catch((error) => {
              result.failedJobs += 1
              writeLine(
                options.stderr,
                `[Daemon] Failed job ${job.id}: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              )
            })
            .finally(() => {
              active.delete(promise)
            })
          active.add(promise)
        }
      }

      if (options.once && active.size === 0) {
        const queued = listQueuedAgentJobsForSource(options.db, "daemon", 1)
        if (queued.length === 0) break
      }

      await delay(pollIntervalMs, options.signal)
    }

    if (options.signal?.aborted) result.stoppedBy = "signal"
    await Promise.allSettled(active)
    return result
  } finally {
    lock?.release()
    writeLine(options.stderr, "[Daemon] Stopped local agent daemon")
  }
}
