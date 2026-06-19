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
}

export type CreateMcpRegistryServiceOptions = {
  provider?: OfficialMcpRegistryProvider
}

export function createMcpRegistryService(
  options: CreateMcpRegistryServiceOptions = {},
): McpRegistryService {
  const provider = options.provider ?? createOfficialMcpRegistryProvider()

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
    return {
      entry,
      previews: buildMcpRegistryInstallPreviews({ entry }),
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
      return buildMcpRegistryInstallPreview({ entry, target })
    },
  }
}
