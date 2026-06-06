import path from "path"
import {
  redactClaudeProviderEnvValueForLog,
  type ClaudeProviderRuntimeConfig,
} from "./provider-runtime-config"

type Logger = {
  log: (...args: any[]) => void
}

export type ClaudeAgentSdkCredentialMetadataForLog = {
  source?: string | null
  storageFormat?: string | null
  refreshable?: boolean | null
  expiresAt?: string | null
}

export function logClaudeAgentSdkAuthDiagnostics(input: {
  hasExistingApiConfig: boolean
  claudeCodeToken?: string | null
  credentialMetadata?: ClaudeAgentSdkCredentialMetadataForLog | null
  finalEnv: Record<string, string | undefined>
  logger?: Logger
}): void {
  const logger = input.logger ?? console
  if (input.hasExistingApiConfig) {
    logger.log(
      `[claude] Using explicit Claude provider config - API_KEY: ${input.finalEnv.ANTHROPIC_API_KEY ? "set" : "not set"}, BASE_URL: ${redactClaudeProviderEnvValueForLog(input.finalEnv.ANTHROPIC_BASE_URL)}`,
    )
  }

  logger.log("[claude-auth] ========== AUTH METHOD USED ==========")
  logger.log(
    "[claude-auth] hasExistingApiConfig:",
    input.hasExistingApiConfig,
  )
  logger.log(
    "[claude-auth] claudeCodeToken available:",
    !!input.claudeCodeToken,
  )
  logger.log("[claude-auth] credential metadata:", {
    source: input.credentialMetadata?.source ?? null,
    storageFormat: input.credentialMetadata?.storageFormat ?? null,
    refreshable: input.credentialMetadata?.refreshable ?? false,
    expiresAt: input.credentialMetadata?.expiresAt ?? null,
  })
  logger.log(
    "[claude-auth] Using CLAUDE_CODE_OAUTH_TOKEN:",
    !!input.finalEnv.CLAUDE_CODE_OAUTH_TOKEN,
  )
  logger.log(
    "[claude-auth] Using ANTHROPIC_API_KEY:",
    !!input.finalEnv.ANTHROPIC_API_KEY,
  )
  logger.log(
    "[claude-auth] Using ANTHROPIC_BASE_URL:",
    redactClaudeProviderEnvValueForLog(input.finalEnv.ANTHROPIC_BASE_URL),
  )
  logger.log(
    "[claude-auth] Using ANTHROPIC_AUTH_TOKEN:",
    !!input.finalEnv.ANTHROPIC_AUTH_TOKEN,
  )
  logger.log("[claude-auth] ============================================")
}

export function logClaudeAgentSdkSessionDiagnostics(input: {
  subChatId: string
  cwd: string
  isolatedConfigDir: string
  resumeSessionId?: string | null
  existingSessionId?: string | null
  resumeAtUuid?: string | null
  shouldForkResume: boolean
  forkResumeAtUuid?: string | null
  logger?: Logger
}): void {
  const logger = input.logger ?? console
  const expectedSanitizedCwd = input.cwd.replace(/[/.]/g, "-")
  const expectedSessionPath = path.join(
    input.isolatedConfigDir,
    "projects",
    expectedSanitizedCwd,
    `${input.resumeSessionId}.jsonl`,
  )

  logger.log("[claude] ========== SESSION DEBUG ==========")
  logger.log(`[claude] subChatId: ${input.subChatId}`)
  logger.log(`[claude] cwd: ${input.cwd}`)
  logger.log(`[claude] sanitized cwd (expected): ${expectedSanitizedCwd}`)
  logger.log(`[claude] CLAUDE_CONFIG_DIR: ${input.isolatedConfigDir}`)
  logger.log(`[claude] Expected session path: ${expectedSessionPath}`)
  logger.log(`[claude] Session ID to resume: ${input.resumeSessionId}`)
  logger.log(`[claude] Existing sessionId from DB: ${input.existingSessionId}`)
  logger.log(`[claude] Resume at UUID: ${input.resumeAtUuid}`)
  logger.log(
    `[claude] Fork resume: ${input.shouldForkResume}, fork UUID: ${input.forkResumeAtUuid}`,
  )
  logger.log("[claude] ========== END SESSION DEBUG ==========")
}

export function logClaudeAgentSdkProviderDiagnostics(input: {
  cwd: string
  projectPath?: string
  mcpServers?: Record<string, any>
  finalCustomConfig?: ClaudeProviderRuntimeConfig
  isUsingOllama: boolean
  logger?: Logger
}): void {
  const logger = input.logger ?? console
  logger.log(
    `[SD] Query options - cwd: ${input.cwd}, projectPath: ${input.projectPath || "(not set)"}, mcpServers: ${input.mcpServers ? Object.keys(input.mcpServers).join(", ") : "(none)"}`,
  )
  if (!input.finalCustomConfig) {
    return
  }

  if (input.isUsingOllama) {
    logger.log(
      `[Ollama] Using offline mode - Model: ${input.finalCustomConfig.model}, Base URL: ${input.finalCustomConfig.baseUrl}`,
    )
    return
  }

  logger.log("[claude] Custom provider config:", {
    model: input.finalCustomConfig.model,
    baseUrl: input.finalCustomConfig.baseUrl,
    authMode: input.finalCustomConfig.authMode,
    hasToken: true,
  })
}

export function logClaudeAgentSdkStartupDiagnostics(input: {
  auth: {
    hasExistingApiConfig: boolean
    claudeCodeToken?: string | null
    credentialMetadata?: ClaudeAgentSdkCredentialMetadataForLog | null
    finalEnv: Record<string, string | undefined>
  }
  session: {
    subChatId: string
    cwd: string
    isolatedConfigDir: string
    resumeSessionId?: string | null
    existingSessionId?: string | null
    resumeAtUuid?: string | null
    shouldForkResume: boolean
    forkResumeAtUuid?: string | null
  }
  provider: {
    cwd: string
    projectPath?: string
    mcpServers?: Record<string, any>
    finalCustomConfig?: ClaudeProviderRuntimeConfig
    isUsingOllama: boolean
  }
  logger?: Logger
}): void {
  const logger = input.logger
  logClaudeAgentSdkAuthDiagnostics({
    ...input.auth,
    logger,
  })
  logClaudeAgentSdkSessionDiagnostics({
    ...input.session,
    logger,
  })
  logClaudeAgentSdkProviderDiagnostics({
    ...input.provider,
    logger,
  })
}
