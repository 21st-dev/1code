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

export type CodexPermissionAdapterSource =
  | "acp-temporary-compat"
  | "codex-app-server"

export type CodexAcpPermissionMapping = {
  runtime: "codex"
  adapterSource: "acp-temporary-compat"
  acpMode: "read-only" | "auto"
  controlLevel: ResolvedDesktopRuntimeControlLevel
  observedToolPolicy: ObservedToolPolicy
  requiresPermissionHandler: boolean
  permissionHandlerFailure: "fail-closed" | "degrade-to-stream-only"
}

export type CodexAppServerPermissionMapping = {
  runtime: "codex"
  adapterSource: "codex-app-server"
  controlLevel: ResolvedDesktopRuntimeControlLevel
  appServerApprovalPolicy: "untrusted" | "on-request"
  observedToolPolicy: ObservedToolPolicy
  requiresApprovalGate: true
  approvalGateFailure: "fail-closed"
  approvalHook: {
    required: true
    missing: "fail-closed"
    delayed: "fail-closed"
  }
  permissionHandlerFailure: "fail-closed"
}

export type CodexPermissionMapping =
  | CodexAcpPermissionMapping
  | CodexAppServerPermissionMapping

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
    | "codex-app-server-plan-approval-gate"
    | "codex-app-server-guarded-approval-gate"
    | "codex-app-server-agent-approval-gate"
  runtimeMapping: ClaudePermissionMapping | CodexPermissionMapping
  diagnostics: string[]
}

export type ResolveDesktopPermissionPolicyInput = {
  runtimeId: DesktopPermissionRuntime
  mode: AgentJobMode
  hasScopeContract?: boolean
  codexAdapterSource?: CodexPermissionAdapterSource
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

function createCodexAcpPermissionMapping({
  controlLevel,
  observedToolPolicy,
  permissionHandlerFailure,
}: {
  controlLevel: ResolvedDesktopRuntimeControlLevel
  observedToolPolicy: ObservedToolPolicy
  permissionHandlerFailure: CodexAcpPermissionMapping["permissionHandlerFailure"]
}): CodexAcpPermissionMapping {
  return {
    runtime: "codex",
    adapterSource: "acp-temporary-compat",
    acpMode: "read-only",
    controlLevel,
    observedToolPolicy,
    requiresPermissionHandler: true,
    permissionHandlerFailure,
  }
}

function createCodexAppServerPermissionMapping({
  controlLevel,
  observedToolPolicy,
}: {
  controlLevel: ResolvedDesktopRuntimeControlLevel
  observedToolPolicy: ObservedToolPolicy
}): CodexAppServerPermissionMapping {
  return {
    runtime: "codex",
    adapterSource: "codex-app-server",
    controlLevel,
    appServerApprovalPolicy:
      controlLevel === "guarded" ? "untrusted" : "on-request",
    observedToolPolicy,
    requiresApprovalGate: true,
    approvalGateFailure: "fail-closed",
    approvalHook: {
      required: true,
      missing: "fail-closed",
      delayed: "fail-closed",
    },
    permissionHandlerFailure: "fail-closed",
  }
}

function createCodexPermissionMapping({
  adapterSource,
  controlLevel,
  observedToolPolicy,
  acpPermissionHandlerFailure,
}: {
  adapterSource: CodexPermissionAdapterSource
  controlLevel: ResolvedDesktopRuntimeControlLevel
  observedToolPolicy: ObservedToolPolicy
  acpPermissionHandlerFailure: CodexAcpPermissionMapping["permissionHandlerFailure"]
}): CodexPermissionMapping {
  if (adapterSource === "codex-app-server") {
    return createCodexAppServerPermissionMapping({
      controlLevel,
      observedToolPolicy,
    })
  }

  return createCodexAcpPermissionMapping({
    controlLevel,
    observedToolPolicy,
    permissionHandlerFailure: acpPermissionHandlerFailure,
  })
}

export function resolveDesktopPermissionPolicy({
  runtimeId,
  mode,
  hasScopeContract = false,
  codexAdapterSource = "acp-temporary-compat",
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
          : codexAdapterSource === "codex-app-server"
            ? "codex-app-server-plan-approval-gate"
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
          : createCodexPermissionMapping({
              adapterSource: codexAdapterSource,
              controlLevel: "plan",
              observedToolPolicy: DISABLED_OBSERVATION,
              acpPermissionHandlerFailure: "fail-closed",
            }),
      diagnostics: [
        runtimeId === "codex" && codexAdapterSource === "codex-app-server"
          ? "Plan mode denies project/workspace side effects; Codex app-server must install its approval gate before provider or tool work starts."
          : "Plan mode denies project/workspace side effects; Locus may still persist local app state.",
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
          : codexAdapterSource === "codex-app-server"
            ? "codex-app-server-guarded-approval-gate"
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
          : createCodexPermissionMapping({
              adapterSource: codexAdapterSource,
              controlLevel: "guarded",
              observedToolPolicy: DISABLED_OBSERVATION,
              acpPermissionHandlerFailure: "fail-closed",
            }),
      diagnostics: [
        runtimeId === "codex" && codexAdapterSource === "codex-app-server"
          ? "Guarded agent mode requires Codex app-server approval gate enforcement before side effects."
          : "Guarded agent mode requires pre-execution tool policy enforcement before side effects.",
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
    requiresPreExecutionEnforcement:
      runtimeId === "codex" && codexAdapterSource === "codex-app-server",
    observedToolPolicy: {
      enabled: true,
      blocksCatastrophicActions: true,
      catastrophicActions: OBSERVED_CATASTROPHIC_ACTIONS,
      degradation:
        runtimeId === "codex"
          ? codexAdapterSource === "codex-app-server"
            ? "fail-closed-when-hook-unavailable"
            : "stream-only-when-hook-unavailable"
          : "not-applicable",
    },
    enforcement:
      runtimeId === "claude-code"
        ? "locus-agent-observed"
        : codexAdapterSource === "codex-app-server"
          ? "codex-app-server-agent-approval-gate"
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
        : createCodexPermissionMapping({
            adapterSource: codexAdapterSource,
            controlLevel: "observe",
            observedToolPolicy: {
              enabled: true,
              blocksCatastrophicActions: true,
              catastrophicActions: OBSERVED_CATASTROPHIC_ACTIONS,
              degradation:
                codexAdapterSource === "codex-app-server"
                  ? "fail-closed-when-hook-unavailable"
                  : "stream-only-when-hook-unavailable",
            },
            acpPermissionHandlerFailure: "degrade-to-stream-only",
          }),
    diagnostics: [
      runtimeId === "codex" && codexAdapterSource === "codex-app-server"
        ? "Observed agent mode permits ordinary runtime actions, but Codex app-server must install its approval gate before side-effecting server requests."
        : "Observed agent mode permits ordinary runtime actions, records tool decisions, and blocks catastrophic actions when runtime hooks are available.",
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
): CodexAcpPermissionMapping {
  if (policy.runtimeMapping.runtime !== "codex") {
    throw new Error(`Permission policy is not for Codex: ${policy.runtimeId}`)
  }
  if (policy.runtimeMapping.adapterSource !== "acp-temporary-compat") {
    throw new Error(
      `Permission policy is not for Codex ACP temporary-compat: ${policy.runtimeMapping.adapterSource}`,
    )
  }
  return policy.runtimeMapping
}

export function getCodexAppServerPermissionMapping(
  policy: DesktopPermissionPolicy,
): CodexAppServerPermissionMapping {
  if (policy.runtimeMapping.runtime !== "codex") {
    throw new Error(`Permission policy is not for Codex: ${policy.runtimeId}`)
  }
  if (policy.runtimeMapping.adapterSource !== "codex-app-server") {
    throw new Error(
      `Permission policy is not for Codex app-server: ${policy.runtimeMapping.adapterSource}`,
    )
  }
  return policy.runtimeMapping
}
