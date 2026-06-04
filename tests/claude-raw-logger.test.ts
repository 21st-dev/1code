import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import {
  mkdir,
  mkdtemp,
  readdir,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

let userDataDir = ""

mock.module("electron", () => ({
  app: {
    getPath(name: string) {
      if (name !== "userData") {
        throw new Error(`unexpected app path request: ${name}`)
      }
      return userDataDir
    },
    isPackaged: false,
  },
}))

const rawLogger = await import("../src/main/lib/claude/raw-logger")

async function expectFileRemoved(file: string): Promise<void> {
  const deadline = Date.now() + 1_000
  while (Date.now() < deadline) {
    try {
      await stat(file)
    } catch {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  await expect(stat(file)).rejects.toThrow()
}

describe("Claude raw logger", () => {
  const previousRawLog = process.env.CLAUDE_RAW_LOG

  beforeEach(async () => {
    delete process.env.CLAUDE_RAW_LOG
    userDataDir = await mkdtemp(join(tmpdir(), "locus-raw-logger-"))
  })

  afterEach(async () => {
    if (previousRawLog === undefined) {
      delete process.env.CLAUDE_RAW_LOG
    } else {
      process.env.CLAUDE_RAW_LOG = previousRawLog
    }
    await rm(userDataDir, { force: true, recursive: true })
    userDataDir = ""
  })

  test("does not write raw logs unless explicitly enabled", async () => {
    await rawLogger.logRawClaudeMessage("session-1", { first: true })

    await expect(stat(join(userDataDir, "logs", "claude"))).rejects.toThrow()
  })

  test("recreates the logs directory before appending to a cached log file", async () => {
    process.env.CLAUDE_RAW_LOG = "1"

    await rawLogger.logRawClaudeMessage("session-1", { first: true })

    const logsDir = join(userDataDir, "logs", "claude")
    expect((await readdir(logsDir)).length).toBe(1)

    await rm(logsDir, { force: true, recursive: true })

    await rawLogger.logRawClaudeMessage("session-1", { second: true })

    const files = await readdir(logsDir)
    expect(files.length).toBe(1)
    expect(files[0]).toEndWith(".jsonl")
  })

  test("uses a safe filename segment for raw log session ids", async () => {
    process.env.CLAUDE_RAW_LOG = "1"

    await rawLogger.logRawClaudeMessage("../unsafe/session", { first: true })

    const logsDir = join(userDataDir, "logs", "claude")
    const files = await readdir(logsDir)
    expect(files).toHaveLength(1)
    expect(files[0]).toEndWith(".jsonl")
    expect(files[0]).not.toContain("/")
    expect(files[0]).not.toContain("..")
  })

  test("cleans up stale logs when a new raw log session starts", async () => {
    process.env.CLAUDE_RAW_LOG = "1"

    const logsDir = join(userDataDir, "logs", "claude")
    await mkdir(logsDir, { recursive: true })
    const staleLog = join(logsDir, "old-session.jsonl")
    await writeFile(staleLog, "{}\n")
    const staleDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
    await utimes(staleLog, staleDate, staleDate)

    await rawLogger.logRawClaudeMessage("session-cleanup", { first: true })

    await expectFileRemoved(staleLog)
  })
})
