import { existsSync } from "fs"
import { resolve } from "path"
import {
  AGENT_JOB_MODES,
  AGENT_JOB_SOURCES,
  type AgentJobMode,
  type AgentJobSource,
} from "../../../shared/agent-jobs"
import {
  AGENT_RUNTIME_IDS,
  toAgentRuntimeId,
  type AgentRuntimeId,
} from "../../../shared/agent-runtime-capabilities"
import {
  AGENT_SCHEDULE_STATUSES,
  MAX_AGENT_SCHEDULE_INTERVAL_SECONDS,
  type AgentScheduleStatus,
} from "../../../shared/agent-schedules"

export const HEADLESS_CLI_MARKER = "--locus-headless-cli"

export const HEADLESS_OUTPUT_FORMATS = ["text", "json", "stream-json"] as const

export type HeadlessOutputFormat = (typeof HEADLESS_OUTPUT_FORMATS)[number]

export type HeadlessJobSourceFilter = AgentJobSource | "all"

export type HeadlessCliCommand =
  | {
      kind: "run"
      cwd: string
      runtime: AgentRuntimeId
      mode: AgentJobMode
      prompt: string
      stdin: boolean
      daemon: boolean
      follow: boolean
      output: HeadlessOutputFormat
    }
  | {
      kind: "jobs-list"
      source: HeadlessJobSourceFilter
      output: HeadlessOutputFormat
    }
  | {
      kind: "jobs-show"
      jobId: string
      output: HeadlessOutputFormat
    }
  | {
      kind: "jobs-logs"
      jobId: string
      follow: boolean
      output: HeadlessOutputFormat
    }
  | {
      kind: "jobs-cancel"
      jobId: string
      output: HeadlessOutputFormat
    }
  | {
      kind: "jobs-retry"
      jobId: string
      output: HeadlessOutputFormat
    }
  | {
      kind: "daemon-run"
      once: boolean
      concurrency: number
      pollIntervalMs: number
      output: HeadlessOutputFormat
    }
  | {
      kind: "schedules-list"
      includeDisabled: boolean
      status: AgentScheduleStatus | null
      output: HeadlessOutputFormat
    }
  | {
      kind: "schedules-create"
      name: string
      cwd: string
      runtime: AgentRuntimeId
      mode: AgentJobMode
      prompt: string
      intervalSeconds: number
      output: HeadlessOutputFormat
    }
  | {
      kind:
        | "schedules-pause"
        | "schedules-resume"
        | "schedules-delete"
        | "schedules-run"
      scheduleId: string
      output: HeadlessOutputFormat
    }
  | {
      kind: "help"
      output: "text"
    }

export type ParsedHeadlessCli =
  | { ok: true; command: HeadlessCliCommand }
  | { ok: false; code: number; message: string }

export function isHeadlessCliInvocation(argv = process.argv): boolean {
  return argv.includes(HEADLESS_CLI_MARKER)
}

function argsAfterMarker(argv: string[]): string[] {
  const markerIndex = argv.indexOf(HEADLESS_CLI_MARKER)
  if (markerIndex >= 0) return argv.slice(markerIndex + 1)
  return argv.slice(process.defaultApp ? 2 : 1)
}

function takeOption(args: string[], name: string): string | null {
  const index = args.indexOf(name)
  if (index < 0) return null
  const value = args[index + 1]
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`)
  }
  args.splice(index, 2)
  return value
}

function takeFlag(args: string[], name: string): boolean {
  const index = args.indexOf(name)
  if (index < 0) return false
  args.splice(index, 1)
  return true
}

function parseOutput(args: string[]): HeadlessOutputFormat {
  const output = takeOption(args, "--output") ?? "text"
  if (!(HEADLESS_OUTPUT_FORMATS as readonly string[]).includes(output)) {
    throw new Error(`Unsupported --output: ${output}`)
  }
  return output as HeadlessOutputFormat
}

function parseMode(value: string | null): AgentJobMode {
  const mode = value ?? "agent"
  if (!(AGENT_JOB_MODES as readonly string[]).includes(mode)) {
    throw new Error(`Unsupported --mode: ${mode}`)
  }
  return mode as AgentJobMode
}

function parseRuntime(value: string | null): AgentRuntimeId {
  const runtime = toAgentRuntimeId(value ?? "claude-code")
  if (!runtime || !(AGENT_RUNTIME_IDS as readonly string[]).includes(runtime)) {
    throw new Error(`Unsupported --runtime: ${value ?? "claude-code"}`)
  }
  return runtime
}

function parseJobSource(value: string | null): HeadlessJobSourceFilter {
  const source = value ?? "all"
  if (source === "all") return "all"
  if (!(AGENT_JOB_SOURCES as readonly string[]).includes(source)) {
    throw new Error(`Unsupported --source: ${source}`)
  }
  return source as AgentJobSource
}

function parseScheduleStatus(value: string | null): AgentScheduleStatus | null {
  if (!value) return null
  if (!(AGENT_SCHEDULE_STATUSES as readonly string[]).includes(value)) {
    throw new Error(`Unsupported --status: ${value}`)
  }
  return value as AgentScheduleStatus
}

function parsePositiveInteger(
  value: string | null,
  fallback: number,
  name: string,
  max: number,
): number {
  const raw = value ?? String(fallback)
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a positive integer`)
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
    throw new Error(`${name} must be between 1 and ${max}`)
  }
  return parsed
}

function parseCwd(value: string | null): string {
  const cwd = resolve(value ?? process.cwd())
  if (!existsSync(cwd)) {
    throw new Error(`Invalid or inaccessible cwd: ${cwd}`)
  }
  return cwd
}

function rejectSecretFlags(args: string[]): void {
  const forbidden = [
    "--api-key",
    "--token",
    "--auth-token",
    "--access-token",
    "--refresh-token",
  ]
  const flag = args.find((arg) => forbidden.includes(arg))
  if (flag) {
    throw new Error(`${flag} is not accepted. Use stored provider credentials.`)
  }
}

function errorCodeForParseMessage(message: string): number {
  if (message.startsWith("Invalid or inaccessible cwd:")) return 7
  if (
    message.startsWith("Unsupported --runtime:") ||
    message.startsWith("Unsupported --mode:") ||
    message.startsWith("Unsupported --source:") ||
    message.startsWith("Unsupported --status:")
  ) {
    return 3
  }
  return 2
}

export function parseHeadlessCliArgv(argv = process.argv): ParsedHeadlessCli {
  const args = argsAfterMarker(argv)
  try {
    rejectSecretFlags(args)
    const command = args.shift()
    if (!command || command === "help" || command === "--help" || command === "-h") {
      return { ok: true, command: { kind: "help", output: "text" } }
    }

    if (command === "run") {
      const stdin = takeFlag(args, "--stdin")
      const daemon = takeFlag(args, "--daemon")
      const follow = takeFlag(args, "--follow")
      const output = parseOutput(args)
      const cwd = parseCwd(takeOption(args, "--cwd"))
      const runtime = parseRuntime(takeOption(args, "--runtime"))
      const mode = parseMode(takeOption(args, "--mode"))
      const prompt = takeOption(args, "--prompt") ?? ""
      if (follow && !daemon) {
        throw new Error("--follow can only be used with --daemon")
      }
      if (!stdin && !prompt.trim()) {
        throw new Error("locus run requires --prompt or --stdin")
      }
      if (args.length > 0) {
        throw new Error(`Unexpected arguments: ${args.join(" ")}`)
      }
      return {
        ok: true,
        command: {
          kind: "run",
          cwd,
          runtime,
          mode,
          prompt,
          stdin,
          daemon,
          follow,
          output,
        },
      }
    }

    if (command === "jobs") {
      const subcommand = args.shift() ?? "list"
      const follow = takeFlag(args, "--follow")
      const output = parseOutput(args)
      if (subcommand === "list") {
        const source = parseJobSource(takeOption(args, "--source"))
        if (args.length > 0) {
          throw new Error(`Unexpected arguments: ${args.join(" ")}`)
        }
        return { ok: true, command: { kind: "jobs-list", source, output } }
      }
      const jobId = args.shift()
      if (!jobId) throw new Error(`locus jobs ${subcommand} requires a job id`)
      if (args.length > 0) {
        throw new Error(`Unexpected arguments: ${args.join(" ")}`)
      }
      if (subcommand === "show") {
        return { ok: true, command: { kind: "jobs-show", jobId, output } }
      }
      if (subcommand === "logs") {
        return { ok: true, command: { kind: "jobs-logs", jobId, follow, output } }
      }
      if (subcommand === "cancel") {
        return { ok: true, command: { kind: "jobs-cancel", jobId, output } }
      }
      if (subcommand === "retry") {
        return { ok: true, command: { kind: "jobs-retry", jobId, output } }
      }
      throw new Error(`Unknown jobs subcommand: ${subcommand}`)
    }

    if (command === "daemon") {
      const subcommand = args.shift() ?? "run"
      if (subcommand !== "run") {
        throw new Error(`Unknown daemon subcommand: ${subcommand}`)
      }
      const once = takeFlag(args, "--once")
      const output = parseOutput(args)
      const concurrency = parsePositiveInteger(
        takeOption(args, "--concurrency"),
        1,
        "--concurrency",
        16,
      )
      const pollIntervalMs = parsePositiveInteger(
        takeOption(args, "--poll-interval-ms"),
        1000,
        "--poll-interval-ms",
        60_000,
      )
      if (args.length > 0) {
        throw new Error(`Unexpected arguments: ${args.join(" ")}`)
      }
      return {
        ok: true,
        command: {
          kind: "daemon-run",
          once,
          concurrency,
          pollIntervalMs,
          output,
        },
      }
    }

    if (command === "schedules" || command === "schedule") {
      const subcommand = args.shift() ?? "list"
      const output = parseOutput(args)
      if (subcommand === "list") {
        const includeDisabled = takeFlag(args, "--include-disabled")
        const status = parseScheduleStatus(takeOption(args, "--status"))
        if (args.length > 0) {
          throw new Error(`Unexpected arguments: ${args.join(" ")}`)
        }
        return {
          ok: true,
          command: {
            kind: "schedules-list",
            includeDisabled,
            status,
            output,
          },
        }
      }
      if (subcommand === "create") {
        const cwd = parseCwd(takeOption(args, "--cwd"))
        const runtime = parseRuntime(takeOption(args, "--runtime"))
        const mode = parseMode(takeOption(args, "--mode"))
        const name = takeOption(args, "--name") ?? ""
        const prompt = takeOption(args, "--prompt") ?? ""
        const intervalSeconds = parsePositiveInteger(
          takeOption(args, "--interval-seconds"),
          3600,
          "--interval-seconds",
          MAX_AGENT_SCHEDULE_INTERVAL_SECONDS,
        )
        if (!name.trim()) throw new Error("locus schedules create requires --name")
        if (!prompt.trim()) {
          throw new Error("locus schedules create requires --prompt")
        }
        if (args.length > 0) {
          throw new Error(`Unexpected arguments: ${args.join(" ")}`)
        }
        return {
          ok: true,
          command: {
            kind: "schedules-create",
            name,
            cwd,
            runtime,
            mode,
            prompt,
            intervalSeconds,
            output,
          },
        }
      }
      if (
        subcommand === "pause" ||
        subcommand === "resume" ||
        subcommand === "delete" ||
        subcommand === "run" ||
        subcommand === "run-now"
      ) {
        const scheduleId = args.shift()
        if (!scheduleId) {
          throw new Error(`locus schedules ${subcommand} requires a schedule id`)
        }
        if (args.length > 0) {
          throw new Error(`Unexpected arguments: ${args.join(" ")}`)
        }
        return {
          ok: true,
          command: {
            kind:
              subcommand === "run-now"
                ? "schedules-run"
                : (`schedules-${subcommand}` as
                    | "schedules-pause"
                    | "schedules-resume"
                    | "schedules-delete"
                    | "schedules-run"),
            scheduleId,
            output,
          },
        }
      }
      throw new Error(`Unknown schedules subcommand: ${subcommand}`)
    }

    throw new Error(`Unknown command: ${command}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      code: errorCodeForParseMessage(message),
      message,
    }
  }
}
