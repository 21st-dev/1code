import type { AgentJobMode, AgentJobSource } from "../../../shared/agent-jobs"
import type { AgentRuntimeId } from "../../../shared/agent-runtime-capabilities"
import type { ResolvedDesktopRuntimeControlLevel } from "../../../shared/agent-runtime-control"
import type {
  AgentRuntimeExecutionProfile,
  AgentRuntimePermissionPolicySummary,
} from "./run-contract"

export type DesktopPermissionRuntime = Extract<
  AgentRuntimeId,
  "claude-code" | "codex"
>

export type PermissionPolicySideEffect =
  | "workspace-file-read"
  | "workspace-file-write"
  | "side-effecting-shell"
  | "terminal-execution"
  | "project-mcp-tool"
  | "mcp-configuration"
  | "runtime-configuration"
  | "provider-configuration"
  | "unknown-tool"

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
    | "locus-assistant-tool-policy"
    | "native-plan-read-only"
    | "locus-agent-observed"
    | "locus-guarded-tool-policy"
    | "codex-acp-assistant-handler"
    | "codex-acp-plan-handler"
    | "codex-acp-guarded-handler"
    | "codex-acp-agent-observed"
    | "codex-app-server-assistant-approval-gate"
    | "codex-app-server-plan-approval-gate"
    | "codex-app-server-guarded-approval-gate"
    | "codex-app-server-agent-approval-gate"
  runtimeMapping: ClaudePermissionMapping | CodexPermissionMapping
  diagnostics: string[]
}

export type ResolveDesktopPermissionPolicyInput = {
  runtimeId: DesktopPermissionRuntime
  mode: AgentJobMode
  workspaceKind?: "project" | "folderless"
  hasScopeContract?: boolean
  codexAdapterSource?: CodexPermissionAdapterSource
}

export type AssistantToolPermissionCategory =
  | "web-information"
  | "filesystem"
  | "shell"
  | "terminal"
  | "mcp-or-project"
  | "runtime-mutation"
  | "unknown"

export type AssistantToolPermissionDecision = {
  decision: "allow" | "deny"
  category: AssistantToolPermissionCategory
  message?: string
}

export type NonDesktopInteractiveRequirement =
  | "interactive-approval"
  | "ask-user-question"
  | "mcp-elicitation"
  | "unknown-side-effect-approval"

export type NonDesktopPolicyGrant = {
  scopes: string[]
  canDecideAutomatically?: boolean
}

export type ResolveNonDesktopPermissionPolicyInput = {
  source: AgentJobSource
  mode: AgentJobMode
  executionProfile?: AgentRuntimeExecutionProfile
  hasVisibleUserInteractionChannel?: boolean
  interactiveRequirements?: NonDesktopInteractiveRequirement[]
  policyGrant?: NonDesktopPolicyGrant | null
}

const PLAN_BLOCKED_SIDE_EFFECTS: PermissionPolicySideEffect[] = [
  "workspace-file-write",
  "side-effecting-shell",
  "mcp-configuration",
  "runtime-configuration",
  "provider-configuration",
]

const ASSISTANT_BLOCKED_SIDE_EFFECTS: PermissionPolicySideEffect[] = [
  "workspace-file-read",
  "workspace-file-write",
  "side-effecting-shell",
  "terminal-execution",
  "project-mcp-tool",
  "mcp-configuration",
  "runtime-configuration",
  "provider-configuration",
  "unknown-tool",
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

const ASSISTANT_ALLOWED_WEB_TOOL_NAMES = new Set(["websearch", "webfetch"])

const ASSISTANT_FILESYSTEM_TOOL_NAMES = new Set([
  "read",
  "write",
  "edit",
  "multiedit",
  "notebookedit",
  "glob",
  "grep",
  "ls",
  "list",
])

const ASSISTANT_SHELL_TOOL_NAMES = new Set([
  "bash",
  "run",
  "shell",
  "exec",
  "execute",
])

const ASSISTANT_RUNTIME_MUTATION_TOOL_NAMES = new Set([
  "exitplanmode",
  "todowrite",
  "task",
  "planwrite",
])

const FILESYSTEM_TOOL_KINDS = new Set([
  "read",
  "edit",
  "delete",
  "move",
  "search",
])

function normalizeAssistantToolName(toolName: string): string {
  return toolName.replace(/[^A-Za-z0-9]/g, "").toLowerCase()
}

export function decideAssistantToolPermission(input: {
  toolName: string
  toolKind?: string | null
}): AssistantToolPermissionDecision {
  const rawName = input.toolName.trim()
  const normalizedName = normalizeAssistantToolName(rawName)
  const toolKind = input.toolKind?.trim().toLowerCase() || null

  if (ASSISTANT_ALLOWED_WEB_TOOL_NAMES.has(normalizedName)) {
    return {
      decision: "allow",
      category: "web-information",
    }
  }

  if (
    rawName.startsWith("mcp__") ||
    normalizedName.startsWith("mcp") ||
    normalizedName.includes("project")
  ) {
    return {
      decision: "deny",
      category: "mcp-or-project",
      message: `Assistant mode blocked ${rawName || "unknown tool"}: project and MCP tools are unavailable in quick chat.`,
    }
  }

  if (
    ASSISTANT_FILESYSTEM_TOOL_NAMES.has(normalizedName) ||
    (toolKind ? FILESYSTEM_TOOL_KINDS.has(toolKind) : false)
  ) {
    return {
      decision: "deny",
      category: "filesystem",
      message: `Assistant mode blocked ${rawName || "unknown tool"}: filesystem tools are unavailable in quick chat.`,
    }
  }

  if (
    ASSISTANT_SHELL_TOOL_NAMES.has(normalizedName) ||
    toolKind === "execute"
  ) {
    return {
      decision: "deny",
      category: "shell",
      message: `Assistant mode blocked ${rawName || "unknown tool"}: shell and process tools are unavailable in quick chat.`,
    }
  }

  if (normalizedName.includes("terminal")) {
    return {
      decision: "deny",
      category: "terminal",
      message: `Assistant mode blocked ${rawName || "unknown tool"}: terminal tools are unavailable in quick chat.`,
    }
  }

  if (ASSISTANT_RUNTIME_MUTATION_TOOL_NAMES.has(normalizedName)) {
    return {
      decision: "deny",
      category: "runtime-mutation",
      message: `Assistant mode blocked ${rawName || "unknown tool"}: runtime mutation tools are unavailable in quick chat.`,
    }
  }

  return {
    decision: "deny",
    category: "unknown",
    message: `Assistant mode blocked ${rawName || "unknown tool"}: only web search and web fetch tools are allowed in quick chat.`,
  }
}

function uniqueStrings(values: readonly string[] | undefined): string[] {
  return [
    ...new Set((values ?? []).map((value) => value.trim()).filter(Boolean)),
  ]
}

function failClosedNonDesktopPolicy(input: {
  source: AgentJobSource
  mode: AgentJobMode
  reason: string
  message: string
  blockedRequirements?: NonDesktopInteractiveRequirement[]
}): AgentRuntimePermissionPolicySummary {
  return {
    kind: "fail-closed",
    interaction: "none",
    enforcement: "non-desktop-fail-closed",
    diagnostics: [
      `${input.source} ${input.mode} job refused before provider work: ${input.message}`,
    ],
    blockedRequirements: input.blockedRequirements ?? [],
    failClosedReasons: [input.reason],
  }
}

export function resolveNonDesktopPermissionPolicy({
  source,
  mode,
  executionProfile = "batch",
  hasVisibleUserInteractionChannel = false,
  interactiveRequirements,
  policyGrant,
}: ResolveNonDesktopPermissionPolicyInput): AgentRuntimePermissionPolicySummary {
  const requestedInteractiveRequirements = [
    ...new Set(interactiveRequirements ?? []),
  ]
  const grantedScopes = uniqueStrings(policyGrant?.scopes)
  // Local Job API v1 treats omitted canDecideAutomatically as allowed when
  // bounded scopes are present; explicit false is the fail-closed opt-out.
  const grantCanDecide =
    policyGrant?.canDecideAutomatically ?? grantedScopes.length > 0

  if (hasVisibleUserInteractionChannel) {
    return {
      kind: "interactive-user",
      interaction: "visible-user",
      enforcement: "interactive-user-bridge",
      diagnostics: [
        `${source} ${mode} job may route approvals, questions, and MCP elicitation through the declared interaction bridge.`,
      ],
    }
  }

  if (executionProfile === "policy-grant" || grantedScopes.length > 0) {
    if (grantedScopes.length === 0 || !grantCanDecide) {
      return failClosedNonDesktopPolicy({
        source,
        mode,
        reason: "missing_policy_grant",
        message:
          "policy-grant execution requires bounded scopes that can be decided without a visible user.",
        blockedRequirements: requestedInteractiveRequirements,
      })
    }

    return {
      kind: "policy-grant",
      interaction: "none",
      enforcement: "non-desktop-policy-grant",
      diagnostics: [
        `${source} ${mode} job uses bounded policy grant scopes; adapters without matching pre-execution hooks must not claim per-scope enforcement.`,
      ],
      grantedScopes,
      blockedRequirements: [],
      failClosedReasons: [],
    }
  }

  if (
    executionProfile === "interactive" ||
    requestedInteractiveRequirements.length > 0
  ) {
    return failClosedNonDesktopPolicy({
      source,
      mode,
      reason: "no_interaction_channel",
      message:
        "interactive approval, AskUserQuestion, MCP elicitation, and unknown side-effect approval require a visible user channel or bounded policy grant.",
      blockedRequirements: requestedInteractiveRequirements,
    })
  }

  return {
    kind: "headless-batch",
    interaction: "none",
    enforcement: "batch-adapter-capability-gate",
    diagnostics: [
      `${source} jobs use the existing batch adapter capability gate; interactive approvals are unavailable.`,
    ],
    blockedRequirements: [],
    failClosedReasons: [],
  }
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
      controlLevel === "guarded" || controlLevel === "assistant"
        ? "untrusted"
        : "on-request",
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
  workspaceKind = "project",
  hasScopeContract = false,
  codexAdapterSource = "acp-temporary-compat",
}: ResolveDesktopPermissionPolicyInput): DesktopPermissionPolicy {
  if (workspaceKind === "folderless") {
    return {
      runtimeId,
      mode,
      controlLevel: "assistant",
      guarded: false,
      planWorkspaceSideEffects: "deny",
      allowedLocusPersistence: true,
      blockedSideEffects: ASSISTANT_BLOCKED_SIDE_EFFECTS,
      requiresPreExecutionEnforcement: true,
      observedToolPolicy: DISABLED_OBSERVATION,
      enforcement:
        runtimeId === "claude-code"
          ? "locus-assistant-tool-policy"
          : codexAdapterSource === "codex-app-server"
            ? "codex-app-server-assistant-approval-gate"
            : "codex-acp-assistant-handler",
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
              controlLevel: "assistant",
              observedToolPolicy: DISABLED_OBSERVATION,
              acpPermissionHandlerFailure: "fail-closed",
            }),
      diagnostics: [
        runtimeId === "codex" && codexAdapterSource === "codex-app-server"
          ? "Assistant quick chat allows only web search/fetch tools; Codex app-server must fail closed for file, shell, MCP, runtime, and unknown approval requests."
          : "Assistant quick chat allows only web search/fetch tools and Locus-owned persistence; file, shell, terminal, MCP, runtime mutation, and unknown tools fail closed.",
      ],
    }
  }

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
