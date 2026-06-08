import type { AgentRuntimeId } from "../../../shared/agent-runtime-capabilities"
import type { AgentJobMode } from "../../../shared/agent-jobs"
import type {
  ResolvedDesktopRuntimeControlLevel,
} from "../../../shared/agent-runtime-control"

export type DesktopPermissionRuntime = Extract<
  AgentRuntimeId,
  "claude-code" | "codex"
>

export type PermissionPolicySideEffect =
  | "workspace-file-write"
  | "side-effecting-shell"
  | "mcp-configuration"
  | "runtime-configuration"
  | "provider-configuration"

export type ObservedCatastrophicAction =
  | "high-risk-shell"
  | "sensitive-path-write"
  | "network-egress"

export type ObservedToolPolicy = {
  enabled: boolean
  blocksCatastrophicActions: boolean
  catastrophicActions: ObservedCatastrophicAction[]
  degradation:
    | "not-applicable"
    | "stream-only-when-hook-unavailable"
    | "fail-closed-when-hook-unavailable"
}

export type ClaudePermissionMapping = {
  runtime: "claude-code"
  sdkPermissionMode: "plan" | "bypassPermissions"
  allowDangerouslySkipPermissions: boolean
  requiresToolPolicy: boolean
  bypassReason: string | null
}

export type CodexPermissionMapping = {
  runtime: "codex"
  adapterSource: "acp-temporary-compat"
  acpMode: "read-only" | "auto"
  controlLevel: ResolvedDesktopRuntimeControlLevel
  observedToolPolicy: ObservedToolPolicy
  requiresPermissionHandler: boolean
  permissionHandlerFailure: "fail-closed" | "degrade-to-stream-only"
}

export type DesktopPermissionPolicy = {
  runtimeId: DesktopPermissionRuntime
  mode: AgentJobMode
  controlLevel: ResolvedDesktopRuntimeControlLevel
  guarded: boolean
  planWorkspaceSideEffects: "deny" | "not-applicable"
  allowedLocusPersistence: true
  blockedSideEffects: PermissionPolicySideEffect[]
  requiresPreExecutionEnforcement: boolean
  observedToolPolicy: ObservedToolPolicy
  enforcement:
    | "native-plan-read-only"
    | "locus-agent-observed"
    | "locus-guarded-tool-policy"
    | "codex-acp-plan-handler"
    | "codex-acp-guarded-handler"
    | "codex-acp-agent-observed"
  runtimeMapping: ClaudePermissionMapping | CodexPermissionMapping
  diagnostics: string[]
}

export type ResolveDesktopPermissionPolicyInput = {
  runtimeId: DesktopPermissionRuntime
  mode: AgentJobMode
  hasScopeContract?: boolean
}

const PLAN_BLOCKED_SIDE_EFFECTS: PermissionPolicySideEffect[] = [
  "workspace-file-write",
  "side-effecting-shell",
  "mcp-configuration",
  "runtime-configuration",
  "provider-configuration",
]

const OBSERVED_CATASTROPHIC_ACTIONS: ObservedCatastrophicAction[] = [
  "high-risk-shell",
  "sensitive-path-write",
  "network-egress",
]

const DISABLED_OBSERVATION: ObservedToolPolicy = {
  enabled: false,
  blocksCatastrophicActions: false,
  catastrophicActions: [],
  degradation: "not-applicable",
}

export function resolveDesktopPermissionPolicy({
  runtimeId,
  mode,
  hasScopeContract = false,
}: ResolveDesktopPermissionPolicyInput): DesktopPermissionPolicy {
  if (mode === "plan") {
    return {
      runtimeId,
      mode,
      controlLevel: "plan",
      guarded: hasScopeContract,
      planWorkspaceSideEffects: "deny",
      allowedLocusPersistence: true,
      blockedSideEffects: PLAN_BLOCKED_SIDE_EFFECTS,
      requiresPreExecutionEnforcement: true,
      observedToolPolicy: DISABLED_OBSERVATION,
      enforcement:
        runtimeId === "claude-code"
          ? "native-plan-read-only"
          : "codex-acp-plan-handler",
      runtimeMapping:
        runtimeId === "claude-code"
          ? {
              runtime: "claude-code",
              sdkPermissionMode: "plan",
              allowDangerouslySkipPermissions: false,
              requiresToolPolicy: true,
              bypassReason: null,
            }
          : {
              runtime: "codex",
              adapterSource: "acp-temporary-compat",
              acpMode: "read-only",
              controlLevel: "plan",
              observedToolPolicy: DISABLED_OBSERVATION,
              requiresPermissionHandler: true,
              permissionHandlerFailure: "fail-closed",
            },
      diagnostics: [
        "Plan mode denies project/workspace side effects; Locus may still persist local app state.",
      ],
    }
  }

  if (hasScopeContract) {
    return {
      runtimeId,
      mode,
      controlLevel: "guarded",
      guarded: true,
      planWorkspaceSideEffects: "not-applicable",
      allowedLocusPersistence: true,
      blockedSideEffects: [],
      requiresPreExecutionEnforcement: true,
      observedToolPolicy: DISABLED_OBSERVATION,
      enforcement:
        runtimeId === "claude-code"
          ? "locus-guarded-tool-policy"
          : "codex-acp-guarded-handler",
      runtimeMapping:
        runtimeId === "claude-code"
          ? {
              runtime: "claude-code",
              sdkPermissionMode: "bypassPermissions",
              allowDangerouslySkipPermissions: true,
              requiresToolPolicy: true,
              bypassReason:
                "Claude agent mode currently uses SDK permission bypass only with Locus guarded tool policy installed before runtime startup.",
            }
          : {
              runtime: "codex",
              adapterSource: "acp-temporary-compat",
              acpMode: "read-only",
              controlLevel: "guarded",
              observedToolPolicy: DISABLED_OBSERVATION,
              requiresPermissionHandler: true,
              permissionHandlerFailure: "fail-closed",
            },
      diagnostics: [
        "Guarded agent mode requires pre-execution tool policy enforcement before side effects.",
      ],
    }
  }

  return {
    runtimeId,
    mode,
    controlLevel: "observe",
    guarded: false,
    planWorkspaceSideEffects: "not-applicable",
    allowedLocusPersistence: true,
    blockedSideEffects: [],
    requiresPreExecutionEnforcement: false,
    observedToolPolicy: {
      enabled: true,
      blocksCatastrophicActions: true,
      catastrophicActions: OBSERVED_CATASTROPHIC_ACTIONS,
      degradation:
        runtimeId === "codex"
          ? "stream-only-when-hook-unavailable"
          : "not-applicable",
    },
    enforcement:
      runtimeId === "claude-code"
        ? "locus-agent-observed"
        : "codex-acp-agent-observed",
    runtimeMapping:
      runtimeId === "claude-code"
        ? {
            runtime: "claude-code",
            sdkPermissionMode: "bypassPermissions",
            allowDangerouslySkipPermissions: true,
            requiresToolPolicy: true,
            bypassReason:
              "Claude observed agent mode uses SDK permission bypass with Locus observation and catastrophic-action policy installed before runtime startup.",
          }
        : {
            runtime: "codex",
            adapterSource: "acp-temporary-compat",
            acpMode: "read-only",
            controlLevel: "observe",
            observedToolPolicy: {
              enabled: true,
              blocksCatastrophicActions: true,
              catastrophicActions: OBSERVED_CATASTROPHIC_ACTIONS,
              degradation: "stream-only-when-hook-unavailable",
            },
            requiresPermissionHandler: true,
            permissionHandlerFailure: "degrade-to-stream-only",
          },
    diagnostics: [
      "Observed agent mode permits ordinary runtime actions, records tool decisions, and blocks catastrophic actions when runtime hooks are available.",
    ],
  }
}

export function getClaudePermissionMapping(
  policy: DesktopPermissionPolicy,
): ClaudePermissionMapping {
  if (policy.runtimeMapping.runtime !== "claude-code") {
    throw new Error(`Permission policy is not for Claude: ${policy.runtimeId}`)
  }
  return policy.runtimeMapping
}

export function getCodexPermissionMapping(
  policy: DesktopPermissionPolicy,
): CodexPermissionMapping {
  if (policy.runtimeMapping.runtime !== "codex") {
    throw new Error(`Permission policy is not for Codex: ${policy.runtimeId}`)
  }
  return policy.runtimeMapping
}
