import { describe, expect, mock, test } from "bun:test"
import type { AgentRuntimeCapabilityId } from "../src/shared/agent-runtime-capabilities"
import {
  createAgentRuntimeRunRequest,
  type AgentRuntimeObserver,
  type CreateAgentRuntimeRunRequestInput,
} from "../src/main/lib/headless/agent-runtime-contract"

const adapterRunCalls = {
  codex: 0,
  claude: 0,
  appServer: 0,
}

mock.module("electron", () => ({
  app: {
    isPackaged: false,
    getAppPath() {
      return process.cwd()
    },
  },
}))

mock.module("../src/main/lib/headless/adapters/codex", () => ({
  async runCodexHeadlessTask() {
    adapterRunCalls.codex += 1
    return { status: "completed", exitCode: 0 }
  },
}))

mock.module("../src/main/lib/headless/adapters/codex-app-server", () => ({
  async runCodexAppServerHeadlessTask() {
    adapterRunCalls.appServer += 1
    return {
      status: "succeeded",
      exitCode: 0,
      result: {
        adapterSource: "codex-app-server",
      },
    }
  },
}))

mock.module("../src/main/lib/headless/adapters/claude-code", () => ({
  async runClaudeCodeHeadlessTask() {
    adapterRunCalls.claude += 1
    return { status: "completed", exitCode: 0 }
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
        policyGrantEnforcement: "sandbox-level",
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

  test("selects Codex app-server only for explicit policy-grant runs", () => {
    const selection = selectAgentRuntimeAdapter(
      request({
        runtime: "codex",
        source: "api",
        executionProfile: "policy-grant",
        policyGrant: {
          scopes: ["workspace:file-write"],
        },
      }),
    )

    expect(selection).toMatchObject({
      ok: true,
      adapter: {
        id: "codex",
        sourceId: "codex-app-server",
        executionProfile: "policy-grant",
        requiresInteraction: false,
        policyGrantEnforcement: "admission-audit",
      },
      diagnostic: {
        status: "selected",
        runtime: "codex",
        source: "api",
        adapterSource: "codex-app-server",
        executionProfile: "policy-grant",
        fallbackReason: null,
        policyGrantScopeBinding: "admission-audit-only",
      },
    })
    if (selection.ok) {
      expect(selection.diagnostic.message).toContain(
        "declared policy grant scopes are admission/audit metadata",
      )
    }
  })

  test("runs selected Codex app-server adapter for policy-grant jobs", async () => {
    adapterRunCalls.appServer = 0
    const { observer: runtimeObserver, events } = observer()
    const result = await runAgentTask(
      request({
        runtime: "codex",
        source: "api",
        executionProfile: "policy-grant",
        policyGrant: {
          scopes: ["workspace:file-write"],
        },
      }),
      runtimeObserver,
    )

    expect(adapterRunCalls.appServer).toBe(1)
    expect(result).toMatchObject({
      status: "succeeded",
      result: {
        adapterSource: "codex-app-server",
      },
    })
    expect(events).toEqual([
      {
        type: "status",
        payload: {
          status: "runtime_selected",
          runtime: "codex",
          label: "Codex",
          source: "api",
          adapterSource: "codex-app-server",
          executionProfile: "policy-grant",
          fallbackReason: null,
          policyGrantScopeBinding: "admission-audit-only",
        },
      },
    ])
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
        policyGrantEnforcement: "sandbox-level",
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
    adapterRunCalls.codex = 0
    const { observer: runtimeObserver, events } = observer()
    const result = await runAgentTask(
      request({ runtime: "codex", executionProfile: "interactive" }),
      runtimeObserver,
    )

    expect(adapterRunCalls.codex).toBe(0)
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
    adapterRunCalls.codex = 0
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

    expect(adapterRunCalls.codex).toBe(0)
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

  test("refuses guarded scope on batch adapters without claiming hard guard enforcement", async () => {
    adapterRunCalls.codex = 0
    const { observer: runtimeObserver, events } = observer()
    const result = await runAgentTask(
      request({
        runtime: "codex",
        hasScopeContract: true,
      }),
      runtimeObserver,
    )

    expect(adapterRunCalls.codex).toBe(0)
    expect(result).toMatchObject({
      status: "failed",
      exitCode: 1,
      errorCode: "guarded_scope_requires_pre_execution_hook",
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
          reason: "guarded_scope_requires_pre_execution_hook",
          message:
            "Codex headless/batch exposes only sandbox-level enforcement for this headless adapter; guarded scope contracts require a pre-execution hook or must fail closed before provider work.",
          errorCode: "guarded_scope_requires_pre_execution_hook",
        },
      },
    ])
  })

  test("refuses policy-grant profile on batch adapters without per-scope hook support", async () => {
    adapterRunCalls.claude = 0
    const { observer: runtimeObserver, events } = observer()
    const result = await runAgentTask(
      request({
        runtime: "claude-code",
        executionProfile: "policy-grant",
        policyGrant: {
          scopes: ["workspace:file-write"],
        },
      }),
      runtimeObserver,
    )

    expect(adapterRunCalls.claude).toBe(0)
    expect(result).toMatchObject({
      status: "failed",
      exitCode: 1,
      errorCode: "policy_grant_adapter_unavailable",
    })
    expect(events).toEqual([
      {
        type: "status",
        payload: {
          status: "runtime_selection_refused",
          runtime: "claude-code",
          source: "api",
          adapterSource: "claude-code-batch",
          executionProfile: "policy-grant",
          reason: "policy_grant_adapter_unavailable",
          message:
            "Claude Code batch exposes only sandbox-level enforcement for this headless adapter; policy-grant execution requires an app-server admission gate or true pre-execution scope binding before provider work.",
          errorCode: "policy_grant_adapter_unavailable",
        },
      },
    ])
  })
})
