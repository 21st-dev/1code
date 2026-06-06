import * as electron from "electron"
import {
  type ClaudeAgentSdkIsolatedConfig,
  resolveClaudeAgentSdkIsolatedConfig,
} from "./agent-sdk-config-dir"
import {
  prepareClaudeAgentSdkRuntimeStartupEnvironment,
  type PrepareClaudeAgentSdkRuntimeStartupEnvironmentInput,
} from "./env"
import {
  prepareClaudeAgentSdkOllamaStartupDiagnostics,
} from "./agent-sdk-ollama-diagnostics"

type PrepareClaudeAgentSdkOllamaStartupDiagnostics =
  typeof prepareClaudeAgentSdkOllamaStartupDiagnostics

export type PrepareClaudeAgentSdkRuntimeStartupContextInput = Omit<
  PrepareClaudeAgentSdkRuntimeStartupEnvironmentInput,
  "isolatedConfigDir"
> & {
  chatId: string
  subChatId: string
  isUsingOllama: boolean
  getUserDataDir?: () => string
}

export type PreparedClaudeAgentSdkRuntimeStartupContext = ReturnType<
  typeof prepareClaudeAgentSdkRuntimeStartupEnvironment
> & {
  isolatedConfig: ClaudeAgentSdkIsolatedConfig
  isolatedConfigDir: string
}

export type PrepareClaudeAgentSdkRuntimeStartupDiagnosticsInput = {
  isUsingOllama: boolean
  customConfig?: { model?: string | null; baseUrl?: string | null } | null
  runtimeStartup: PreparedClaudeAgentSdkRuntimeStartupContext
  cwd: string
  resumeSessionId?: string | null
  prepareOllamaStartupDiagnostics?: PrepareClaudeAgentSdkOllamaStartupDiagnostics
}

export function prepareClaudeAgentSdkRuntimeStartupContext({
  chatId,
  subChatId,
  isUsingOllama,
  getUserDataDir = () => electron.app.getPath("userData"),
  ...environmentInput
}: PrepareClaudeAgentSdkRuntimeStartupContextInput): PreparedClaudeAgentSdkRuntimeStartupContext {
  const isolatedConfig = resolveClaudeAgentSdkIsolatedConfig({
    userDataDir: getUserDataDir(),
    chatId,
    subChatId,
    isUsingOllama,
  })
  const environment = prepareClaudeAgentSdkRuntimeStartupEnvironment({
    ...environmentInput,
    isolatedConfigDir: isolatedConfig.isolatedConfigDir,
  })

  return {
    ...environment,
    isolatedConfig,
    isolatedConfigDir: isolatedConfig.isolatedConfigDir,
  }
}

export async function prepareClaudeAgentSdkRuntimeStartupDiagnostics({
  isUsingOllama,
  customConfig,
  runtimeStartup,
  cwd,
  resumeSessionId,
  prepareOllamaStartupDiagnostics =
    prepareClaudeAgentSdkOllamaStartupDiagnostics,
}: PrepareClaudeAgentSdkRuntimeStartupDiagnosticsInput): Promise<void> {
  await prepareOllamaStartupDiagnostics({
    isUsingOllama,
    customConfig:
      customConfig?.model && customConfig.baseUrl
        ? {
            model: customConfig.model,
            baseUrl: customConfig.baseUrl,
          }
        : null,
    model: runtimeStartup.resolvedModel,
    baseUrl: runtimeStartup.finalEnv.ANTHROPIC_BASE_URL,
    cwd,
    configDir: runtimeStartup.isolatedConfigDir,
    hasAuthToken: !!runtimeStartup.finalEnv.ANTHROPIC_AUTH_TOKEN,
    resumeSessionId,
  })
}
