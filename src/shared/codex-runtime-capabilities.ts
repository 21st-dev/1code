import {
  buildAgentRuntimeCapabilityDiagnostic,
  getAgentRunRequiredCapabilityIds,
  getAgentRuntimeCapability,
  getAgentRuntimeCapabilityManifest,
  type AgentRuntimeCapability,
  type AgentRuntimeCapabilityId,
  type AgentRuntimeCapabilityStatus,
} from "./agent-runtime-capabilities"

export type CodexRuntimeCapabilityStatus = AgentRuntimeCapabilityStatus
export type CodexRuntimeCapabilityId = AgentRuntimeCapabilityId
export type CodexRuntimeCapability = AgentRuntimeCapability
export type CodexRuntimeCapabilityAdapterSource = "codex-app-server"
export type CodexRuntimeCapabilityProviderAuthMode =
  | "app-managed"
  | "provider-profile"
  | "runtime-managed"

export type CodexRuntimeCapabilityAdapterContext =
  | CodexRuntimeCapabilityAdapterSource
  | {
      adapterSource: CodexRuntimeCapabilityAdapterSource
      providerAuthMode?: CodexRuntimeCapabilityProviderAuthMode | null
    }

export type CodexRuntimeCapabilityBlocker = {
  capability: CodexRuntimeCapabilityId
  status: CodexRuntimeCapabilityStatus
  message: string
  hint: string | null
  reason: string
}

export type CodexCapabilityErrorChunk = {
  type: "capability-error"
  runtime: "codex"
  capability: CodexRuntimeCapabilityId
  errorText: string
  blocker: CodexRuntimeCapabilityBlocker
}

export function getCodexRuntimeCapabilities(): CodexRuntimeCapability[] {
  return getAgentRuntimeCapabilityManifest("codex").capabilities
}

type CodexAdapterCapabilityOverride = Omit<
  CodexRuntimeCapability,
  "id" | "label"
>

const CODEX_APP_SERVER_HARD_TOOL_GUARD_DEGRADED: CodexAdapterCapabilityOverride =
  {
    status: "degraded",
    scope: "runtime-specific",
    reason:
      "Codex app-server guarded runs fail closed and use the shared permission policy, but full controlled-edit support depends on an explicit provider auth context with matching smoke evidence.",
    hint: "Pass provider auth context before presenting app-server hard-tool-guard as supported; unknown app-server auth context stays degraded.",
    support: null,
  }

const CODEX_APP_SERVER_HARD_TOOL_GUARD_PROVEN: CodexAdapterCapabilityOverride =
  {
    status: "supported",
    scope: "runtime-neutral",
    reason:
      "Codex app-server guarded runs fail closed, use the shared permission policy, and now have direct/app-managed plus provider-profile gateway smoke evidence for Locus-controlled guarded edits through the explicit controlled-edit executor gate.",
    hint: "App-server controlled edits remain behind LOCUS_CODEX_APP_SERVER_CONTROLLED_EDIT_EXECUTOR and require a known provider auth mode.",
    support: {
      kind: "runtime-code",
      references: [
        "src/main/lib/codex/app-server-controlled-edit.ts",
        "src/main/lib/codex/app-server-approval.ts",
        "tests/codex-app-server-adapter.test.ts",
        "openspec/changes/add-locus-controlled-edit-executor-for-codex-app-server/adoption-probe-evidence.md",
      ],
    },
  }

const CODEX_APP_SERVER_CAPABILITY_OVERRIDES: Partial<
  Record<CodexRuntimeCapabilityId, CodexAdapterCapabilityOverride>
> = {
  hardToolGuard: CODEX_APP_SERVER_HARD_TOOL_GUARD_DEGRADED,
  planMode: {
    status: "supported",
    scope: "runtime-neutral",
    reason:
      "The shared permission-policy owner maps Codex app-server plan mode to a fail-closed approval gate.",
    hint: "Plan-mode app-server runs remain blocked if approval enforcement is missing or delayed.",
    support: {
      kind: "runtime-code",
      references: [
        "src/main/lib/agent-runtime/permission-policy.ts",
        "tests/agent-runtime-permission-policy.test.ts",
      ],
    },
  },
  scopeExpansion: {
    status: "degraded",
    scope: "runtime-specific",
    reason:
      "Codex app-server guarded-scope startup fails closed without a validated scope contract, but runtime scope-expansion retry events are not proven on a live transport yet.",
    hint: "Keep app-server scope expansion degraded until a transport test proves the full request, denial, expansion, and retry loop.",
    support: null,
  },
  askUserQuestion: {
    status: "supported",
    scope: "runtime-neutral",
    reason:
      "Codex app-server user-input and MCP elicitation requests map to the existing AskUserQuestion pending, result, and timeout event contract.",
    hint: "Question answers are redacted from renderer-visible result chunks when marked secret.",
    support: {
      kind: "runtime-code",
      references: [
        "src/main/lib/codex/app-server-user-interaction.ts",
        "tests/codex-app-server-user-interaction.test.ts",
      ],
    },
  },
  rollback: {
    status: "unsupported",
    scope: "unavailable",
    reason:
      "Codex app-server rollback and fork remain unsupported until Locus has durable shared-session references and a local file rollback policy.",
    hint: "Schema presence alone must not enable rollback or fork.",
    support: null,
  },
  mcpAuth: {
    status: "degraded",
    scope: "runtime-specific",
    reason:
      "Shared MCP preflight still owns auth blocking, but app-server MCP readiness and auth handoff are not proven on the app-server transport yet.",
    hint: "Do not report app-server MCP auth as fully supported until readiness and auth handoff tests pass.",
    support: null,
  },
  mcpConfiguration: {
    status: "degraded",
    scope: "runtime-specific",
    reason:
      "Codex app-server can consume existing Codex MCP config and materializable registry installs through the shared Runtime MCP Config service, but registry proof is limited to readiness and tool inventory because post-execution MCP tool-result observability is not available.",
    hint: "Offer Codex registry install only for targets the Runtime MCP Config service can materialize, and cap status below Verified on Codex until post-execution tool-result proof exists.",
    support: null,
  },
  providerProfiles: {
    status: "supported",
    scope: "runtime-neutral",
    reason:
      "Codex app-server provider-profile binding uses main-process gateway tokens in allowlisted runtime env and exposes only client env-key references.",
    hint: "Renderer callers must continue to pass only provider profile IDs.",
    support: {
      kind: "runtime-code",
      references: [
        "src/main/lib/codex/app-server-provider-binding.ts",
        "tests/codex-app-server-provider-binding.test.ts",
      ],
    },
  },
  attachments: {
    status: "supported",
    scope: "runtime-neutral",
    reason:
      "Codex app-server input mapping accepts main-process resolved image data and prepared long-text prompt blocks while rejecting unresolved local refs.",
    hint: "Unsupported or unresolved attachments fail before app-server startup.",
    support: {
      kind: "runtime-code",
      references: [
        "src/main/lib/codex/app-server-attachments.ts",
        "tests/codex-app-server-attachments.test.ts",
      ],
    },
  },
  usageMetadata: {
    status: "supported",
    scope: "runtime-specific",
    reason:
      "Codex app-server token usage notifications map to normalized usage and context metadata events without fabricating missing values.",
    hint: "Missing app-server usage fields are omitted rather than reported as zero.",
    support: {
      kind: "runtime-code",
      references: [
        "src/main/lib/codex/app-server-stream-events.ts",
        "tests/codex-app-server-stream-events.test.ts",
      ],
    },
  },
  runtimePlugins: {
    status: "degraded",
    scope: "runtime-specific",
    reason:
      "Codex app-server exposes global plugin inventory and accepts no-turn thread/start with Locus-built fail-closed plugin config keys, but runtime-native plugin turn execution and per-run filtering have not been proven by the proof matrix yet.",
    hint: "Keep Codex plugin packages disabled until app-server plugin loading is proven to honor Locus per-run controls during a managed turn.",
    support: {
      kind: "runtime-code",
      references: [
        "src/main/lib/codex/app-server-plugin-allowlist.ts",
        "src/main/lib/codex/app-server-plugin-config.ts",
        "src/main/lib/codex/app-server-plugin-proof.ts",
        "scripts/probe-codex-app-server-plugin-protocol.ts",
        "tests/codex-app-server-plugin-allowlist.test.ts",
        "tests/codex-app-server-plugin-config.test.ts",
        "tests/codex-app-server-plugin-proof.test.ts",
      ],
    },
  },
  runtimeCommands: {
    status: "unsupported",
    scope: "unavailable",
    reason:
      "Codex app-server runtime command invocation is not implemented for command-guide or chat command surfaces.",
    hint: "Disable app-server command execution controls until command parity is implemented.",
    support: null,
  },
  runtimeWorkflows: {
    status: "unsupported",
    scope: "unavailable",
    reason: "Codex app-server has no implemented shared workflow adapter.",
    hint: "Keep workflow parity out of Codex app-server until implemented or explicitly rescoped.",
    support: null,
  },
  appAgents: {
    status: "degraded",
    scope: "runtime-specific",
    reason:
      "Codex Locus Agent mentions can be prompt-prepared, but runtime-neutral app-server execution and limitation reporting are incomplete.",
    hint: "Do not count prompt preparation alone as app-server Locus Agent support.",
    support: null,
  },
}

function normalizeAdapterContext(input: CodexRuntimeCapabilityAdapterContext): {
  adapterSource: CodexRuntimeCapabilityAdapterSource
  providerAuthMode?: CodexRuntimeCapabilityProviderAuthMode | null
} {
  return typeof input === "string" ? { adapterSource: input } : input
}

function getAppServerCapabilityOverrides(input: {
  providerAuthMode?: CodexRuntimeCapabilityProviderAuthMode | null
}): Partial<Record<CodexRuntimeCapabilityId, CodexAdapterCapabilityOverride>> {
  const hardToolGuard =
    input.providerAuthMode === "app-managed" ||
    input.providerAuthMode === "runtime-managed" ||
    input.providerAuthMode === "provider-profile"
      ? CODEX_APP_SERVER_HARD_TOOL_GUARD_PROVEN
      : CODEX_APP_SERVER_HARD_TOOL_GUARD_DEGRADED
  return {
    ...CODEX_APP_SERVER_CAPABILITY_OVERRIDES,
    hardToolGuard,
  }
}

export function getCodexRuntimeCapabilitiesForAdapter(
  adapterContext: CodexRuntimeCapabilityAdapterContext,
): CodexRuntimeCapability[] {
  const context = normalizeAdapterContext(adapterContext)
  const overrides = getAppServerCapabilityOverrides(context)
  return getCodexRuntimeCapabilities().map((capability) => ({
    ...capability,
    ...overrides[capability.id],
    id: capability.id,
    label: capability.label,
  }))
}

export function getCodexRuntimeCapability(
  id: CodexRuntimeCapabilityId,
): CodexRuntimeCapability {
  return getAgentRuntimeCapability("codex", id)
}

export function buildCodexRuntimeCapabilityErrorChunk(input: {
  capability: CodexRuntimeCapability
  message?: string
  hint?: string | null
}): CodexCapabilityErrorChunk {
  const diagnostic = buildAgentRuntimeCapabilityDiagnostic({
    runtime: "codex",
    capabilityId: input.capability.id,
    message: input.message,
    hint: input.hint,
  })
  const blocker: CodexRuntimeCapabilityBlocker = {
    capability: input.capability.id,
    status: input.capability.status,
    message: diagnostic.message,
    hint: diagnostic.hint,
    reason: diagnostic.reason,
  }

  return {
    type: "capability-error",
    runtime: "codex",
    capability: input.capability.id,
    errorText: blocker.hint
      ? `${blocker.message} ${blocker.hint}`
      : blocker.message,
    blocker,
  }
}

export function getCodexRunRequiredCapability(input: {
  mode?: "plan" | "agent"
  hasScopeContract?: boolean
}): CodexRuntimeCapability | null {
  const [capabilityId] = getAgentRunRequiredCapabilityIds(input)
  return capabilityId ? getCodexRuntimeCapability(capabilityId) : null
}
