import { describe, expect, mock, test } from "bun:test"
import type { AgentRuntimeCapabilityId } from "../src/shared/agent-runtime-capabilities"
import {
  createAgentRuntimeRunRequest,
  type AgentRuntimeObserver,
  type CreateAgentRuntimeRunRequestInput,
} from "../src/main/lib/headless/agent-runtime-contract"

mock.module("electron", () => ({
  app: {
    isPackaged: false,
    getAppPath() {
      return process.cwd()
    },
  },
}))

const { selectAgentRuntimeAdapter } = await import(
  "../src/main/lib/headless/adapter-selector"
)
const { runAgentTask } = await import("../src/main/lib/headless/agent-runtime")

const baseInput = {
  jobId: "job-selector",
  runtime: "codex" as const,
  cwd: "/tmp/project",
  mode: "agent" as const,
  source: "api" as const,
  prompt: "Run a selector test",
  signal: new AbortController().signal,
} satisfies CreateAgentRuntimeRunRequestInput

function request(overrides: Partial<CreateAgentRuntimeRunRequestInput> = {}) {
  return createAgentRuntimeRunRequest({
    ...baseInput,
    ...overrides,
  })
}

function requestWithCapabilities(input: {
  runtime?: CreateAgentRuntimeRunRequestInput["runtime"]
  requestedCapabilities: AgentRuntimeCapabilityId[]
}) {
  return {
    ...request({ runtime: input.runtime ?? "codex" }),
    requestedCapabilities: input.requestedCapabilities,
  }
}

function observer() {
  const events: Array<{ type: string; payload: unknown }> = []
  const nextObserver: AgentRuntimeObserver = {
    appendEvent(type, payload) {
      events.push({ type, payload })
      return {
        id: `event-${events.length}`,
        jobId: "job-selector",
        sequence: events.length,
        type,
        payloadJson: JSON.stringify(payload ?? {}),
        createdAt: new Date("2026-06-15T00:00:00.000Z"),
      }
    },
    heartbeat() {
      return { id: "job-selector", status: "running" } as any
    },
    isCancelRequested() {
      return false
    },
  }
  return { observer: nextObserver, events }
}

describe("headless adapter selector", () => {
  test("selects Codex batch for Local Job API runs by default", () => {
    const selection = selectAgentRuntimeAdapter(
      request({ runtime: "codex", source: "api" }),
    )

    expect(selection).toMatchObject({
      ok: true,
      adapter: {
        id: "codex",
        sourceId: "codex-batch",
        executionProfile: "batch",
        requiresInteraction: false,
      },
      diagnostic: {
        status: "selected",
        runtime: "codex",
        source: "api",
        adapterSource: "codex-batch",
        executionProfile: "batch",
        fallbackReason: null,
      },
    })
  })

  test("selects Claude batch for daemon runs by default", () => {
    const selection = selectAgentRuntimeAdapter(
      request({ runtime: "claude-code", source: "daemon" }),
    )

    expect(selection).toMatchObject({
      ok: true,
      adapter: {
        id: "claude-code",
        sourceId: "claude-code-batch",
        executionProfile: "batch",
        requiresInteraction: false,
      },
      diagnostic: {
        status: "selected",
        runtime: "claude-code",
        source: "daemon",
        adapterSource: "claude-code-batch",
        executionProfile: "batch",
      },
    })
  })

  test("refuses unsupported requested capabilities before provider work", () => {
    const selection = selectAgentRuntimeAdapter(
      requestWithCapabilities({
        runtime: "codex",
        requestedCapabilities: ["rollback"],
      }),
    )

    expect(selection).toMatchObject({
      ok: false,
      diagnostic: {
        type: "unsupported-capability",
        status: "refused",
        runtime: "codex",
        adapterSource: "codex-batch",
        reason: "unsupported_capability",
        capability: {
          type: "unsupported-capability",
          runtimeId: "codex",
          capability: "rollback",
        },
      },
      result: {
        status: "failed",
        exitCode: 1,
        errorCode: "unsupported_capability",
      },
    })
    if (!selection.ok) {
      expect(selection.diagnostic.message).not.toMatch(/token|authorization/i)
    }
  })

  test("records fallback diagnostics when a preferred adapter source is unavailable", () => {
    const selection = selectAgentRuntimeAdapter(
      request({ runtime: "codex", source: "api" }),
      { preferredAdapterSource: "codex-interactive" },
    )

    expect(selection).toMatchObject({
      ok: true,
      adapter: {
        id: "codex",
        sourceId: "codex-batch",
      },
      diagnostic: {
        status: "selected",
        runtime: "codex",
        source: "api",
        adapterSource: "codex-batch",
        preferredAdapterSource: "codex-interactive",
        fallbackReason: "preferred_adapter_unavailable",
      },
    })
    if (selection.ok) {
      expect(selection.diagnostic.message).not.toMatch(/token|authorization/i)
    }
  })

  test("refuses interactive headless execution without a visible user channel", async () => {
    const { observer: runtimeObserver, events } = observer()
    const result = await runAgentTask(
      request({ runtime: "codex", executionProfile: "interactive" }),
      runtimeObserver,
    )

    expect(result).toMatchObject({
      status: "failed",
      exitCode: 1,
      errorCode: "permission_policy_fail_closed",
    })
    expect(events).toEqual([
      {
        type: "status",
        payload: {
          status: "runtime_selection_refused",
          runtime: "codex",
          source: "api",
          adapterSource: "codex-batch",
          executionProfile: "interactive",
          reason: "no_interaction_channel",
          message:
            "api agent job refused before provider work: interactive approval, AskUserQuestion, MCP elicitation, and unknown side-effect approval require a visible user channel or bounded policy grant.",
          errorCode: "permission_policy_fail_closed",
        },
      },
    ])
  })

  test("fails closed when non-desktop requests require interaction-only callbacks", async () => {
    const { observer: runtimeObserver, events } = observer()
    const result = await runAgentTask(
      request({
        runtime: "codex",
        interactiveRequirements: [
          "interactive-approval",
          "ask-user-question",
          "mcp-elicitation",
          "unknown-side-effect-approval",
        ],
      }),
      runtimeObserver,
    )

    expect(result).toMatchObject({
      status: "failed",
      exitCode: 1,
      errorCode: "permission_policy_fail_closed",
    })
    expect(events).toEqual([
      {
        type: "status",
        payload: {
          status: "runtime_selection_refused",
          runtime: "codex",
          source: "api",
          adapterSource: "codex-batch",
          executionProfile: "batch",
          reason: "no_interaction_channel",
          message:
            "api agent job refused before provider work: interactive approval, AskUserQuestion, MCP elicitation, and unknown side-effect approval require a visible user channel or bounded policy grant.",
          errorCode: "permission_policy_fail_closed",
        },
      },
    ])
  })
})
