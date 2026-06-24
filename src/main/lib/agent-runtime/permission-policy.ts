import type { AgentJobMode, AgentJobSource } from "../../../shared/agent-jobs"
import type { AgentRuntimeId } from "../../../shared/agent-runtime-capabilities"
import type { ResolvedDesktopRuntimeControlLevel } from "../../../shared/agent-runtime-control"
import type {
  AgentRuntimeExecutionProfile,
  AgentRuntimePermissionPolicySummary,
} from "./run-contract"

export type DesktopPermissionRuntime = Extract<
  AgentRuntimeId,
  "claude-code" | "codex" | "qwen-code" | "kun"
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
    | "fail-closed-when-hook-unavailable"
}

export type ClaudePermissionMapping = {
  runtime: "claude-code"
  sdkPermissionMode: "plan" | "bypassPermissions"
  allowDangerouslySkipPermissions: boolean
  requiresToolPolicy: boolean
  sdkDisallowedTools?: string[]
  bypassReason: string | null
}

export type CodexPermissionAdapterSource = "codex-app-server"

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

export type CodexPermissionMapping = CodexAppServerPermissionMapping

export type QwenAcpClientPermissionMapping = {
  runtime: "qwen-code"
  adapterSource: "qwen-acp-client"
  controlLevel: ResolvedDesktopRuntimeControlLevel
  acpPermissionPolicy: "ask"
  observedToolPolicy: ObservedToolPolicy
  requiresApprovalGate: true
  permissionHandlerFailure: "fail-closed"
}

export type QwenPermissionMapping = QwenAcpClientPermissionMapping

export type KunHttpSsePermissionMapping = {
  runtime: "kun"
  adapterSource: "kun-http-sse"
  controlLevel: ResolvedDesktopRuntimeControlLevel
  approvalPolicy: "on-request"
  sandboxMode: "danger-full-access"
  observedToolPolicy: ObservedToolPolicy
  requiresApprovalGate: true
  commandExecution: "guarded-by-locus"
  permissionHandlerFailure: "fail-closed"
}

export type KunPermissionMapping = KunHttpSsePermissionMapping

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
    | "codex-app-server-assistant-approval-gate"
    | "codex-app-server-plan-approval-gate"
    | "codex-app-server-guarded-approval-gate"
    | "codex-app-server-agent-approval-gate"
    | "qwen-acp-client-assistant-permission-gate"
    | "qwen-acp-client-plan-permission-gate"
    | "qwen-acp-client-guarded-permission-gate"
    | "qwen-acp-client-agent-permission-gate"
    | "kun-http-sse-assistant-approval-gate"
    | "kun-http-sse-plan-blocked"
    | "kun-http-sse-guarded-approval-gate"
    | "kun-http-sse-agent-approval-gate"
  runtimeMapping:
    | ClaudePermissionMapping
    | CodexPermissionMapping
    | QwenPermissionMapping
    | KunPermissionMapping
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

const CLAUDE_ASSISTANT_SDK_DISALLOWED_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "MultiEdit",
  "NotebookRead",
  "NotebookEdit",
  "Glob",
  "Grep",
  "LS",
  "Bash",
  "BashOutput",
  "KillShell",
  "Task",
  "TodoRead",
  "TodoWrite",
  "ExitPlanMode",
] as const

const ASSISTANT_FILESYSTEM_TOOL_NAMES = new Set([
  "read",
  "write",
  "edit",
  "multiedit",
  "notebookread",
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
  "bashoutput",
  "killshell",
])

const ASSISTANT_RUNTIME_MUTATION_TOOL_NAMES = new Set([
  "exitplanmode",
  "todoread",
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

export function getClaudeAssistantSdkDisallowedTools(): string[] {
  return [...CLAUDE_ASSISTANT_SDK_DISALLOWED_TOOLS]
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

function createQwenAcpClientPermissionMapping({
  controlLevel,
  observedToolPolicy,
}: {
  controlLevel: ResolvedDesktopRuntimeControlLevel
  observedToolPolicy: ObservedToolPolicy
}): QwenAcpClientPermissionMapping {
  return {
    runtime: "qwen-code",
    adapterSource: "qwen-acp-client",
    controlLevel,
    acpPermissionPolicy: "ask",
    observedToolPolicy,
    requiresApprovalGate: true,
    permissionHandlerFailure: "fail-closed",
  }
}

function createKunHttpSsePermissionMapping({
  controlLevel,
  observedToolPolicy,
}: {
  controlLevel: ResolvedDesktopRuntimeControlLevel
  observedToolPolicy: ObservedToolPolicy
}): KunHttpSsePermissionMapping {
  return {
    runtime: "kun",
    adapterSource: "kun-http-sse",
    controlLevel,
    approvalPolicy: "on-request",
    sandboxMode: "danger-full-access",
    observedToolPolicy,
    requiresApprovalGate: true,
    commandExecution: "guarded-by-locus",
    permissionHandlerFailure: "fail-closed",
  }
}

function desktopAssistantEnforcement(
  runtimeId: DesktopPermissionRuntime,
): DesktopPermissionPolicy["enforcement"] {
  switch (runtimeId) {
    case "claude-code":
      return "locus-assistant-tool-policy"
    case "codex":
      return "codex-app-server-assistant-approval-gate"
    case "qwen-code":
      return "qwen-acp-client-assistant-permission-gate"
    case "kun":
      return "kun-http-sse-assistant-approval-gate"
  }
}

function desktopPlanEnforcement(
  runtimeId: DesktopPermissionRuntime,
): DesktopPermissionPolicy["enforcement"] {
  switch (runtimeId) {
    case "claude-code":
      return "native-plan-read-only"
    case "codex":
      return "codex-app-server-plan-approval-gate"
    case "qwen-code":
      return "qwen-acp-client-plan-permission-gate"
    case "kun":
      return "kun-http-sse-plan-blocked"
  }
}

function desktopGuardedEnforcement(
  runtimeId: DesktopPermissionRuntime,
): DesktopPermissionPolicy["enforcement"] {
  switch (runtimeId) {
    case "claude-code":
      return "locus-guarded-tool-policy"
    case "codex":
      return "codex-app-server-guarded-approval-gate"
    case "qwen-code":
      return "qwen-acp-client-guarded-permission-gate"
    case "kun":
      return "kun-http-sse-guarded-approval-gate"
  }
}

function desktopObservedEnforcement(
  runtimeId: DesktopPermissionRuntime,
): DesktopPermissionPolicy["enforcement"] {
  switch (runtimeId) {
    case "claude-code":
      return "locus-agent-observed"
    case "codex":
      return "codex-app-server-agent-approval-gate"
    case "qwen-code":
      return "qwen-acp-client-agent-permission-gate"
    case "kun":
      return "kun-http-sse-agent-approval-gate"
  }
}

function createDesktopRuntimePermissionMapping(input: {
  runtimeId: DesktopPermissionRuntime
  controlLevel: ResolvedDesktopRuntimeControlLevel
  observedToolPolicy: ObservedToolPolicy
}): DesktopPermissionPolicy["runtimeMapping"] {
  switch (input.runtimeId) {
    case "claude-code":
      return input.controlLevel === "plan" || input.controlLevel === "assistant"
        ? {
            runtime: "claude-code",
            sdkPermissionMode: "plan",
            allowDangerouslySkipPermissions: false,
            requiresToolPolicy: true,
            ...(input.controlLevel === "assistant"
              ? { sdkDisallowedTools: getClaudeAssistantSdkDisallowedTools() }
              : {}),
            bypassReason: null,
          }
        : {
            runtime: "claude-code",
            sdkPermissionMode: "bypassPermissions",
            allowDangerouslySkipPermissions: true,
            requiresToolPolicy: true,
            bypassReason:
              input.controlLevel === "guarded"
                ? "Claude agent mode currently uses SDK permission bypass only with Locus guarded tool policy installed before runtime startup."
                : "Claude observed agent mode uses SDK permission bypass with Locus observation and catastrophic-action policy installed before runtime startup.",
          }
    case "codex":
      return createCodexAppServerPermissionMapping(input)
    case "qwen-code":
      return createQwenAcpClientPermissionMapping(input)
    case "kun":
      return createKunHttpSsePermissionMapping(input)
  }
}

export function resolveDesktopPermissionPolicy({
  runtimeId,
  mode,
  workspaceKind = "project",
  hasScopeContract = false,
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
      enforcement: desktopAssistantEnforcement(runtimeId),
      runtimeMapping: createDesktopRuntimePermissionMapping({
        runtimeId,
        controlLevel: "assistant",
        observedToolPolicy: DISABLED_OBSERVATION,
      }),
      diagnostics: [
        runtimeId === "codex"
          ? "Assistant quick chat allows only web search/fetch tools; Codex app-server must fail closed for file, shell, MCP, runtime, and unknown approval requests."
          : runtimeId === "qwen-code"
            ? "Assistant quick chat allows only web search/fetch tools; Qwen ACP permission handling must fail closed for file, shell, MCP, runtime, and unknown requests."
            : runtimeId === "kun"
              ? "Assistant quick chat allows only web search/fetch tools; Kun HTTP/SSE approval handling must fail closed for file, shell, MCP, runtime, and unknown requests."
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
      enforcement: desktopPlanEnforcement(runtimeId),
      runtimeMapping: createDesktopRuntimePermissionMapping({
        runtimeId,
        controlLevel: "plan",
        observedToolPolicy: DISABLED_OBSERVATION,
      }),
      diagnostics: [
        runtimeId === "codex"
          ? "Plan mode denies project/workspace side effects; Codex app-server must install its approval gate before provider or tool work starts."
          : runtimeId === "qwen-code"
            ? "Plan mode denies project/workspace side effects; Qwen ACP permission handling must be ready before provider or tool work starts."
            : runtimeId === "kun"
              ? "Kun plan mode is degraded in v1; native create_plan is not a supported Locus plan artifact path, and Kun HTTP/SSE turns are blocked in plan mode."
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
      enforcement: desktopGuardedEnforcement(runtimeId),
      runtimeMapping: createDesktopRuntimePermissionMapping({
        runtimeId,
        controlLevel: "guarded",
        observedToolPolicy: DISABLED_OBSERVATION,
      }),
      diagnostics: [
        runtimeId === "codex"
          ? "Guarded agent mode requires Codex app-server approval gate enforcement before side effects."
          : runtimeId === "qwen-code"
            ? "Guarded agent mode requires Qwen ACP permission gate enforcement before side effects."
            : runtimeId === "kun"
              ? "Guarded agent mode requires Kun HTTP/SSE approval mapping and fail-closed permission handling before side effects."
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
    requiresPreExecutionEnforcement: runtimeId !== "claude-code",
    observedToolPolicy: {
      enabled: true,
      blocksCatastrophicActions: true,
      catastrophicActions: OBSERVED_CATASTROPHIC_ACTIONS,
      degradation:
        runtimeId !== "claude-code"
          ? "fail-closed-when-hook-unavailable"
          : "not-applicable",
    },
    enforcement: desktopObservedEnforcement(runtimeId),
    runtimeMapping: createDesktopRuntimePermissionMapping({
      runtimeId,
      controlLevel: "observe",
      observedToolPolicy: {
        enabled: true,
        blocksCatastrophicActions: true,
        catastrophicActions: OBSERVED_CATASTROPHIC_ACTIONS,
        degradation:
          runtimeId !== "claude-code"
            ? "fail-closed-when-hook-unavailable"
            : "not-applicable",
      },
    }),
    diagnostics: [
      runtimeId === "codex"
        ? "Observed agent mode permits ordinary runtime actions, but Codex app-server must install its approval gate before side-effecting server requests."
        : runtimeId === "qwen-code"
          ? "Observed agent mode permits ordinary runtime actions only after Qwen ACP permission handling is attached; missing hooks fail closed."
          : runtimeId === "kun"
            ? "Observed agent mode permits ordinary Kun actions only after HTTP/SSE approval handling is attached; missing approval mapping fails closed."
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

export function getCodexAppServerPermissionMapping(
  policy: DesktopPermissionPolicy,
): CodexAppServerPermissionMapping {
  const mapping = policy.runtimeMapping
  if (
    mapping.runtime !== "codex" ||
    mapping.adapterSource !== "codex-app-server"
  ) {
    throw new Error(
      `Permission policy is not for Codex app-server: ${policy.runtimeId}`,
    )
  }
  return mapping
}

export function getQwenAcpClientPermissionMapping(
  policy: DesktopPermissionPolicy,
): QwenAcpClientPermissionMapping {
  const mapping = policy.runtimeMapping
  if (
    mapping.runtime !== "qwen-code" ||
    mapping.adapterSource !== "qwen-acp-client"
  ) {
    throw new Error(
      `Permission policy is not for Qwen ACP client: ${policy.runtimeId}`,
    )
  }
  return mapping
}

export function getKunHttpSsePermissionMapping(
  policy: DesktopPermissionPolicy,
): KunHttpSsePermissionMapping {
  const mapping = policy.runtimeMapping
  if (mapping.runtime !== "kun" || mapping.adapterSource !== "kun-http-sse") {
    throw new Error(
      `Permission policy is not for Kun HTTP/SSE: ${policy.runtimeId}`,
    )
  }
  return mapping
}
