import { describe, expect, test } from "bun:test"
import {
  HEADLESS_CLI_MARKER,
  isHeadlessCliInvocation,
  parseHeadlessCliArgv,
} from "../src/main/lib/headless/cli-args"

describe("headless CLI args", () => {
  test("detects explicit Electron headless marker", () => {
    expect(
      isHeadlessCliInvocation([
        "/Applications/Locus.app/Contents/MacOS/Locus",
        HEADLESS_CLI_MARKER,
        "jobs",
        "list",
      ]),
    ).toBe(true)
  })

  test("parses run with runtime aliases, mode, cwd, and JSON output", () => {
    const parsed = parseHeadlessCliArgv([
      "Locus",
      HEADLESS_CLI_MARKER,
      "run",
      "--runtime",
      "claude",
      "--mode",
      "plan",
      "--cwd",
      process.cwd(),
      "--output",
      "json",
      "--prompt",
      "Inspect the repo",
    ])

    expect(parsed).toMatchObject({
      ok: true,
      command: {
        kind: "run",
        runtime: "claude-code",
        mode: "plan",
        output: "json",
        prompt: "Inspect the repo",
      },
    })
  })

  test("rejects provider secrets on the command line", () => {
    const parsed = parseHeadlessCliArgv([
      "Locus",
      HEADLESS_CLI_MARKER,
      "run",
      "--api-key",
      "sk-abcdefghijklmnopqrstuvwxyz123456",
      "--prompt",
      "Do work",
    ])

    expect(parsed).toMatchObject({
      ok: false,
      code: 2,
    })
    if (!parsed.ok) {
      expect(parsed.message).toContain("--api-key is not accepted")
    }
  })

  test("classifies unsupported runtime and invalid cwd with documented exit codes", () => {
    expect(
      parseHeadlessCliArgv([
        "Locus",
        HEADLESS_CLI_MARKER,
        "run",
        "--runtime",
        "future-runtime",
        "--prompt",
        "Do work",
      ]),
    ).toMatchObject({
      ok: false,
      code: 3,
    })

    expect(
      parseHeadlessCliArgv([
        "Locus",
        HEADLESS_CLI_MARKER,
        "run",
        "--cwd",
        "/this/path/does/not/exist",
        "--prompt",
        "Do work",
      ]),
    ).toMatchObject({
      ok: false,
      code: 7,
    })
  })

  test("parses jobs commands without treating output flags as job ids", () => {
    expect(
      parseHeadlessCliArgv([
        "Locus",
        HEADLESS_CLI_MARKER,
        "jobs",
        "logs",
        "job_123",
        "--follow",
        "--output",
        "stream-json",
      ]),
    ).toMatchObject({
      ok: true,
      command: {
        kind: "jobs-logs",
        jobId: "job_123",
        follow: true,
        output: "stream-json",
      },
    })
  })
})
