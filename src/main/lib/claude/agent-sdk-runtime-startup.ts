import * as electron from "electron"
import {
  type ClaudeAgentSdkIsolatedConfig,
  resolveClaudeAgentSdkIsolatedConfig,
} from "./agent-sdk-config-dir"
import {
  prepareClaudeAgentSdkRuntimeStartupEnvironment,
  type PrepareClaudeAgentSdkRuntimeStartupEnvironmentInput,
} from "./env"

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
