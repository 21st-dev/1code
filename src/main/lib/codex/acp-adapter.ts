import { createACPProvider, type ACPProvider } from "@mcpc-tech/acp-ai-provider"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { getRuntimeExecutableStatus } from "../runtime-executable"
import type { DesktopRunRequest } from "../agent-runtime/desktop-run-request"
import {
  buildCodexProviderEnv,
  buildCodexProviderProfileArgs,
  getCodexAuthMethodId,
  redactCodexProviderProfileArgs,
  type CodexProviderProfileBinding,
} from "./provider-runtime-binding"

type EnvSource = Record<string, string | undefined>

export type CodexAcpMcpServerForSession =
  | {
      name: string
      type: "stdio"
      command: string
      args: string[]
      env: Array<{ name: string; value: string }>
    }
  | {
      name: string
      type: "http"
      url: string
      headers: Array<{ name: string; value: string }>
    }

type CodexAcpProviderSession = {
  provider: ACPProvider
  cwd: string
  authFingerprint: string | null
  mcpFingerprint: string
  providerProfileId: string | null
}

export type GetOrCreateCodexAcpProviderInput = {
  runRequest: DesktopRunRequest
  command: string
  shellEnv?: EnvSource
  processEnv?: EnvSource
  mcpServers: CodexAcpMcpServerForSession[]
  mcpFingerprint: string
  appManagedApiKey?: string | null
  providerProfile?: CodexProviderProfileBinding
}

const providerSessions = new Map<string, CodexAcpProviderSession>()

function getAuthFingerprint(appManagedApiKey?: string | null): string | null {
  if (!appManagedApiKey) return null
  return createHash("sha256").update(appManagedApiKey).digest("hex")
}

export function getOrCreateCodexAcpProvider(
  params: GetOrCreateCodexAcpProviderInput,
): ACPProvider {
  const { context, permissionPolicy, session } = params.runRequest
  const authFingerprint = getAuthFingerprint(params.appManagedApiKey)
  const existing = providerSessions.get(context.subChatId)

  if (
    existing &&
    existing.cwd === context.cwd &&
    existing.authFingerprint === authFingerprint &&
    existing.mcpFingerprint === params.mcpFingerprint &&
    existing.providerProfileId === (params.providerProfile?.id ?? null)
  ) {
    return existing.provider
  }

  if (existing) {
    existing.provider.cleanup()
    providerSessions.delete(context.subChatId)
  }

  const hasAppManagedApiKey = Boolean(params.appManagedApiKey?.trim())
  // When app-managed key auth is used, avoid resuming older persisted session IDs.
  // Those can be tied to unauthenticated/CLI-auth state and trigger auth loops.
  const existingSessionIdForProvider = hasAppManagedApiKey
    ? undefined
    : session.resumeSessionId ?? undefined
  const providerProfileArgs = params.providerProfile
    ? buildCodexProviderProfileArgs(params.providerProfile)
    : undefined
  const authMethodId = getCodexAuthMethodId({
    appManagedApiKey: params.appManagedApiKey,
    providerProfile: params.providerProfile,
  })
  const providerSource = params.providerProfile
    ? "provider-profile"
    : hasAppManagedApiKey
      ? "codex-api-key"
      : "chatgpt"
  const commandStatus = getRuntimeExecutableStatus(
    params.command,
    "Codex ACP runtime must be executable before provider start.",
  )

  console.info("[codex-acp] starting provider", {
    subChatId: context.subChatId.slice(-8),
    command: params.command,
    commandOk: commandStatus.ok,
    commandError: commandStatus.error,
    cwd: context.cwd,
    cwdExists: existsSync(context.cwd),
    runId: params.runRequest.identity.runId,
    adapterSource: permissionPolicy.runtimeMapping.runtime === "codex"
      ? permissionPolicy.runtimeMapping.adapterSource
      : null,
    enforcement: permissionPolicy.enforcement,
    args: providerProfileArgs ? redactCodexProviderProfileArgs(providerProfileArgs) : [],
    authMethodId: authMethodId ?? null,
    providerSource,
    hasExistingSessionId: Boolean(existingSessionIdForProvider),
    mcpServerCount: params.mcpServers.length,
  })

  const provider = createACPProvider({
    command: params.command,
    env: buildCodexProviderEnv({
      processEnv: params.processEnv ?? process.env,
      shellEnv: params.shellEnv,
      appManagedApiKey: params.appManagedApiKey,
      providerGatewayToken: params.providerProfile?.token,
    }),
    ...(providerProfileArgs ? { args: providerProfileArgs } : {}),
    authMethodId,
    session: {
      cwd: context.cwd,
      mcpServers: params.mcpServers,
    },
    ...(existingSessionIdForProvider
      ? { existingSessionId: existingSessionIdForProvider }
      : {}),
    persistSession: true,
  })

  providerSessions.set(context.subChatId, {
    provider,
    cwd: context.cwd,
    authFingerprint,
    mcpFingerprint: params.mcpFingerprint,
    providerProfileId: params.providerProfile?.id ?? null,
  })

  return provider
}

export function cleanupCodexAcpProvider(subChatId: string): void {
  const existing = providerSessions.get(subChatId)
  if (!existing) return

  existing.provider.cleanup()
  providerSessions.delete(subChatId)
}

export function cleanupAllCodexAcpProviders(): void {
  for (const existing of providerSessions.values()) {
    existing.provider.cleanup()
  }
  providerSessions.clear()
}
