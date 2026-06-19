import * as electron from "electron"
import {
  type ClaudeAgentSdkIsolatedConfig,
  type ClaudeAgentSdkNativePluginConfig,
  ensureClaudeAgentSdkIsolatedConfigDir,
  resolveClaudeAgentSdkIsolatedConfig,
} from "./agent-sdk-config-dir"
import { prepareClaudeAgentSdkOllamaStartupDiagnostics } from "./agent-sdk-ollama-diagnostics"
import {
  type PrepareClaudeAgentSdkRuntimeStartupEnvironmentInput,
  prepareClaudeAgentSdkRuntimeStartupEnvironment,
} from "./env"

type PrepareClaudeAgentSdkOllamaStartupDiagnostics =
  typeof prepareClaudeAgentSdkOllamaStartupDiagnostics
type EnsureClaudeAgentSdkIsolatedConfigDir =
  typeof ensureClaudeAgentSdkIsolatedConfigDir

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
  nativePluginConfigs: ClaudeAgentSdkNativePluginConfig[]
}

export type PrepareClaudeAgentSdkRuntimeStartupForDesktopRunInput =
  PrepareClaudeAgentSdkRuntimeStartupContextInput & {
    ensureIsolatedConfigDir?: EnsureClaudeAgentSdkIsolatedConfigDir
    error?: (...args: any[]) => void
  }

export type PreparedClaudeAgentSdkRuntimeStartupForDesktopRun = {
  runtimeStartup: PreparedClaudeAgentSdkRuntimeStartupContext
  isolatedConfigReady: boolean
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
    nativePluginConfigs: [],
  }
}

export async function prepareClaudeAgentSdkRuntimeStartupForDesktopRun({
  ensureIsolatedConfigDir = ensureClaudeAgentSdkIsolatedConfigDir,
  error = console.error,
  ...input
}: PrepareClaudeAgentSdkRuntimeStartupForDesktopRunInput): Promise<PreparedClaudeAgentSdkRuntimeStartupForDesktopRun> {
  const runtimeStartup = prepareClaudeAgentSdkRuntimeStartupContext(input)
  try {
    const isolatedConfigResult = await ensureIsolatedConfigDir(
      runtimeStartup.isolatedConfig,
    )
    return {
      runtimeStartup: {
        ...runtimeStartup,
        nativePluginConfigs: isolatedConfigResult?.nativePluginConfigs ?? [],
      },
      isolatedConfigReady: true,
    }
  } catch (startupErr) {
    error(`[claude] Failed to setup isolated config dir:`, startupErr)
    return {
      runtimeStartup,
      isolatedConfigReady: false,
    }
  }
}

export async function prepareClaudeAgentSdkRuntimeStartupDiagnostics({
  isUsingOllama,
  customConfig,
  runtimeStartup,
  cwd,
  resumeSessionId,
  prepareOllamaStartupDiagnostics = prepareClaudeAgentSdkOllamaStartupDiagnostics,
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
