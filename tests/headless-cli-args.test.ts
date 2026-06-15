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

  test("redacts secret-like CLI values from parse errors", () => {
    const directFlag = parseHeadlessCliArgv([
      "Locus",
      HEADLESS_CLI_MARKER,
      "run",
      "--api-key=sk-abcdefghijklmnopqrstuvwxyz123456",
      "--prompt",
      "Do work",
    ])

    expect(directFlag).toMatchObject({
      ok: false,
      code: 2,
    })
    if (!directFlag.ok) {
      expect(directFlag.message).toContain("--api-key is not accepted")
      expect(directFlag.message).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456")
    }

    const unexpectedArg = parseHeadlessCliArgv([
      "Locus",
      HEADLESS_CLI_MARKER,
      "jobs",
      "show",
      "job_123",
      "sk-abcdefghijklmnopqrstuvwxyz123456",
    ])

    expect(unexpectedArg).toMatchObject({
      ok: false,
      code: 2,
    })
    if (!unexpectedArg.ok) {
      expect(unexpectedArg.message).toContain("[redacted-argument]")
      expect(unexpectedArg.message).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456")
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

  test("parses Local Job API commands", () => {
    expect(
      parseHeadlessCliArgv([
        "Locus",
        HEADLESS_CLI_MARKER,
        "api",
        "runtimes",
        "list",
        "--json",
      ]),
    ).toMatchObject({
      ok: true,
      command: { kind: "api-runtimes-list" },
    })

    expect(
      parseHeadlessCliArgv([
        "Locus",
        HEADLESS_CLI_MARKER,
        "api",
        "projects",
        "register",
        "--cwd",
        process.cwd(),
        "--name",
        "Current Project",
        "--json",
      ]),
    ).toMatchObject({
      ok: true,
      command: {
        kind: "api-projects-register",
        cwd: process.cwd(),
        name: "Current Project",
      },
    })

    expect(
      parseHeadlessCliArgv([
        "Locus",
        HEADLESS_CLI_MARKER,
        "api",
        "projects",
        "status",
        "--cwd",
        process.cwd(),
        "--json",
      ]),
    ).toMatchObject({
      ok: true,
      command: {
        kind: "api-projects-status",
        cwd: process.cwd(),
      },
    })

    expect(
      parseHeadlessCliArgv([
        "Locus",
        HEADLESS_CLI_MARKER,
        "api",
        "projects",
        "unregister",
        "--cwd",
        process.cwd(),
        "--force",
        "--json",
      ]),
    ).toMatchObject({
      ok: true,
      command: {
        kind: "api-projects-unregister",
        cwd: process.cwd(),
        force: true,
      },
    })

    expect(
      parseHeadlessCliArgv([
        "Locus",
        HEADLESS_CLI_MARKER,
        "api",
        "runs",
        "create",
        "--request",
        "-",
        "--json",
      ]),
    ).toMatchObject({
      ok: true,
      command: { kind: "api-runs-create", requestPath: "-" },
    })

    expect(
      parseHeadlessCliArgv([
        "Locus",
        HEADLESS_CLI_MARKER,
        "api",
        "runs",
        "events",
        "job_123",
        "--after",
        "4",
        "--follow",
        "--jsonl",
      ]),
    ).toMatchObject({
      ok: true,
      command: {
        kind: "api-runs-events",
        jobId: "job_123",
        afterSequence: 4,
        follow: true,
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
