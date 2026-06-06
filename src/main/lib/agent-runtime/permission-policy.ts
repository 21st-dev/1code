import type { AgentRuntimeId } from "../../../shared/agent-runtime-capabilities"
import type { AgentJobMode } from "../../../shared/agent-jobs"

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
  requiresPermissionHandler: boolean
}

export type DesktopPermissionPolicy = {
  runtimeId: DesktopPermissionRuntime
  mode: AgentJobMode
  guarded: boolean
  planWorkspaceSideEffects: "deny" | "not-applicable"
  allowedLocusPersistence: true
  blockedSideEffects: PermissionPolicySideEffect[]
  requiresPreExecutionEnforcement: boolean
  enforcement:
    | "native-plan-read-only"
    | "locus-agent-full-access"
    | "locus-guarded-tool-policy"
    | "codex-acp-plan-handler"
    | "codex-acp-guarded-handler"
    | "codex-acp-agent-auto"
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

export function resolveDesktopPermissionPolicy({
  runtimeId,
  mode,
  hasScopeContract = false,
}: ResolveDesktopPermissionPolicyInput): DesktopPermissionPolicy {
  if (mode === "plan") {
    return {
      runtimeId,
      mode,
      guarded: hasScopeContract,
      planWorkspaceSideEffects: "deny",
      allowedLocusPersistence: true,
      blockedSideEffects: PLAN_BLOCKED_SIDE_EFFECTS,
      requiresPreExecutionEnforcement: true,
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
              requiresPermissionHandler: true,
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
      guarded: true,
      planWorkspaceSideEffects: "not-applicable",
      allowedLocusPersistence: true,
      blockedSideEffects: [],
      requiresPreExecutionEnforcement: true,
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
              acpMode: "auto",
              requiresPermissionHandler: true,
            },
      diagnostics: [
        "Guarded agent mode requires pre-execution tool policy enforcement before side effects.",
      ],
    }
  }

  return {
    runtimeId,
    mode,
    guarded: false,
    planWorkspaceSideEffects: "not-applicable",
    allowedLocusPersistence: true,
    blockedSideEffects: [],
    requiresPreExecutionEnforcement: false,
    enforcement:
      runtimeId === "claude-code" ? "locus-agent-full-access" : "codex-acp-agent-auto",
    runtimeMapping:
      runtimeId === "claude-code"
        ? {
            runtime: "claude-code",
            sdkPermissionMode: "bypassPermissions",
            allowDangerouslySkipPermissions: true,
            requiresToolPolicy: false,
            bypassReason:
              "Claude agent mode is the explicit full-access desktop policy until route extraction maps native controls through this owner.",
          }
        : {
            runtime: "codex",
            adapterSource: "acp-temporary-compat",
            acpMode: "auto",
            requiresPermissionHandler: false,
          },
    diagnostics: [
      "Agent mode permits runtime side effects according to the selected runtime capability state.",
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
