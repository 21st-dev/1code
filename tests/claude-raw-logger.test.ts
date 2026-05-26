import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { mkdtemp, readdir, rm } from "node:fs/promises"
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

describe("Claude raw logger", () => {
  beforeEach(async () => {
    userDataDir = await mkdtemp(join(tmpdir(), "locus-raw-logger-"))
  })

  afterEach(async () => {
    await rm(userDataDir, { force: true, recursive: true })
    userDataDir = ""
  })

  test("recreates the logs directory before appending to a cached log file", async () => {
    await rawLogger.logRawClaudeMessage("session-1", { first: true })

    const logsDir = join(userDataDir, "logs", "claude")
    expect((await readdir(logsDir)).length).toBe(1)

    await rm(logsDir, { force: true, recursive: true })

    await rawLogger.logRawClaudeMessage("session-1", { second: true })

    const files = await readdir(logsDir)
    expect(files.length).toBe(1)
    expect(files[0]).toEndWith(".jsonl")
  })
})
