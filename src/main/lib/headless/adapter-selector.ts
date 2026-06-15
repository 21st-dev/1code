import {
  checkAgentRuntimeCapability,
  getAgentRunRequiredCapabilityIds,
  getAgentRuntimeCapabilityManifest,
  type AgentRuntimeCapabilityDiagnostic,
  type AgentRuntimeCapabilityId,
  type AgentRuntimeCapabilityManifest,
  type AgentRuntimeId,
} from "../../../shared/agent-runtime-capabilities"
import type {
  AgentRuntimeExecutionProfile,
} from "../agent-runtime/run-contract"
import type {
  AgentRuntimeObserver,
  AgentRuntimeRunRequest,
  AgentRuntimeRunResult,
} from "./agent-runtime-contract"
import { runClaudeCodeHeadlessTask } from "./adapters/claude-code"
import { runCodexAppServerHeadlessTask } from "./adapters/codex-app-server"
import { runCodexHeadlessTask } from "./adapters/codex"

export type AgentRuntimeAdapterSourceId =
  | "claude-code-batch"
  | "codex-app-server"
  | "codex-batch"

export type AgentRuntimeAdapterPreferenceSourceId =
  | AgentRuntimeAdapterSourceId
  | "claude-code-interactive"
  | "codex-interactive"

export type AgentRuntimeAdapter = {
  id: AgentRuntimeId
  sourceId: AgentRuntimeAdapterSourceId
  executionProfile: AgentRuntimeExecutionProfile
  label: string
  requiresInteraction: false
  policyGrantEnforcement: "none" | "sandbox-level" | "pre-execution"
  manifest: AgentRuntimeCapabilityManifest
  run(
    request: AgentRuntimeRunRequest,
    observer: AgentRuntimeObserver,
  ): Promise<AgentRuntimeRunResult>
}

export type AgentRuntimeSelectionDiagnostic = {
  type: "adapter-selected" | "adapter-refused" | "unsupported-capability"
  status: "selected" | "refused"
  runtime: AgentRuntimeId
  source: AgentRuntimeRunRequest["source"]
  executionProfile: AgentRuntimeExecutionProfile
  adapterSource?: AgentRuntimeAdapterSourceId | null
  preferredAdapterSource?: AgentRuntimeAdapterPreferenceSourceId | null
  adapterLabel?: string | null
  fallbackReason?: string | null
  reason?: string
  message: string
  capability?: AgentRuntimeCapabilityDiagnostic
}

export type AgentRuntimeAdapterSelection =
  | {
      ok: true
      adapter: AgentRuntimeAdapter
      diagnostic: AgentRuntimeSelectionDiagnostic & { status: "selected" }
    }
  | {
      ok: false
      diagnostic: AgentRuntimeSelectionDiagnostic & { status: "refused" }
      result: AgentRuntimeRunResult
    }

const batchAdapters: Record<AgentRuntimeId, AgentRuntimeAdapter> = {
  "claude-code": {
    id: "claude-code",
    sourceId: "claude-code-batch",
    executionProfile: "batch",
    label: "Claude Code batch",
    requiresInteraction: false,
    policyGrantEnforcement: "sandbox-level",
    manifest: getAgentRuntimeCapabilityManifest("claude-code"),
    run: runClaudeCodeHeadlessTask,
  },
  codex: {
    id: "codex",
    sourceId: "codex-batch",
    executionProfile: "batch",
    label: "Codex headless/batch",
    requiresInteraction: false,
    policyGrantEnforcement: "sandbox-level",
    manifest: getAgentRuntimeCapabilityManifest("codex"),
    run: runCodexHeadlessTask,
  },
}

const codexAppServerAdapter: AgentRuntimeAdapter = {
  id: "codex",
  sourceId: "codex-app-server",
  executionProfile: "policy-grant",
  label: "Codex app-server",
  requiresInteraction: false,
  policyGrantEnforcement: "pre-execution",
  manifest: getAgentRuntimeCapabilityManifest("codex"),
  run: runCodexAppServerHeadlessTask,
}

function requestedExecutionProfile(
  request: AgentRuntimeRunRequest,
): AgentRuntimeExecutionProfile {
  return request.context.executionProfile ?? "batch"
}

function requestedCapabilities(
  request: AgentRuntimeRunRequest,
): AgentRuntimeCapabilityId[] {
  return [
    ...new Set([
      ...request.requestedCapabilities,
      ...getAgentRunRequiredCapabilityIds({
        mode: request.mode,
        hasScopeContract: request.context.hasScopeContract ?? false,
      }),
    ]),
  ]
}

function requiresPerScopePolicyEnforcement(
  request: AgentRuntimeRunRequest,
): boolean {
  return (
    request.permissionPolicy.kind === "policy-grant" ||
    requestedCapabilities(request).includes("hardToolGuard")
  )
}

function unsupportedCapabilityResult(
  request: AgentRuntimeRunRequest,
  adapter: AgentRuntimeAdapter,
  capability: AgentRuntimeCapabilityDiagnostic,
): AgentRuntimeAdapterSelection {
  const executionProfile = requestedExecutionProfile(request)
  return {
    ok: false,
    diagnostic: {
      type: "unsupported-capability",
      status: "refused",
      runtime: request.runtime,
      source: request.source,
      executionProfile,
      adapterSource: adapter.sourceId,
      preferredAdapterSource: null,
      adapterLabel: adapter.label,
      reason: "unsupported_capability",
      message: capability.message,
      capability,
    },
    result: {
      status: "failed",
      exitCode: 1,
      errorCode: "unsupported_capability",
      errorMessage: capability.message,
    },
  }
}

function refusedSelectionResult(input: {
  request: AgentRuntimeRunRequest
  adapter?: AgentRuntimeAdapter | null
  reason: string
  message: string
  errorCode: string
}): AgentRuntimeAdapterSelection {
  const executionProfile = requestedExecutionProfile(input.request)
  return {
    ok: false,
    diagnostic: {
      type: "adapter-refused",
      status: "refused",
      runtime: input.request.runtime,
      source: input.request.source,
      executionProfile,
      adapterSource: input.adapter?.sourceId ?? null,
      preferredAdapterSource: null,
      adapterLabel: input.adapter?.label ?? null,
      reason: input.reason,
      message: input.message,
    },
    result: {
      status: "failed",
      exitCode: 1,
      errorCode: input.errorCode,
      errorMessage: input.message,
    },
  }
}

function failClosedPermissionPolicyResult(input: {
  request: AgentRuntimeRunRequest
  adapter: AgentRuntimeAdapter
}): AgentRuntimeAdapterSelection {
  const reason =
    input.request.permissionPolicy.failClosedReasons?.[0] ??
    "permission_policy_fail_closed"
  const message =
    input.request.permissionPolicy.diagnostics[0] ??
    "Non-desktop permission policy failed closed before provider work."
  return refusedSelectionResult({
    request: input.request,
    adapter: input.adapter,
    reason,
    errorCode: "permission_policy_fail_closed",
    message,
  })
}

function unsupportedPolicyGrantEnforcementResult(input: {
  request: AgentRuntimeRunRequest
  adapter: AgentRuntimeAdapter
}): AgentRuntimeAdapterSelection {
  return refusedSelectionResult({
    request: input.request,
    adapter: input.adapter,
    reason: "policy_grant_requires_pre_execution_hook",
    errorCode: "policy_grant_requires_pre_execution_hook",
    message: `${input.adapter.label} exposes only ${input.adapter.policyGrantEnforcement} enforcement for this headless adapter; per-scope policy grants and guarded scope contracts require a pre-execution hook or must fail closed before provider work.`,
  })
}

export function getAgentRuntimeAdapter(
  runtime: AgentRuntimeId,
): AgentRuntimeAdapter {
  return batchAdapters[runtime]
}

function selectCandidateAdapter(input: {
  request: AgentRuntimeRunRequest
  executionProfile: AgentRuntimeExecutionProfile
}): AgentRuntimeAdapter {
  if (
    input.request.runtime === "codex" &&
    input.executionProfile === "policy-grant"
  ) {
    return codexAppServerAdapter
  }
  return getAgentRuntimeAdapter(input.request.runtime)
}

export type SelectAgentRuntimeAdapterOptions = {
  preferredAdapterSource?: AgentRuntimeAdapterPreferenceSourceId | null
}

function fallbackReasonFor(input: {
  adapter: AgentRuntimeAdapter
  preferredAdapterSource?: AgentRuntimeAdapterPreferenceSourceId | null
}): string | null {
  if (!input.preferredAdapterSource) return null
  if (input.preferredAdapterSource === input.adapter.sourceId) return null
  return "preferred_adapter_unavailable"
}

export function selectAgentRuntimeAdapter(
  request: AgentRuntimeRunRequest,
  options: SelectAgentRuntimeAdapterOptions = {},
): AgentRuntimeAdapterSelection {
  const executionProfile = requestedExecutionProfile(request)
  const adapter = selectCandidateAdapter({ request, executionProfile })

  if (request.permissionPolicy.kind === "fail-closed") {
    return failClosedPermissionPolicyResult({ request, adapter })
  }

  if (
    requiresPerScopePolicyEnforcement(request) &&
    adapter.policyGrantEnforcement !== "pre-execution"
  ) {
    return unsupportedPolicyGrantEnforcementResult({ request, adapter })
  }

  if (executionProfile === "interactive") {
    return refusedSelectionResult({
      request,
      adapter,
      reason: "interactive_channel_required",
      errorCode: "interactive_channel_required",
      message:
        "Interactive runtime execution requires a visible user interaction channel.",
    })
  }

  if (executionProfile !== "batch" && executionProfile !== "policy-grant") {
    return refusedSelectionResult({
      request,
      adapter,
      reason: "unsupported_execution_profile",
      errorCode: "unsupported_execution_profile",
      message: `${executionProfile} runtime execution is not available for current headless adapters.`,
    })
  }

  for (const capabilityId of requestedCapabilities(request)) {
    const gate = checkAgentRuntimeCapability({
      runtime: adapter.id,
      capabilityId,
    })
    if (!gate.ok) {
      return unsupportedCapabilityResult(request, adapter, gate.diagnostic)
    }
  }

  return {
    ok: true,
    adapter,
    diagnostic: {
      type: "adapter-selected",
      status: "selected",
      runtime: request.runtime,
      source: request.source,
      executionProfile,
      adapterSource: adapter.sourceId,
      preferredAdapterSource: options.preferredAdapterSource ?? null,
      adapterLabel: adapter.label,
      fallbackReason: fallbackReasonFor({
        adapter,
        preferredAdapterSource: options.preferredAdapterSource,
      }),
      message: `Selected ${adapter.label} for ${request.source} ${executionProfile} execution.`,
    },
  }
}
