export type CodexRuntimeCapabilityStatus =
  | "supported"
  | "degraded"
  | "unsupported"

export type CodexRuntimeCapabilityId =
  | "hardToolGuard"
  | "planMode"
  | "scopeExpansion"
  | "askUserQuestion"
  | "rollback"
  | "mcpAuth"
  | "mcpConfiguration"
  | "providerProfiles"
  | "attachments"
  | "usageMetadata"
  | "runtimePlugins"
  | "runtimeCommands"
  | "runtimeWorkflows"
  | "appAgents"

export type CodexRuntimeCapability = {
  id: CodexRuntimeCapabilityId
  label: string
  status: CodexRuntimeCapabilityStatus
  reason: string
  hint: string | null
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

const CODEX_RUNTIME_CAPABILITIES: readonly CodexRuntimeCapability[] = [
  {
    id: "hardToolGuard",
    label: "Hard tool guard",
    status: "supported",
    reason:
      "Locus installs an ACP permission handler before Codex prompts and maps permission requests to guarded-run decisions.",
    hint: "Guarded Codex runs fail closed if the ACP permission handler cannot be attached.",
  },
  {
    id: "planMode",
    label: "Plan mode enforcement",
    status: "supported",
    reason:
      "Locus maps Codex plan runs to ACP read-only mode and denies edit, move, delete, and execute permission requests before execution.",
    hint: "Plan-mode writes and shell commands are rejected through ACP permission handling.",
  },
  {
    id: "scopeExpansion",
    label: "Scope expansion approval",
    status: "supported",
    reason:
      "Out-of-scope Codex guarded operations emit a scope-expansion event and are denied before the permission request is approved.",
    hint: "Approve the requested scope expansion, then retry the guarded run.",
  },
  {
    id: "askUserQuestion",
    label: "Ask user question",
    status: "supported",
    reason:
      "Locus registers a Codex ACP host-side AskUserQuestion tool and bridges pending, answer, timeout, and denial events through the shared desktop question UI contract.",
    hint: "Codex question requests remain a blocking host tool call until the user answers, skips, or the request times out.",
  },
  {
    id: "rollback",
    label: "Rollback and fork",
    status: "unsupported",
    reason:
      "Codex session IDs are persisted, but rollback and fork are not wired through durable shared session references.",
    hint: "Do not expose Codex rollback or fork as runtime-neutral behavior yet.",
  },
  {
    id: "mcpAuth",
    label: "MCP auth",
    status: "supported",
    reason:
      "Codex runs preflight MCP needs-auth checks and blocks affected runs before provider work starts.",
    hint: "Authenticate the reported MCP server, then retry the Codex run.",
  },
  {
    id: "mcpConfiguration",
    label: "MCP configuration",
    status: "degraded",
    reason:
      "Codex can resolve app/global and project MCP state, but parity for all shared configuration operations is incomplete.",
    hint: "Keep Codex MCP configuration surfaces tied to explicit capability state.",
  },
  {
    id: "providerProfiles",
    label: "Provider profiles",
    status: "supported",
    reason:
      "Codex accepts renderer-safe provider profile IDs, resolves gateway tokens in the main process, and redacts provider secrets from errors and logs.",
    hint: "Renderer callers should pass only the provider profile ID.",
  },
  {
    id: "attachments",
    label: "Attachments",
    status: "supported",
    reason:
      "Codex resolves image attachments in the main process, prepends long-text attachments through the shared local attachment store, and includes file-content parts in the prompt.",
    hint: "Unsupported attachment references fail before provider work starts.",
  },
  {
    id: "usageMetadata",
    label: "Usage metadata",
    status: "supported",
    reason:
      "Codex polls session token_count events and emits normalized token and context metadata when available without inventing missing values.",
    hint: "Missing Codex usage fields are omitted rather than reported as zero.",
  },
  {
    id: "runtimePlugins",
    label: "Runtime plugins",
    status: "unsupported",
    reason:
      "Codex plugin entries are not yet executable through a runtime-native or shared Locus plugin layer.",
    hint: "Do not show plugin execute controls for Codex until an execution path exists.",
  },
  {
    id: "runtimeCommands",
    label: "Runtime commands",
    status: "unsupported",
    reason:
      "Codex runtime command invocation is not yet implemented for command-guide or chat command surfaces.",
    hint: "Disable Codex command execution controls until command parity is implemented.",
  },
  {
    id: "runtimeWorkflows",
    label: "Runtime workflows",
    status: "unsupported",
    reason:
      "Claude Dynamic Workflows have no Codex-equivalent adapter or shared workflow layer yet.",
    hint: "Keep workflow parity out of Codex until implemented or explicitly rescoped.",
  },
  {
    id: "appAgents",
    label: "App Agents and skills",
    status: "degraded",
    reason:
      "Codex App Agent mentions are prompt-prepared, but runtime-neutral execution and limitation reporting are incomplete.",
    hint: "Do not count prompt injection alone as App Agent parity.",
  },
]

export function getCodexRuntimeCapabilities(): CodexRuntimeCapability[] {
  return CODEX_RUNTIME_CAPABILITIES.map((capability) => ({ ...capability }))
}

export function getCodexRuntimeCapability(
  id: CodexRuntimeCapabilityId,
): CodexRuntimeCapability {
  const capability = CODEX_RUNTIME_CAPABILITIES.find(
    (candidate) => candidate.id === id,
  )
  if (!capability) {
    throw new Error(`Unknown Codex runtime capability: ${id}`)
  }
  return { ...capability }
}

export function buildCodexRuntimeCapabilityErrorChunk(input: {
  capability: CodexRuntimeCapability
  message?: string
  hint?: string | null
}): CodexCapabilityErrorChunk {
  const message =
    input.message ||
    `Codex ${input.capability.label} is ${input.capability.status}. ${input.capability.reason}`
  const blocker: CodexRuntimeCapabilityBlocker = {
    capability: input.capability.id,
    status: input.capability.status,
    message,
    hint: input.hint ?? input.capability.hint,
    reason: input.capability.reason,
  }

  return {
    type: "capability-error",
    runtime: "codex",
    capability: input.capability.id,
    errorText: blocker.hint ? `${blocker.message} ${blocker.hint}` : blocker.message,
    blocker,
  }
}

export function getCodexRunRequiredCapability(input: {
  mode?: "plan" | "agent"
  hasScopeContract?: boolean
}): CodexRuntimeCapability | null {
  if (input.hasScopeContract) {
    return getCodexRuntimeCapability("hardToolGuard")
  }
  if (input.mode === "plan") {
    return getCodexRuntimeCapability("planMode")
  }
  return null
}
