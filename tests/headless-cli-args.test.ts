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

  test("parses daemon enqueue, source filtering, and daemon run commands", () => {
    expect(
      parseHeadlessCliArgv([
        "Locus",
        HEADLESS_CLI_MARKER,
        "run",
        "--daemon",
        "--follow",
        "--runtime",
        "codex",
        "--cwd",
        process.cwd(),
        "--output",
        "stream-json",
        "--prompt",
        "Queue this work",
      ]),
    ).toMatchObject({
      ok: true,
      command: {
        kind: "run",
        daemon: true,
        follow: true,
        runtime: "codex",
        output: "stream-json",
      },
    })

    expect(
      parseHeadlessCliArgv([
        "Locus",
        HEADLESS_CLI_MARKER,
        "jobs",
        "list",
        "--source",
        "daemon",
        "--output",
        "json",
      ]),
    ).toMatchObject({
      ok: true,
      command: {
        kind: "jobs-list",
        source: "daemon",
        output: "json",
      },
    })

    expect(
      parseHeadlessCliArgv([
        "Locus",
        HEADLESS_CLI_MARKER,
        "daemon",
        "run",
        "--once",
        "--concurrency",
        "2",
        "--poll-interval-ms",
        "250",
        "--output",
        "json",
      ]),
    ).toMatchObject({
      ok: true,
      command: {
        kind: "daemon-run",
        once: true,
        concurrency: 2,
        pollIntervalMs: 250,
        output: "json",
      },
    })
  })

  test("parses schedule commands", () => {
    expect(
      parseHeadlessCliArgv([
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
        "Inspect",
        "--output",
        "json",
      ]),
    ).toMatchObject({
      ok: true,
      command: {
        kind: "schedules-create",
        name: "Nightly",
        runtime: "codex",
        mode: "plan",
        intervalSeconds: 300,
        output: "json",
      },
    })

    expect(
      parseHeadlessCliArgv([
        "Locus",
        HEADLESS_CLI_MARKER,
        "schedules",
        "list",
        "--status",
        "paused",
        "--include-disabled",
        "--output",
        "json",
      ]),
    ).toMatchObject({
      ok: true,
      command: {
        kind: "schedules-list",
        status: "paused",
        includeDisabled: true,
      },
    })

    expect(
      parseHeadlessCliArgv([
        "Locus",
        HEADLESS_CLI_MARKER,
        "schedules",
        "create",
        "--name",
        "Plan by default",
        "--cwd",
        process.cwd(),
        "--prompt",
        "Inspect",
      ]),
    ).toMatchObject({
      ok: true,
      command: {
        kind: "schedules-create",
        mode: "plan",
      },
    })

    expect(
      parseHeadlessCliArgv([
        "Locus",
        HEADLESS_CLI_MARKER,
        "schedules",
        "run-now",
        "schedule-1",
      ]),
    ).toMatchObject({
      ok: true,
      command: {
        kind: "schedules-run",
        scheduleId: "schedule-1",
      },
    })
  })

  test("parses acp stdio command", () => {
    expect(
      parseHeadlessCliArgv([
        "Locus",
        HEADLESS_CLI_MARKER,
        "acp",
      ]),
    ).toMatchObject({
      ok: true,
      command: {
        kind: "acp",
      },
    })
  })

  test("rejects follow without daemon enqueue", () => {
    const parsed = parseHeadlessCliArgv([
      "Locus",
      HEADLESS_CLI_MARKER,
      "run",
      "--follow",
      "--prompt",
      "Do work",
    ])
    expect(parsed).toMatchObject({
      ok: false,
      code: 2,
    })
    if (!parsed.ok) expect(parsed.message).toContain("--follow")
  })
})
