import {
  installMcpRegistryTarget,
  type McpRegistryInstallInput,
  type McpRegistryInstallResult,
} from "./install"
import {
  type McpRegistryEntry,
  normalizeOfficialMcpRegistryEntry,
} from "./normalize"
import {
  createOfficialMcpRegistryProvider,
  type OfficialMcpRegistryDetailInput,
  type OfficialMcpRegistryListInput,
  type OfficialMcpRegistryProvider,
} from "./official-provider"
import {
  buildMcpRegistryInstallPreview,
  buildMcpRegistryInstallPreviews,
  type McpRegistryInstallPreview,
} from "./preview"
import type {
  McpRegistryRuntimeSetupResolutions,
} from "./installability"
import type { McpRegistrySetupResolutionInput } from "./setup"

export type McpRegistryService = {
  listEntries: (input?: OfficialMcpRegistryListInput) => Promise<{
    entries: McpRegistryEntry[]
    metadata: { nextCursor?: string | null; count?: number }
  }>
  searchEntries: (
    input: Omit<OfficialMcpRegistryListInput, "search"> & { search: string },
  ) => Promise<{
    entries: McpRegistryEntry[]
    metadata: { nextCursor?: string | null; count?: number }
  }>
  getEntryDetail: (input: OfficialMcpRegistryDetailInput) => Promise<{
    entry: McpRegistryEntry
    previews: McpRegistryInstallPreview[]
  }>
  previewEntryInstall: (
    input: OfficialMcpRegistryDetailInput & { targetId: string },
  ) => Promise<McpRegistryInstallPreview>
  installEntry: (
    input: OfficialMcpRegistryDetailInput & {
      targetId: string
      runtime: McpRegistryInstallInput["runtime"]
      scope: McpRegistryInstallInput["scope"]
      projectPath?: McpRegistryInstallInput["projectPath"]
      installName?: McpRegistryInstallInput["installName"]
      resolvedSetup?: McpRegistryInstallInput["resolvedSetup"]
    },
  ) => Promise<McpRegistryInstallResult>
}

export type CreateMcpRegistryServiceOptions = {
  provider?: OfficialMcpRegistryProvider
  writeClaudeConfig?: McpRegistryInstallInput["writeClaudeConfig"]
  writeCodexConfig?: McpRegistryInstallInput["writeCodexConfig"]
  resolveCodexRuntimeAuthenticated?: () => boolean | Promise<boolean>
}

async function defaultResolveCodexRuntimeAuthenticated(): Promise<boolean> {
  const [{ getCodexIntegrationStatus }, { getCodexApiKeyStatus }] =
    await Promise.all([
      import("../codex/integration-status"),
      import("../codex/api-key-store"),
    ])
  const apiKeyStatus = getCodexApiKeyStatus()
  if (apiKeyStatus.hasApiKey) return true

  try {
    const integration = await getCodexIntegrationStatus()
    return integration.isConnected
  } catch {
    return false
  }
}

function stripRendererRuntimeAuthenticated(
  resolvedSetup: McpRegistrySetupResolutionInput | undefined,
): McpRegistrySetupResolutionInput | undefined {
  if (!resolvedSetup) return undefined
  const { runtimeAuthenticated: _ignored, ...rest } = resolvedSetup
  return rest
}

function withCodexRuntimeAuthenticated(
  resolvedSetup: McpRegistrySetupResolutionInput | undefined,
  runtimeAuthenticated: boolean,
): McpRegistrySetupResolutionInput {
  return {
    ...(stripRendererRuntimeAuthenticated(resolvedSetup) ?? {}),
    runtimeAuthenticated,
  }
}

export function createMcpRegistryService(
  options: CreateMcpRegistryServiceOptions = {},
): McpRegistryService {
  const provider = options.provider ?? createOfficialMcpRegistryProvider()
  const resolveCodexRuntimeAuthenticated =
    options.resolveCodexRuntimeAuthenticated ??
    defaultResolveCodexRuntimeAuthenticated

  const getDefaultSetupResolutions =
    async (): Promise<McpRegistryRuntimeSetupResolutions> => ({
      codex: {
        runtimeAuthenticated: await resolveCodexRuntimeAuthenticated(),
      },
    })

  const normalizeList = async (input?: OfficialMcpRegistryListInput) => {
    const result = await provider.listServers(input)
    return {
      entries: result.servers.map(normalizeOfficialMcpRegistryEntry),
      metadata: result.metadata,
    }
  }

  const getEntryDetail: McpRegistryService["getEntryDetail"] = async (
    input,
  ) => {
    const entry = normalizeOfficialMcpRegistryEntry(
      await provider.getServerDetail(input),
    )
    const resolvedSetup = await getDefaultSetupResolutions()
    return {
      entry,
      previews: buildMcpRegistryInstallPreviews({ entry, resolvedSetup }),
    }
  }

  return {
    listEntries: normalizeList,
    async searchEntries(input) {
      const result = await provider.searchServers(input)
      return {
        entries: result.servers.map(normalizeOfficialMcpRegistryEntry),
        metadata: result.metadata,
      }
    },
    getEntryDetail,
    async previewEntryInstall(input) {
      const { targetId, ...detailInput } = input
      const { entry } = await getEntryDetail(detailInput)
      const target = entry.installTargets.find(
        (candidate) => candidate.id === targetId,
      )
      if (!target) {
        throw new Error("MCP registry install target was not found.")
      }
      return buildMcpRegistryInstallPreview({
        entry,
        target,
        resolvedSetup: await getDefaultSetupResolutions(),
      })
    },
    async installEntry(input) {
      const { targetId, ...detailInput } = input
      const { entry } = await getEntryDetail(detailInput)
      const target = entry.installTargets.find(
        (candidate) => candidate.id === targetId,
      )
      if (!target) {
        throw new Error("MCP registry install target was not found.")
      }
      return installMcpRegistryTarget({
        entry,
        target,
        runtime: input.runtime,
        scope: input.scope,
        projectPath: input.projectPath,
        installName: input.installName,
        resolvedSetup:
          input.runtime === "codex"
            ? withCodexRuntimeAuthenticated(
                input.resolvedSetup,
                await resolveCodexRuntimeAuthenticated(),
              )
            : stripRendererRuntimeAuthenticated(input.resolvedSetup),
        writeClaudeConfig: options.writeClaudeConfig,
        writeCodexConfig: options.writeCodexConfig,
      })
    },
  }
}
