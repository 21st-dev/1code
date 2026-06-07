import { describe, expect, test } from "bun:test"
import {
  inspectRuntimeControlSmokeJob,
} from "../scripts/inspect-runtime-control-smoke-job.mjs"

function createFakeDb(input: {
  job?: Record<string, any> | null
  events?: Array<Record<string, any>>
}) {
  return {
    prepare(sql: string) {
      if (sql.includes("from agent_jobs")) {
        return {
          get(jobId: string) {
            if (!input.job || input.job.id !== jobId) return undefined
            return input.job
          },
        }
      }

      if (sql.includes("from agent_job_events")) {
        return {
          all(jobId: string) {
            return (input.events ?? [])
              .filter((event) => event.job_id === jobId)
              .sort((a, b) => a.sequence - b.sequence)
          },
        }
      }

      throw new Error(`Unexpected SQL: ${sql}`)
    },
  }
}

function createPermissionPolicySnapshot(input: {
  runtimeId?: "claude-code" | "codex"
  mode?: "plan" | "agent"
  guarded?: boolean
} = {}) {
  const runtimeId = input.runtimeId ?? "claude-code"
  const mode = input.mode ?? "plan"
  const guarded = input.guarded ?? false
  const isCodex = runtimeId === "codex"
  const enforcement =
    mode === "plan"
      ? isCodex
        ? "codex-acp-plan-handler"
        : "native-plan-read-only"
      : guarded
        ? isCodex
          ? "codex-acp-guarded-handler"
          : "locus-guarded-tool-policy"
        : isCodex
          ? "codex-acp-agent-auto"
          : "locus-agent-full-access"

  return {
    runtimeId,
    mode,
    guarded,
    enforcement,
    planWorkspaceSideEffects: mode === "plan" ? "deny" : "not-applicable",
    allowedLocusPersistence: true,
    blockedSideEffects:
      mode === "plan"
        ? [
            "workspace-file-write",
            "side-effecting-shell",
            "mcp-configuration",
            "runtime-configuration",
            "provider-configuration",
          ]
        : [],
    requiresPreExecutionEnforcement: mode === "plan" || guarded,
    runtimeMapping: isCodex
      ? {
          runtime: "codex",
          adapterSource: "acp-temporary-compat",
          acpMode: mode === "plan" ? "read-only" : "auto",
          requiresPermissionHandler: mode === "plan" || guarded,
        }
      : {
          runtime: "claude-code",
          sdkPermissionMode: mode === "plan" ? "plan" : "bypassPermissions",
          allowDangerouslySkipPermissions: mode !== "plan",
          requiresToolPolicy: mode === "plan" || guarded,
          bypassReason: null,
        },
    diagnostics: ["Permission policy evidence"],
  }
}

function createJob(overrides: Record<string, any> = {}) {
  const runtime = overrides.runtime ?? "claude-code"
  const mode = overrides.mode ?? "plan"
  const guarded = overrides.guarded ?? false
  return {
    id: "job-1",
    source: "desktop",
    runtime,
    status: "succeeded",
    mode,
    cwd: "/repo",
    project_id: "project-1",
    chat_id: "chat-1",
    sub_chat_id: "sub-chat-1",
    input_json: JSON.stringify({
      runId: "run-1",
      permissionPolicy: createPermissionPolicySnapshot({
        runtimeId: runtime,
        mode,
        guarded,
      }),
    }),
    result_json: JSON.stringify({ ok: true }),
    error_message: null,
    ...overrides,
  }
}

function createEvent(input: {
  sequence: number
  type: string
  runtimeId?: string
  payload?: Record<string, any>
}) {
  return {
    id: `event-${input.sequence}`,
    job_id: "job-1",
    sequence: input.sequence,
    type: input.type,
    payload_json: JSON.stringify({
      runId: "run-1",
      runtimeId: input.runtimeId ?? "claude-code",
      runEventSequence: input.sequence,
      redaction: { status: "redacted" },
      payload: input.payload ?? { status: input.type },
    }),
    created_at: Date.now(),
  }
}

function createAdapterStartedEvent(input: {
  sequence: number
  runtimeId?: string
  adapterSource?: string
  attempt?: number | null
}) {
  return createEvent({
    sequence: input.sequence,
    type: "status",
    runtimeId: input.runtimeId,
    payload: {
      status: "desktop_runtime_adapter_started",
      adapterSource: input.adapterSource ?? "claude-agent-sdk",
      adapterLabel: "Test adapter",
      attempt: Object.prototype.hasOwnProperty.call(input, "attempt")
        ? input.attempt
        : 1,
      temporaryFallback: input.adapterSource === "codex-acp-temporary-compat",
      fallbackReason: null,
    },
  })
}

function createBootstrapStatusEvent() {
  return {
    id: "event-1",
    job_id: "job-1",
    sequence: 1,
    type: "status",
    payload_json: JSON.stringify({
      status: "desktop_chat_stream_started",
      runtime: "claude-code",
      mode: "plan",
      runId: "run-1",
    }),
    created_at: Date.now(),
  }
}

describe("runtime control smoke job inspector", () => {
  test("accepts a desktop job with ordered redacted semantic events", () => {
    const db = createFakeDb({
      job: createJob(),
      events: [
        createBootstrapStatusEvent(),
        createAdapterStartedEvent({ sequence: 2 }),
        createEvent({ sequence: 3, type: "completed" }),
      ],
    })

    const result = inspectRuntimeControlSmokeJob({
      db,
      jobId: "job-1",
      scenarioId: "claude-plan",
    })

    expect(result.ok).toBe(true)
    expect(result.failures).toEqual([])
    expect(result.summary?.job).toMatchObject({
      id: "job-1",
      source: "desktop",
      runtime: "claude-code",
      mode: "plan",
      status: "succeeded",
      adapterSource: "claude-agent-sdk",
    })
    expect(result.summary?.events).toHaveLength(3)
  })

  test("requires guard evidence for guarded scenarios", () => {
    const db = createFakeDb({
      job: createJob({
        runtime: "codex",
        mode: "agent",
        guarded: true,
      }),
      events: [
        createAdapterStartedEvent({
          sequence: 1,
          runtimeId: "codex",
          adapterSource: "codex-acp-temporary-compat",
        }),
        createEvent({ sequence: 2, type: "completed", runtimeId: "codex" }),
      ],
    })

    const result = inspectRuntimeControlSmokeJob({
      db,
      jobId: "job-1",
      scenarioId: "codex-temporary-compat-guard",
    })

    expect(result.ok).toBe(false)
    expect(result.failures.join("\n")).toContain("guard scenario is missing")
  })

  test("rejects unredacted secret-like payloads", () => {
    const db = createFakeDb({
      job: createJob(),
      events: [
        createAdapterStartedEvent({ sequence: 1 }),
        createEvent({
          sequence: 2,
          type: "completed",
          payload: { authorization: "Bearer secret-token" },
        }),
      ],
    })

    const result = inspectRuntimeControlSmokeJob({
      db,
      jobId: "job-1",
      scenarioId: "claude-plan",
    })

    expect(result.ok).toBe(false)
    expect(result.failures.join("\n")).toContain(
      "unredacted secret-like payload",
    )
  })

  test("requires the scenario adapter source in semantic trace", () => {
    const db = createFakeDb({
      job: createJob(),
      events: [
        createEvent({ sequence: 1, type: "status" }),
        createEvent({ sequence: 2, type: "completed" }),
      ],
    })

    const result = inspectRuntimeControlSmokeJob({
      db,
      jobId: "job-1",
      scenarioId: "claude-plan",
    })

    expect(result.ok).toBe(false)
    expect(result.failures.join("\n")).toContain(
      "semantic trace is missing desktop runtime adapter source event",
    )
  })

  test("rejects a semantic trace with the wrong adapter source", () => {
    const db = createFakeDb({
      job: createJob(),
      events: [
        createAdapterStartedEvent({
          sequence: 1,
          adapterSource: "codex-acp-temporary-compat",
        }),
        createEvent({ sequence: 2, type: "completed" }),
      ],
    })

    const result = inspectRuntimeControlSmokeJob({
      db,
      jobId: "job-1",
      scenarioId: "claude-plan",
    })

    expect(result.ok).toBe(false)
    expect(result.failures.join("\n")).toContain(
      "expected adapter source claude-agent-sdk, got codex-acp-temporary-compat",
    )
  })

  test("requires adapter attempt evidence in semantic trace", () => {
    const db = createFakeDb({
      job: createJob(),
      events: [
        createAdapterStartedEvent({
          sequence: 1,
          attempt: null,
        }),
        createEvent({ sequence: 2, type: "completed" }),
      ],
    })

    const result = inspectRuntimeControlSmokeJob({
      db,
      jobId: "job-1",
      scenarioId: "claude-plan",
    })

    expect(result.ok).toBe(false)
    expect(result.failures.join("\n")).toContain(
      "expected adapter attempt to be a positive integer",
    )
  })

  test("requires persisted permission policy evidence", () => {
    const db = createFakeDb({
      job: createJob({
        input_json: JSON.stringify({ runId: "run-1" }),
      }),
      events: [
        createAdapterStartedEvent({ sequence: 1 }),
        createEvent({ sequence: 2, type: "completed" }),
      ],
    })

    const result = inspectRuntimeControlSmokeJob({
      db,
      jobId: "job-1",
      scenarioId: "claude-plan",
    })

    expect(result.ok).toBe(false)
    expect(result.failures.join("\n")).toContain(
      "job input_json is missing permissionPolicy evidence",
    )
  })
})
