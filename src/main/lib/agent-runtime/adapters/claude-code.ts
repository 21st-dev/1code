import { eq } from "drizzle-orm"
import { getClaudeShellEnvironment, resolveClaudeCodeExecutable } from "../../claude/env"
import { getExistingClaudeToken } from "../../claude-token"
import {
  anthropicAccounts,
  anthropicSettings,
  claudeCodeCredentials,
  getDatabase,
} from "../../db"
import { getAgentRuntimeManifest } from "../manifests"
import {
  createUnsupportedAgentRuntimeControlResult,
  createUnsupportedAgentRuntimeReceipt,
  streamUnsupportedAgentRuntimeRun,
} from "../runtime-run-ledger"
import type {
  AgentRuntimeAdapter,
  AgentRuntimeAvailability,
  AgentRuntimeHealth,
  AgentRuntimeSessionRef,
  AgentRuntimeStartRequest,
} from "../types"

function getClaudeStoredAuthMethod(): "oauth" | null {
  try {
    const db = getDatabase()
    const settings = db
      .select()
      .from(anthropicSettings)
      .where(eq(anthropicSettings.id, "singleton"))
      .get()

    if (settings?.activeAccountId) {
      const account = db
        .select()
        .from(anthropicAccounts)
        .where(eq(anthropicAccounts.id, settings.activeAccountId))
        .get()
      if (account?.oauthToken) return "oauth"
    }

    const credential = db
      .select()
      .from(claudeCodeCredentials)
      .where(eq(claudeCodeCredentials.id, "default"))
      .get()

    return credential?.oauthToken ? "oauth" : null
  } catch {
    return null
  }
}

function getClaudeShellAuthMethod(): "api-key" | "shell-config" | null {
  try {
    const shellEnv = getClaudeShellEnvironment()
    if (shellEnv.ANTHROPIC_API_KEY || shellEnv.ANTHROPIC_AUTH_TOKEN) {
      return "api-key"
    }
    if (shellEnv.ANTHROPIC_BASE_URL) {
      return "shell-config"
    }
  } catch {
    return null
  }

  return null
}

async function inspectClaudeRuntime(): Promise<AgentRuntimeHealth> {
  const manifest = getAgentRuntimeManifest("claude-code")
  const executable = resolveClaudeCodeExecutable()

  if (executable.reason && executable.source === "bundled") {
    return {
      availability: "not-installed",
      statusReason: executable.reason,
      authMethod: "unknown",
      models: manifest.models?.map((model) => ({
        ...model,
        availability: "not-installed",
        reason: executable.reason,
      })),
    }
  }

  const authMethod =
    getClaudeStoredAuthMethod() ??
    getClaudeShellAuthMethod() ??
    (getExistingClaudeToken() ? "oauth" : null)

  if (!authMethod) {
    return {
      availability: "needs-auth",
      statusReason: "Claude Code is installed but no OAuth token, API key, or proxy config was found.",
      authMethod: "not-authenticated",
      models: manifest.models?.map((model) => ({
        ...model,
        availability: "needs-auth",
        reason: "Claude Code authentication is required.",
      })),
    }
  }

  return {
    availability: "available",
    statusReason: `Claude Code auth detected via ${authMethod}; executable: ${executable.source}.`,
    authMethod,
    models: manifest.models?.map((model) => ({
      ...model,
      availability: "available",
    })),
  }
}

function unsupportedClaudeRun(
  action: "start" | "resume",
  request: AgentRuntimeStartRequest,
) {
  return createUnsupportedAgentRuntimeReceipt({
    action,
    request,
    reason:
      "Claude Code lifecycle is still owned by the existing SDK transport; the unified Moss adapter bridge is not connected yet.",
  })
}

export const claudeCodeAdapter: AgentRuntimeAdapter = {
  manifest: getAgentRuntimeManifest("claude-code"),
  async inspect(
    _session: AgentRuntimeSessionRef,
  ): Promise<AgentRuntimeHealth> {
    return inspectClaudeRuntime()
  },
  async canStart(
    _session: AgentRuntimeSessionRef,
  ): Promise<AgentRuntimeAvailability> {
    return (await inspectClaudeRuntime()).availability
  },
  async start(request) {
    return unsupportedClaudeRun("start", request)
  },
  async resume(request) {
    return unsupportedClaudeRun("resume", request)
  },
  stream(request) {
    return streamUnsupportedAgentRuntimeRun(unsupportedClaudeRun("start", request))
  },
  async stop(request) {
    return createUnsupportedAgentRuntimeControlResult(
      request,
      "Claude Code unified stop requires the SDK transport bridge slice.",
    )
  },
  async submitToolResult(request) {
    return createUnsupportedAgentRuntimeControlResult(
      request,
      "Claude Code unified tool result submission requires the SDK transport bridge slice.",
    )
  },
}
