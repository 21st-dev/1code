export const CONTRACT_RUNTIME_IDS = ["claude-code", "codex"] as const
export const EXPERIMENTAL_RUNTIME_IDS = ["qwen-code", "kun"] as const
export const AGENT_RUNTIME_IDS = [
  ...CONTRACT_RUNTIME_IDS,
  ...EXPERIMENTAL_RUNTIME_IDS,
] as const

export type AgentRuntimeId = (typeof AGENT_RUNTIME_IDS)[number]
export type AgentRuntimeContractId = (typeof CONTRACT_RUNTIME_IDS)[number]
export type AgentRuntimeAlias = AgentRuntimeId | "claude" | "qwen"
export type AgentRuntimeExperimentalId =
  (typeof EXPERIMENTAL_RUNTIME_IDS)[number]

export type AgentRuntimeFeatureEnv = Record<string, string | undefined>

const TRUE_ENV_VALUES = new Set(["1", "true", "yes", "on"])

export function shouldEnableQwenCodeRuntime(
  env: AgentRuntimeFeatureEnv = {},
): boolean {
  const value = env.LOCUS_ENABLE_QWEN_CODE_RUNTIME
  return TRUE_ENV_VALUES.has(value?.trim().toLowerCase() ?? "")
}

export function shouldEnableKunRuntime(
  env: AgentRuntimeFeatureEnv = {},
): boolean {
  const value = env.LOCUS_ENABLE_KUN_RUNTIME
  return TRUE_ENV_VALUES.has(value?.trim().toLowerCase() ?? "")
}

export function isExperimentalAgentRuntimeId(
  runtimeId: AgentRuntimeId,
): runtimeId is AgentRuntimeExperimentalId {
  return (EXPERIMENTAL_RUNTIME_IDS as readonly string[]).includes(runtimeId)
}

export function shouldEnableExperimentalAgentRuntime(
  runtimeId: AgentRuntimeExperimentalId,
  env: AgentRuntimeFeatureEnv = {},
): boolean {
  switch (runtimeId) {
    case "qwen-code":
      return shouldEnableQwenCodeRuntime(env)
    case "kun":
      return shouldEnableKunRuntime(env)
  }
}

export const AGENT_RUNTIME_CAPABILITY_IDS = [
  "hardToolGuard",
  "planMode",
  "quickChatAssistant",
  "scopeExpansion",
  "askUserQuestion",
  "rollback",
  "mcpAuth",
  "mcpConfiguration",
  "providerProfiles",
  "attachments",
  "usageMetadata",
  "runtimePlugins",
  "runtimeCommands",
  "runtimeWorkflows",
  "appAgents",
] as const

export type AgentRuntimeCapabilityId =
  (typeof AGENT_RUNTIME_CAPABILITY_IDS)[number]

export type AgentRuntimeCapabilityStatus =
  | "supported"
  | "degraded"
  | "unsupported"

export type AgentRuntimeCapabilityScope =
  | "runtime-neutral"
  | "runtime-specific"
  | "unavailable"

export type AgentRuntimeCapabilitySupportKind =
  | "runtime-code"
  | "stable-runtime-primitive"
  | "locus-shared-layer"

export type AgentRuntimeCapabilitySupport = {
  kind: AgentRuntimeCapabilitySupportKind
  references: string[]
}

export type AgentRuntimeCapability = {
  id: AgentRuntimeCapabilityId
  label: string
  status: AgentRuntimeCapabilityStatus
  scope: AgentRuntimeCapabilityScope
  reason: string
  hint: string | null
  support: AgentRuntimeCapabilitySupport | null
}

export type AgentRuntimeCapabilityManifest = {
  runtimeId: AgentRuntimeId
  label: string
  description: string
  capabilities: AgentRuntimeCapability[]
}

export type AgentRuntimeCapabilityDiagnostic = {
  type: "unsupported-capability"
  runtimeId: AgentRuntimeId
  capability: AgentRuntimeCapabilityId
  status: AgentRuntimeCapabilityStatus
  scope: AgentRuntimeCapabilityScope
  message: string
  reason: string
  hint: string | null
}

export type AgentRuntimeUnavailableDiagnostic = {
  type: "unavailable-runtime"
  runtimeId: string
  message: string
  hint: string | null
}

export type AgentRuntimeManifestLookup =
  | {
      ok: true
      runtimeId: AgentRuntimeId
      manifest: AgentRuntimeCapabilityManifest
    }
  | {
      ok: false
      runtimeId: string
      diagnostic: AgentRuntimeUnavailableDiagnostic
    }

export type AgentRuntimeCapabilityGate =
  | {
      ok: true
      runtimeId: AgentRuntimeId
      capability: AgentRuntimeCapability
    }
  | {
      ok: false
      runtimeId: AgentRuntimeId
      capability: AgentRuntimeCapability
      diagnostic: AgentRuntimeCapabilityDiagnostic
    }

export type AgentRuntimeCapabilityLookup =
  | AgentRuntimeCapabilityGate
  | {
      ok: false
      runtimeId: string
      diagnostic: AgentRuntimeUnavailableDiagnostic
    }

const SECRET_TEXT_PATTERNS = [
  /(^|[^A-Za-z0-9_])sk-[A-Za-z0-9_-]{20,}/,
  /access_token/i,
  /authorization/i,
  /bearer\s+[A-Za-z0-9._-]+/i,
  /refresh_token/i,
]

const CAPABILITY_LABELS: Record<AgentRuntimeCapabilityId, string> = {
  hardToolGuard: "Hard tool guard",
  planMode: "Plan mode enforcement",
  quickChatAssistant: "Quick chat assistant enforcement",
  scopeExpansion: "Scope expansion approval",
  askUserQuestion: "Ask user question",
  rollback: "Rollback and fork",
  mcpAuth: "MCP auth",
  mcpConfiguration: "MCP configuration",
  providerProfiles: "Provider profiles",
  attachments: "Attachments",
  usageMetadata: "Usage metadata",
  runtimePlugins: "Runtime plugins",
  runtimeCommands: "Runtime commands",
  runtimeWorkflows: "Runtime workflows",
  appAgents: "Locus Agents and skills",
}

function assertNoSecretText(value: string, context: string): void {
  if (SECRET_TEXT_PATTERNS.some((pattern) => pattern.test(value))) {
    throw new Error(`Runtime capability ${context} contains secret-like text.`)
  }
}

function cloneCapability(
  capability: AgentRuntimeCapability,
): AgentRuntimeCapability {
  return {
    ...capability,
    support: capability.support
      ? {
          ...capability.support,
          references: [...capability.support.references],
        }
      : null,
  }
}

function cloneManifest(
  manifest: AgentRuntimeCapabilityManifest,
): AgentRuntimeCapabilityManifest {
  return {
    ...manifest,
    capabilities: manifest.capabilities.map(cloneCapability),
  }
}

function capability(input: {
  id: AgentRuntimeCapabilityId
  status: AgentRuntimeCapabilityStatus
  scope: AgentRuntimeCapabilityScope
  reason: string
  hint: string | null
  support?: AgentRuntimeCapabilitySupport | null
}): AgentRuntimeCapability {
  const normalized: AgentRuntimeCapability = {
    id: input.id,
    label: CAPABILITY_LABELS[input.id],
    status: input.status,
    scope: input.scope,
    reason: input.reason,
    hint: input.hint,
    support: input.support ?? null,
  }

  validateAgentRuntimeCapability(normalized)
  return normalized
}

function manifest(
  input: AgentRuntimeCapabilityManifest,
): AgentRuntimeCapabilityManifest {
  validateAgentRuntimeCapabilityManifest(input)
  return input
}

export function toAgentRuntimeId(
  runtime: AgentRuntimeAlias | string | null | undefined,
): AgentRuntimeId | null {
  if (runtime === "claude" || runtime === "claude-code") return "claude-code"
  if (runtime === "codex") return "codex"
  if (runtime === "qwen" || runtime === "qwen-code") return "qwen-code"
  if (runtime === "kun") return "kun"
  return null
}

export function validateAgentRuntimeCapability(
  capability: AgentRuntimeCapability,
): void {
  if (!capability.reason.trim()) {
    throw new Error(
      `Runtime capability ${capability.id} must include a reason.`,
    )
  }

  assertNoSecretText(capability.label, `${capability.id} label`)
  assertNoSecretText(capability.reason, `${capability.id} reason`)
  if (capability.hint) {
    assertNoSecretText(capability.hint, `${capability.id} hint`)
  }

  if (capability.status === "supported") {
    if (!capability.support) {
      throw new Error(
        `Runtime capability ${capability.id} cannot be supported without code or runtime evidence.`,
      )
    }
    if (capability.scope === "unavailable") {
      throw new Error(
        `Runtime capability ${capability.id} cannot be both supported and unavailable.`,
      )
    }
    if (capability.support.references.length === 0) {
      throw new Error(
        `Runtime capability ${capability.id} supported evidence needs at least one reference.`,
      )
    }
    for (const reference of capability.support.references) {
      assertNoSecretText(reference, `${capability.id} support reference`)
    }
  }
}

export function validateAgentRuntimeCapabilityManifest(
  manifest: AgentRuntimeCapabilityManifest,
): void {
  const runtimeId = toAgentRuntimeId(manifest.runtimeId)
  if (!runtimeId || runtimeId !== manifest.runtimeId) {
    throw new Error(`Unknown runtime manifest id: ${manifest.runtimeId}`)
  }

  assertNoSecretText(manifest.label, `${manifest.runtimeId} label`)
  assertNoSecretText(manifest.description, `${manifest.runtimeId} description`)

  const ids = manifest.capabilities.map((item) => item.id)
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index)
  if (duplicate) {
    throw new Error(
      `Runtime manifest ${manifest.runtimeId} declares ${duplicate} more than once.`,
    )
  }

  if (ids.length !== AGENT_RUNTIME_CAPABILITY_IDS.length) {
    throw new Error(
      `Runtime manifest ${manifest.runtimeId} must declare every known capability.`,
    )
  }

  for (const id of AGENT_RUNTIME_CAPABILITY_IDS) {
    if (!ids.includes(id)) {
      throw new Error(
        `Runtime manifest ${manifest.runtimeId} is missing capability ${id}.`,
      )
    }
  }

  for (const item of manifest.capabilities) {
    validateAgentRuntimeCapability(item)
  }
}

const CLAUDE_RUNTIME_MANIFEST = manifest({
  runtimeId: "claude-code",
  label: "Claude Code",
  description:
    "Claude Code runtime support through Locus's Claude Agent SDK adapter and shared local safety layers.",
  capabilities: [
    capability({
      id: "hardToolGuard",
      status: "supported",
      scope: "runtime-neutral",
      reason:
        "Locus routes Claude tool requests through the guarded canUseTool path before allowing mutating operations.",
      hint: "Guarded Claude runs use the same local scope contract before tool approval.",
      support: {
        kind: "runtime-code",
        references: [
          "src/main/lib/trpc/routers/claude.ts",
          "src/main/lib/agent-guard",
        ],
      },
    }),
    capability({
      id: "planMode",
      status: "supported",
      scope: "runtime-neutral",
      reason:
        "Claude plan-mode chats use read-only permission semantics and require explicit approval before agent-mode work.",
      hint: "Plan-mode writes remain gated until the plan is approved.",
      support: {
        kind: "runtime-code",
        references: ["src/main/lib/trpc/routers/claude.ts"],
      },
    }),
    capability({
      id: "quickChatAssistant",
      status: "supported",
      scope: "runtime-neutral",
      reason:
        "Claude folderless quick chats derive assistant controls from desktop preflight and deny non-web tools through the Agent SDK canUseTool and PreToolUse policy path.",
      hint: "Quick chat permits web search/fetch tools only; attach a project before using file, shell, MCP, or runtime tools.",
      support: {
        kind: "runtime-code",
        references: [
          "src/main/lib/agent-runtime/permission-policy.ts",
          "src/main/lib/claude/agent-sdk-tool-permission.ts",
          "tests/claude-agent-sdk-tool-permission.test.ts",
        ],
      },
    }),
    capability({
      id: "scopeExpansion",
      status: "supported",
      scope: "runtime-neutral",
      reason:
        "Claude guarded runs emit scope-expansion events and deny out-of-scope tool use until the user approves the expanded scope.",
      hint: "Approve the requested scope expansion, then retry the guarded operation.",
      support: {
        kind: "locus-shared-layer",
        references: [
          "src/main/lib/agent-guard",
          "src/main/lib/trpc/routers/claude.ts",
        ],
      },
    }),
    capability({
      id: "askUserQuestion",
      status: "supported",
      scope: "runtime-neutral",
      reason:
        "Claude tool/question flows are bridged through the shared desktop question UI contract.",
      hint: "Question requests block until the user answers, skips, or the request expires.",
      support: {
        kind: "runtime-code",
        references: ["src/main/lib/trpc/routers/claude.ts"],
      },
    }),
    capability({
      id: "rollback",
      status: "supported",
      scope: "runtime-specific",
      reason:
        "Claude session metadata is wired through resume/fork support and message rollback paths.",
      hint: "Rollback and fork remain Claude-specific until another runtime exposes equivalent durable references.",
      support: {
        kind: "stable-runtime-primitive",
        references: [
          "src/main/lib/trpc/routers/claude.ts",
          "src/main/lib/trpc/routers/chats.ts",
        ],
      },
    }),
    capability({
      id: "mcpAuth",
      status: "supported",
      scope: "runtime-neutral",
      reason:
        "Locus checks Claude MCP auth state and can start OAuth before provider work depends on authenticated servers.",
      hint: "Authenticate the reported MCP server, then retry the Claude run.",
      support: {
        kind: "runtime-code",
        references: [
          "src/main/lib/trpc/routers/claude.ts",
          "src/main/lib/mcp-auth.ts",
        ],
      },
    }),
    capability({
      id: "mcpConfiguration",
      status: "degraded",
      scope: "runtime-specific",
      reason:
        "Claude MCP configuration is visible and editable, but not every runtime-scoped operation has a shared capability contract yet.",
      hint: "Keep Claude MCP configuration actions tied to explicit runtime capability state.",
    }),
    capability({
      id: "providerProfiles",
      status: "supported",
      scope: "runtime-neutral",
      reason:
        "Claude provider profiles are resolved in the main process and renderer callers pass only safe profile IDs.",
      hint: "Renderer callers should pass only the provider profile ID.",
      support: {
        kind: "runtime-code",
        references: [
          "src/main/lib/trpc/routers/claude.ts",
          "src/main/lib/provider-profiles",
        ],
      },
    }),
    capability({
      id: "attachments",
      status: "supported",
      scope: "runtime-neutral",
      reason:
        "Claude resolves image and long-text attachments through local main-process attachment stores before runtime injection.",
      hint: "Unsupported attachment references fail before provider work starts.",
      support: {
        kind: "locus-shared-layer",
        references: [
          "src/main/lib/chat-attachments.ts",
          "src/main/lib/long-text-attachments.ts",
          "src/main/lib/trpc/routers/claude.ts",
        ],
      },
    }),
    capability({
      id: "usageMetadata",
      status: "degraded",
      scope: "runtime-specific",
      reason:
        "Claude usage and context metadata are surfaced when available, but exact provider quota semantics are still runtime-specific.",
      hint: "Do not treat missing Claude usage fields as zero usage.",
    }),
    capability({
      id: "runtimePlugins",
      status: "degraded",
      scope: "runtime-specific",
      reason:
        "Claude reviewed native plugin commands, skills, agents, and hooks can be staged into isolated SDK runs with native MCP discovery skipped; safe-mode, unreviewed-global, identity-drift, and full lifecycle proofs are still incomplete.",
      hint: "Keep plugin enablement, MCP approval, identity review, and execution boundaries explicit.",
      support: {
        kind: "runtime-code",
        references: [
          "src/main/lib/claude/agent-sdk-config-dir.ts",
          "src/main/lib/claude/agent-sdk-runtime-startup.ts",
          "src/main/lib/claude/agent-sdk-runtime-lifecycle.ts",
          "src/main/lib/claude/agent-sdk-query-options.ts",
          "scripts/probe-claude-agent-sdk-plugin-loading.ts",
        ],
      },
    }),
    capability({
      id: "runtimeCommands",
      status: "degraded",
      scope: "runtime-specific",
      reason:
        "Claude command discovery exists through the command guide, but runtime-owned command execution is not fully modeled.",
      hint: "Separate documentation indexing, prompt-template commands, and runtime command execution.",
    }),
    capability({
      id: "runtimeWorkflows",
      status: "unsupported",
      scope: "unavailable",
      reason:
        "Claude Dynamic Workflows have an OpenSpec proposal, but the runtime adapter is not implemented yet.",
      hint: "Do not expose dynamic workflow execution until the dedicated proposal is implemented.",
    }),
    capability({
      id: "appAgents",
      status: "degraded",
      scope: "runtime-specific",
      reason:
        "Locus Agent mentions can be prompt-prepared for Claude, but runtime-native agent execution is incomplete.",
      hint: "Do not count prompt preparation alone as full Locus Agent runtime support.",
    }),
  ],
})

const CODEX_RUNTIME_MANIFEST = manifest({
  runtimeId: "codex",
  label: "Codex",
  description:
    "Codex runtime support through Locus's app-server desktop adapter, the headless/batch Codex CLI path, and shared local safety layers.",
  capabilities: [
    capability({
      id: "hardToolGuard",
      status: "supported",
      scope: "runtime-neutral",
      reason:
        "Locus routes Codex app-server tool and controlled-edit requests through shared guarded-run decisions before mutating operations.",
      hint: "Guarded Codex runs fail closed if app-server approval handling cannot be attached.",
      support: {
        kind: "runtime-code",
        references: [
          "src/main/lib/codex/app-server-approval.ts",
          "src/main/lib/codex/app-server-controlled-edit.ts",
          "src/main/lib/trpc/routers/codex.ts",
        ],
      },
    }),
    capability({
      id: "planMode",
      status: "supported",
      scope: "runtime-neutral",
      reason:
        "Locus maps Codex app-server plan runs to read-only permission semantics and denies edit, move, delete, and execute requests before execution.",
      hint: "Plan-mode writes and shell commands are rejected through app-server approval handling.",
      support: {
        kind: "runtime-code",
        references: [
          "src/main/lib/codex/app-server-approval.ts",
          "src/main/lib/trpc/routers/codex.ts",
        ],
      },
    }),
    capability({
      id: "quickChatAssistant",
      status: "supported",
      scope: "runtime-neutral",
      reason:
        "Codex folderless quick chats derive assistant controls from desktop preflight and deny non-web app-server approval requests through fail-closed handlers.",
      hint: "Quick chat permits web search/fetch tools only; attach a project before using file, shell, MCP, or runtime tools.",
      support: {
        kind: "runtime-code",
        references: [
          "src/main/lib/agent-runtime/permission-policy.ts",
          "src/main/lib/codex/tool-permission.ts",
          "src/main/lib/codex/app-server-approval.ts",
          "tests/codex-tool-permission.test.ts",
          "tests/codex-app-server-approval.test.ts",
        ],
      },
    }),
    capability({
      id: "scopeExpansion",
      status: "supported",
      scope: "runtime-neutral",
      reason:
        "Out-of-scope Codex guarded operations emit a scope-expansion event and are denied before the permission request is approved.",
      hint: "Approve the requested scope expansion, then retry the guarded run.",
      support: {
        kind: "locus-shared-layer",
        references: [
          "src/main/lib/agent-guard",
          "src/main/lib/codex/app-server-guarded-scope.ts",
        ],
      },
    }),
    capability({
      id: "askUserQuestion",
      status: "supported",
      scope: "runtime-neutral",
      reason:
        "Locus maps Codex app-server user-input and MCP elicitation requests to the shared desktop question UI contract, including pending, answer, timeout, and denial events.",
      hint: "Codex question requests remain blocking until the user answers, skips, or the request times out.",
      support: {
        kind: "runtime-code",
        references: [
          "src/main/lib/codex/ask-user-question.ts",
          "src/main/lib/codex/app-server-user-interaction.ts",
          "src/main/lib/trpc/routers/codex.ts",
        ],
      },
    }),
    capability({
      id: "rollback",
      status: "unsupported",
      scope: "unavailable",
      reason:
        "Codex session IDs are persisted, but rollback and fork are not wired through durable shared session references.",
      hint: "Do not expose Codex rollback or fork as runtime-neutral behavior yet.",
    }),
    capability({
      id: "mcpAuth",
      status: "supported",
      scope: "runtime-neutral",
      reason:
        "Codex runs preflight MCP needs-auth checks and blocks affected runs before provider work starts.",
      hint: "Authenticate the reported MCP server, then retry the Codex run.",
      support: {
        kind: "runtime-code",
        references: [
          "src/main/lib/trpc/routers/codex.ts",
          "src/main/lib/mcp-auth.ts",
        ],
      },
    }),
    capability({
      id: "mcpConfiguration",
      status: "degraded",
      scope: "runtime-specific",
      reason:
        "Codex can resolve app/global and project MCP state, but parity for all shared configuration operations is incomplete.",
      hint: "Keep Codex MCP configuration surfaces tied to explicit capability state.",
    }),
    capability({
      id: "providerProfiles",
      status: "supported",
      scope: "runtime-neutral",
      reason:
        "Codex accepts renderer-safe provider profile IDs, resolves gateway tokens in the main process, and redacts provider secrets from errors and logs.",
      hint: "Renderer callers should pass only the provider profile ID.",
      support: {
        kind: "runtime-code",
        references: [
          "src/main/lib/provider-profiles",
          "src/main/lib/trpc/routers/codex.ts",
        ],
      },
    }),
    capability({
      id: "attachments",
      status: "supported",
      scope: "runtime-neutral",
      reason:
        "Codex resolves image attachments in the main process, prepends long-text attachments through the shared local attachment store, and includes file-content parts in the prompt.",
      hint: "Unsupported attachment references fail before provider work starts.",
      support: {
        kind: "locus-shared-layer",
        references: [
          "src/main/lib/chat-attachments.ts",
          "src/main/lib/long-text-attachments.ts",
          "src/main/lib/trpc/routers/codex.ts",
        ],
      },
    }),
    capability({
      id: "usageMetadata",
      status: "supported",
      scope: "runtime-specific",
      reason:
        "Codex polls session token_count events and emits normalized token and context metadata when available without inventing missing values.",
      hint: "Missing Codex usage fields are omitted rather than reported as zero.",
      support: {
        kind: "runtime-code",
        references: ["src/main/lib/trpc/routers/codex.ts"],
      },
    }),
    capability({
      id: "runtimePlugins",
      status: "degraded",
      scope: "runtime-specific",
      reason:
        "Codex runtime plugin execution remains blocked: app-server exposes global plugin inventory and accepts a no-turn thread/start with fail-closed plugin config keys, but no managed turn proof shows plugin execution or Locus-controlled per-run filtering.",
      hint: "Keep Codex plugin execute controls blocked until a managed-run proof covers plugin turn execution and app-server per-run enforcement.",
    }),
    capability({
      id: "runtimeCommands",
      status: "unsupported",
      scope: "unavailable",
      reason:
        "Codex runtime command invocation is not yet implemented for command-guide or chat command surfaces.",
      hint: "Disable Codex command execution controls until command parity is implemented.",
    }),
    capability({
      id: "runtimeWorkflows",
      status: "unsupported",
      scope: "unavailable",
      reason:
        "Claude Dynamic Workflows have no Codex-equivalent adapter or shared workflow layer yet.",
      hint: "Keep workflow parity out of Codex until implemented or explicitly rescoped.",
    }),
    capability({
      id: "appAgents",
      status: "degraded",
      scope: "runtime-specific",
      reason:
        "Codex Locus Agent mentions are prompt-prepared, but runtime-neutral execution and limitation reporting are incomplete.",
      hint: "Do not count prompt injection alone as Locus Agent parity.",
    }),
  ],
})

const QWEN_CODE_RUNTIME_MANIFEST = manifest({
  runtimeId: "qwen-code",
  label: "Qwen Code",
  description:
    "Qwen Code ACP spike support through a flag-gated local ACP client adapter. Capability claims stay conservative until the adapter is proven end to end.",
  capabilities: [
    capability({
      id: "hardToolGuard",
      status: "degraded",
      scope: "runtime-neutral",
      reason:
        "Qwen ACP file-edit permission requests are mapped through Locus approval decisions, but shell, MCP, and out-of-scope guard parity are not fully proven yet.",
      hint: "Keep Qwen guarded runs behind the Qwen runtime flag until broader tool classes are verified.",
    }),
    capability({
      id: "planMode",
      status: "degraded",
      scope: "runtime-neutral",
      reason:
        "Qwen plan mode can receive Locus read-only policy intent, but ACP-side write denial behavior still needs adapter proof.",
      hint: "Do not expose Qwen plan mode as parity until write and shell denial are observed.",
    }),
    capability({
      id: "quickChatAssistant",
      status: "degraded",
      scope: "runtime-neutral",
      reason:
        "Folderless Qwen runs can use desktop preflight policy, but the ACP permission path has not yet proven quick-chat tool denial parity.",
      hint: "Keep folderless Qwen runs limited to the spike path.",
    }),
    capability({
      id: "scopeExpansion",
      status: "degraded",
      scope: "runtime-neutral",
      reason:
        "Qwen can reuse Locus guarded scope expansion state only after ACP permission requests are mapped into the shared guard owner.",
      hint: "Treat Qwen scope expansion as incomplete until denied out-of-scope writes produce the shared event flow.",
    }),
    capability({
      id: "askUserQuestion",
      status: "degraded",
      scope: "runtime-neutral",
      reason:
        "Qwen permission approval prompts use the shared AskUserQuestion event path, but arbitrary Qwen user-input question flows are not mapped as a general runtime feature.",
      hint: "Treat Qwen questions as permission approvals until a non-permission question flow is verified.",
    }),
    capability({
      id: "rollback",
      status: "unsupported",
      scope: "unavailable",
      reason:
        "Qwen ACP session identifiers are not mapped to durable Locus rollback or fork references.",
      hint: "Hide rollback and fork controls for Qwen.",
    }),
    capability({
      id: "mcpAuth",
      status: "degraded",
      scope: "runtime-neutral",
      reason:
        "Locus can preflight shared MCP auth state before a Qwen run, but Qwen-specific MCP auth handoff is not proven.",
      hint: "Authenticate MCP servers through existing Locus flows before retrying Qwen runs.",
    }),
    capability({
      id: "mcpConfiguration",
      status: "degraded",
      scope: "runtime-specific",
      reason:
        "Qwen MCP configuration passing is limited to the ACP spike and does not yet cover shared configuration editing parity.",
      hint: "Keep Qwen MCP setup attached to explicit spike diagnostics.",
    }),
    capability({
      id: "providerProfiles",
      status: "degraded",
      scope: "runtime-specific",
      reason:
        "Qwen authentication is expected to come from local Qwen config or main-process environment, not shared provider profile execution parity.",
      hint: "Do not send provider secrets to the renderer or treat Qwen as provider-profile ready.",
    }),
    capability({
      id: "attachments",
      status: "degraded",
      scope: "runtime-neutral",
      reason:
        "The spike can reuse Locus attachment preflight, but ACP prompt part mapping for Qwen has not been proven across image and long-text inputs.",
      hint: "Start Qwen validation with text prompts before enabling attachment-heavy flows.",
    }),
    capability({
      id: "usageMetadata",
      status: "degraded",
      scope: "runtime-specific",
      reason:
        "Qwen ACP usage metadata, if emitted, has not been normalized into Locus token and context usage events.",
      hint: "Omit missing Qwen usage fields rather than reporting zero.",
    }),
    capability({
      id: "runtimePlugins",
      status: "unsupported",
      scope: "unavailable",
      reason:
        "Qwen runtime-native plugin execution is outside the ACP spike.",
      hint: "Keep runtime plugin controls hidden for Qwen.",
    }),
    capability({
      id: "runtimeCommands",
      status: "unsupported",
      scope: "unavailable",
      reason:
        "Qwen runtime command invocation is outside the ACP spike.",
      hint: "Keep runtime command controls hidden for Qwen.",
    }),
    capability({
      id: "runtimeWorkflows",
      status: "unsupported",
      scope: "unavailable",
      reason:
        "Qwen workflow execution has no adapter or shared workflow mapping.",
      hint: "Keep workflow controls hidden for Qwen.",
    }),
    capability({
      id: "appAgents",
      status: "degraded",
      scope: "runtime-specific",
      reason:
        "Locus Agent prompt preparation may be reusable for Qwen, but runtime-native agent execution and limitation reporting are incomplete.",
      hint: "Do not count prompt injection alone as Qwen Locus Agent parity.",
    }),
  ],
})

const KUN_RUNTIME_MANIFEST = manifest({
  runtimeId: "kun",
  label: "Kun",
  description:
    "Flag-gated Kun HTTP/SSE runtime support. Capability claims stay conservative until each behavior is wired through Locus-owned policy and runtime adapters.",
  capabilities: [
    capability({
      id: "hardToolGuard",
      status: "supported",
      scope: "runtime-neutral",
      reason:
        "Kun command_execution and file_change approval requests are normalized into the shared guard owner for hash-approved guarded runs; no bless or hash mismatch falls back to file-only workspace-write with shell unavailable.",
      hint: "Approve the current Kun executable hash and run with a guarded scope before using Kun shell.",
      support: {
        kind: "locus-shared-layer",
        references: [
          "src/main/lib/kun/kun-http-sse-adapter.ts",
          "src/main/lib/kun/kun-cli-status.ts",
          "src/main/lib/agent-guard/decision.ts",
          "tests/kun-http-sse-adapter.test.ts",
          "tests/agent-guard-runtime-pipeline.test.ts",
        ],
      },
    }),
    capability({
      id: "planMode",
      status: "degraded",
      scope: "runtime-specific",
      reason:
        "Kun native create_plan is auto-policy and bypasses approval; Locus does not yet own a plan artifact or approval boundary for Kun plan mode.",
      hint: "Expose Kun plan details as runtime output only until a separate plan-mode contract is implemented.",
    }),
    capability({
      id: "quickChatAssistant",
      status: "degraded",
      scope: "runtime-specific",
      reason:
        "Kun folderless and project runs need the HTTP/SSE adapter before quick-chat parity can be claimed.",
      hint: "Keep Kun quick-chat entry points hidden unless the runtime flag is enabled and the adapter is available.",
    }),
    capability({
      id: "scopeExpansion",
      status: "degraded",
      scope: "runtime-neutral",
      reason:
        "Kun can reuse Locus workspace scopes only after approval requests are mapped into the shared guard owner.",
      hint: "Treat out-of-scope Kun edits as denied until the shared guard emits a scoped approval.",
    }),
    capability({
      id: "askUserQuestion",
      status: "degraded",
      scope: "runtime-specific",
      reason:
        "Kun approval prompts can map to Locus approval UI, but arbitrary runtime question events are not mapped as a general user-input feature.",
      hint: "Treat Kun questions as tool approvals until non-approval questions are verified.",
    }),
    capability({
      id: "rollback",
      status: "unsupported",
      scope: "unavailable",
      reason:
        "Kun thread and turn identifiers are not mapped to durable Locus rollback or fork references.",
      hint: "Hide rollback and fork controls for Kun.",
    }),
    capability({
      id: "mcpAuth",
      status: "degraded",
      scope: "runtime-neutral",
      reason:
        "Locus can preflight shared MCP auth state before a Kun run, but Kun-specific MCP auth handoff is not implemented.",
      hint: "Authenticate MCP servers through existing Locus flows before retrying Kun runs.",
    }),
    capability({
      id: "mcpConfiguration",
      status: "degraded",
      scope: "runtime-specific",
      reason:
        "Kun MCP configuration parity with Locus-managed MCP settings is not implemented for the first BYO adapter.",
      hint: "Keep Kun MCP setup attached to explicit runtime diagnostics.",
    }),
    capability({
      id: "providerProfiles",
      status: "supported",
      scope: "runtime-neutral",
      reason:
        "Kun provider-profile runs synthesize a scoped Locus responses-gateway config, stream through the selected profile, and clean up the config and token at run end.",
      hint: "Use a Kun-target provider profile; BYO config remains the fallback when no profile is selected.",
      support: {
        kind: "locus-shared-layer",
        references: [
          "src/main/lib/kun/kun-provider-config.ts",
          "src/main/lib/provider-profiles/gateway.ts",
          "src/main/lib/trpc/routers/agent-runtime.ts",
          "tests/kun-provider-config.test.ts",
          "tests/provider-gateway-scope.test.ts",
          "tests/provider-routing-ux.test.ts",
        ],
      },
    }),
    capability({
      id: "attachments",
      status: "degraded",
      scope: "runtime-neutral",
      reason:
        "Kun prompt input can reuse Locus attachment preflight, but HTTP/SSE prompt-part mapping for image and long-text inputs is not proven.",
      hint: "Start Kun validation with text prompts before enabling attachment-heavy flows.",
    }),
    capability({
      id: "usageMetadata",
      status: "degraded",
      scope: "runtime-specific",
      reason:
        "Kun usage metadata, if emitted, has not been normalized into Locus token and context usage events.",
      hint: "Omit missing Kun usage fields rather than reporting zero.",
    }),
    capability({
      id: "runtimePlugins",
      status: "unsupported",
      scope: "unavailable",
      reason:
        "Kun runtime-native plugin execution is outside the BYO HTTP/SSE adapter.",
      hint: "Keep runtime plugin controls hidden for Kun.",
    }),
    capability({
      id: "runtimeCommands",
      status: "unsupported",
      scope: "unavailable",
      reason:
        "Kun command-guide and chat command invocation are outside the first BYO HTTP/SSE adapter.",
      hint: "Keep runtime command controls hidden for Kun.",
    }),
    capability({
      id: "runtimeWorkflows",
      status: "unsupported",
      scope: "unavailable",
      reason:
        "Kun workflow execution has no adapter or shared workflow mapping.",
      hint: "Keep workflow controls hidden for Kun.",
    }),
    capability({
      id: "appAgents",
      status: "degraded",
      scope: "runtime-specific",
      reason:
        "Locus Agent prompt preparation may be reusable for Kun, but runtime-native agent execution and limitation reporting are incomplete.",
      hint: "Do not count prompt injection alone as Kun Locus Agent parity.",
    }),
  ],
})

const AGENT_RUNTIME_MANIFESTS: Record<
  AgentRuntimeId,
  AgentRuntimeCapabilityManifest
> = {
  "claude-code": CLAUDE_RUNTIME_MANIFEST,
  codex: CODEX_RUNTIME_MANIFEST,
  "qwen-code": QWEN_CODE_RUNTIME_MANIFEST,
  kun: KUN_RUNTIME_MANIFEST,
}

export function getAgentRuntimeCapabilityManifests(input: {
  includeExperimental?: boolean
} = {}): AgentRuntimeCapabilityManifest[] {
  const runtimeIds = input.includeExperimental
    ? AGENT_RUNTIME_IDS
    : CONTRACT_RUNTIME_IDS
  return runtimeIds.map((runtimeId) =>
    cloneManifest(AGENT_RUNTIME_MANIFESTS[runtimeId]),
  )
}

export function getAgentRuntimeCapabilityManifest(
  runtime: AgentRuntimeAlias,
): AgentRuntimeCapabilityManifest {
  const runtimeId = toAgentRuntimeId(runtime)
  if (!runtimeId) {
    throw new Error(`Unknown agent runtime: ${runtime}`)
  }
  return cloneManifest(AGENT_RUNTIME_MANIFESTS[runtimeId])
}

export function resolveAgentRuntimeCapabilityManifest(
  runtime: AgentRuntimeAlias | string | null | undefined,
): AgentRuntimeManifestLookup {
  const runtimeId = toAgentRuntimeId(runtime)
  if (!runtimeId) {
    const diagnostic = buildAgentRuntimeUnavailableDiagnostic(
      runtime ?? "unknown",
    )
    return {
      ok: false,
      runtimeId: diagnostic.runtimeId,
      diagnostic,
    }
  }

  return {
    ok: true,
    runtimeId,
    manifest: cloneManifest(AGENT_RUNTIME_MANIFESTS[runtimeId]),
  }
}

export function getAgentRuntimeCapability(
  runtime: AgentRuntimeAlias,
  capabilityId: AgentRuntimeCapabilityId,
): AgentRuntimeCapability {
  const manifest = getAgentRuntimeCapabilityManifest(runtime)
  const capability = manifest.capabilities.find(
    (candidate) => candidate.id === capabilityId,
  )
  if (!capability) {
    throw new Error(
      `Unknown ${manifest.runtimeId} runtime capability: ${capabilityId}`,
    )
  }
  return cloneCapability(capability)
}

export function buildAgentRuntimeCapabilityDiagnostic(input: {
  runtime: AgentRuntimeAlias
  capabilityId: AgentRuntimeCapabilityId
  message?: string
  hint?: string | null
}): AgentRuntimeCapabilityDiagnostic {
  const runtimeId = toAgentRuntimeId(input.runtime)
  if (!runtimeId) {
    throw new Error(`Unknown agent runtime: ${input.runtime}`)
  }
  const capability = getAgentRuntimeCapability(runtimeId, input.capabilityId)
  const message =
    input.message ||
    `${AGENT_RUNTIME_MANIFESTS[runtimeId].label} ${capability.label} is ${capability.status}. ${capability.reason}`

  assertNoSecretText(
    message,
    `${runtimeId} ${capability.id} diagnostic message`,
  )

  return {
    type: "unsupported-capability",
    runtimeId,
    capability: capability.id,
    status: capability.status,
    scope: capability.scope,
    message,
    reason: capability.reason,
    hint: input.hint ?? capability.hint,
  }
}

export function buildAgentRuntimeUnavailableDiagnostic(
  runtimeId: string,
): AgentRuntimeUnavailableDiagnostic {
  return {
    type: "unavailable-runtime",
    runtimeId,
    message: `Agent runtime ${runtimeId} is not registered.`,
    hint: "Choose a registered runtime and retry.",
  }
}

export function checkAgentRuntimeCapability(input: {
  runtime: AgentRuntimeAlias
  capabilityId: AgentRuntimeCapabilityId
}): AgentRuntimeCapabilityGate {
  const runtimeId = toAgentRuntimeId(input.runtime)
  if (!runtimeId) {
    throw new Error(`Unknown agent runtime: ${input.runtime}`)
  }
  const capability = getAgentRuntimeCapability(runtimeId, input.capabilityId)
  if (capability.status === "supported") {
    return {
      ok: true,
      runtimeId,
      capability,
    }
  }

  return {
    ok: false,
    runtimeId,
    capability,
    diagnostic: buildAgentRuntimeCapabilityDiagnostic({
      runtime: runtimeId,
      capabilityId: input.capabilityId,
    }),
  }
}

export function resolveAgentRuntimeCapability(input: {
  runtime: AgentRuntimeAlias | string | null | undefined
  capabilityId: AgentRuntimeCapabilityId
}): AgentRuntimeCapabilityLookup {
  const runtimeId = toAgentRuntimeId(input.runtime)
  if (!runtimeId) {
    const diagnostic = buildAgentRuntimeUnavailableDiagnostic(
      input.runtime ?? "unknown",
    )
    return {
      ok: false,
      runtimeId: diagnostic.runtimeId,
      diagnostic,
    }
  }

  return checkAgentRuntimeCapability({
    runtime: runtimeId,
    capabilityId: input.capabilityId,
  })
}

export function isRuntimeCapabilitySupported(
  runtime: AgentRuntimeAlias,
  capabilityId: AgentRuntimeCapabilityId,
): boolean {
  return checkAgentRuntimeCapability({ runtime, capabilityId }).ok
}

export function getAgentRunRequiredCapabilityIds(input: {
  mode?: "plan" | "agent"
  workspaceKind?: "project" | "folderless"
  hasScopeContract?: boolean
}): AgentRuntimeCapabilityId[] {
  if (input.workspaceKind === "folderless") return ["quickChatAssistant"]

  const ids: AgentRuntimeCapabilityId[] = []
  if (input.hasScopeContract) ids.push("hardToolGuard")
  if (input.mode === "plan") ids.push("planMode")
  return [...new Set(ids)]
}
